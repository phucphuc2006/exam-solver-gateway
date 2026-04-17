// ── Grok Web Bridge — Execution Pipeline ──

import { getGrokWebSession, upsertGrokWebSession } from "@/lib/localDb";
import {
  GROK_WEB_BASE_URL,
  GROK_WEB_DEFAULT_MODELS,
  normalizeString,
  createGrokError,
} from "./constants.js";
import {
  getSessionCookies,
  getSessionHeaders,
  isGrokSessionModeEnabled,
  getGrokConversationRotationInterval,
  getGrokConversationTurnCount,
  buildGrokProviderData,
  buildGrokReplayHeaders,
  validateAndStoreGrokWebSession,
} from "./session.js";
import {
  formatMessagesAsPrompt,
  validateGrokCompletionMessages,
  buildGrokConversationBody,
  uploadGrokMessageAttachments,
  collectGrokUploadedAttachmentIds,
} from "./promptBuilder.js";
import { parseGrokCompletionResponse } from "./responseParser.js";

// ── Ensure validated session ──

async function ensureValidatedGrokSession() {
  let session = await getGrokWebSession();
  if (!session) {
    throw createGrokError("Chưa có session Grok Web.", 404);
  }

  if (session.status !== "validated") {
    session = await validateAndStoreGrokWebSession();
  }

  return session;
}

// ── Main execution entry point ──

export async function executeGrokWebCompletion(body = {}, { onDelta, onFirstByte, onUpstreamReady } = {}) {
  const session = await ensureValidatedGrokSession();
  const cookies = getSessionCookies(session);
  const sessionHeaders = getSessionHeaders(session);
  const messages = validateGrokCompletionMessages(body.messages);
  await uploadGrokMessageAttachments(messages, { cookies, sessionHeaders });
  const prompt = formatMessagesAsPrompt(messages);
  const fileAttachments = collectGrokUploadedAttachmentIds(messages);
  const model = normalizeString(body.model) || GROK_WEB_DEFAULT_MODELS[0];
  const historySyncEnabled = session.historySyncEnabled === true;
  const sessionModeEnabled = isGrokSessionModeEnabled(session);
  const previousTurnCount = getGrokConversationTurnCount(session);
  const rotationInterval = getGrokConversationRotationInterval(session);
  const shouldRotateConversation = sessionModeEnabled
    && rotationInterval > 0
    && previousTurnCount >= rotationInterval;
  const conversationId = sessionModeEnabled && !shouldRotateConversation
    ? normalizeString(session.syncedConversationId)
    : "";
  const parentResponseId = sessionModeEnabled && !shouldRotateConversation
    ? normalizeString(session.syncedParentMessageId)
    : "";

  if (!prompt && fileAttachments.length === 0) {
    throw createGrokError("Grok Web cần ít nhất một message để gửi.", 400);
  }

  const requestPath = conversationId && parentResponseId
    ? `${GROK_WEB_BASE_URL}/conversations/${conversationId}/responses`
    : `${GROK_WEB_BASE_URL}/conversations/new`;
  const response = await fetch(requestPath, {
    method: "POST",
    headers: buildGrokReplayHeaders({
      cookies,
      sessionHeaders,
      headers: {
        accept: "*/*",
        "content-type": "application/json",
      },
    }),
    body: JSON.stringify(buildGrokConversationBody({
      session,
      model,
      prompt,
      fileAttachments,
      historySyncEnabled,
      parentResponseId,
    })),
  });

  await onUpstreamReady?.();

  if (response.status === 401 || response.status === 403) {
    throw createGrokError(
      "Grok Web từ chối session hiện tại. Hãy auto-connect lại bằng request chat thật từ Grok Web hoặc dán cookie mới từ request thật.",
      401,
    );
  }

  if (!response.ok) {
    throw createGrokError(`Grok Web upstream returned HTTP ${response.status}`, response.status);
  }

  const parsed = await parseGrokCompletionResponse(response, { onDelta, onFirstByte });
  if (!parsed.text) {
    throw createGrokError("Không parse được phản hồi Grok Web.", 502);
  }

  const nextSession = await upsertGrokWebSession({
    ...session,
    status: "validated",
    lastError: null,
    lastErrorAt: null,
    sessionModeEnabled,
    conversationTurnCount: sessionModeEnabled
      ? Math.max(1, (shouldRotateConversation ? 0 : previousTurnCount) + 1)
      : 0,
    syncedConversationId: sessionModeEnabled ? parsed.conversationId || conversationId || null : null,
    syncedParentMessageId: sessionModeEnabled ? parsed.responseId || parentResponseId || null : null,
    providerDataJson: JSON.stringify(buildGrokProviderData(session, { cookies })),
  });

  return {
    text: parsed.text,
    model,
    conversationId: parsed.conversationId,
    responseId: parsed.responseId,
    session: nextSession,
  };
}
