// ── Gemini Web Bridge — Execution Pipeline ──
// Handles: session validation, model resolution, completion execution

import { getGeminiWebSession, upsertGeminiWebSession } from "@/lib/localDb";
import {
  GEMINI_WEB_BASE_HEADERS,
  GEMINI_WEB_GENERATE_URL,
  GEMINI_WEB_DEFAULT_MODELS,
  GEMINI_WEB_MODEL_PAYLOADS,
  normalizeString,
  createGeminiError,
} from "./constants.js";
import {
  buildCookieHeader,
  readGeminiProviderData,
  getSessionCookies,
  isGeminiSessionModeEnabled,
  getGeminiConversationRotationInterval,
  getGeminiConversationTurnCount,
  getGeminiHistoryContextIds,
  normalizeGeminiHistoryContextIds,
  buildGeminiProviderData,
  validateAndStoreGeminiWebSession,
} from "./session.js";
import {
  normalizeGeminiWebModel,
  formatMessagesAsPrompt,
  formatRawGeminiPromptFromBody,
  validateGeminiCompletionMessages,
  buildGeminiRequestPayload,
  buildGeminiUploadedFileList,
} from "./promptBuilder.js";
import {
  parseGeminiCompletionResponse,
  readResponseTextSnippet,
} from "./responseParser.js";
import { uploadGeminiMessageAttachments } from "./fileUpload.js";

// ── Ensure validated session ──

async function ensureGeminiValidatedSession() {
  let session = await getGeminiWebSession();
  if (!session) {
    throw createGeminiError("Chưa có session Gemini Web.", 404);
  }

  const providerData = readGeminiProviderData(session);
  const tokens = providerData?.tokens;
  if (!tokens?.snlm0e || !tokens?.bl) {
    session = await validateAndStoreGeminiWebSession();
  }

  return session;
}

// ── Main execution entry point ──

export async function executeGeminiWebCompletion(body = {}, { onDelta, onFirstByte, onUpstreamReady } = {}) {
  const session = await ensureGeminiValidatedSession();
  const cookies = getSessionCookies(session);
  const providerData = readGeminiProviderData(session) || {};
  const tokens = providerData.tokens || {};
  const requestedModel = normalizeGeminiWebModel(body.model) || GEMINI_WEB_DEFAULT_MODELS[0];
  const model = GEMINI_WEB_MODEL_PAYLOADS[requestedModel]
    ? requestedModel
    : "gemini-3.0-flash";
  const messages = validateGeminiCompletionMessages(body.messages);
  await uploadGeminiMessageAttachments(messages);
  const prompt = body?.__webBridgeRawMessagePassthrough === true
    ? formatRawGeminiPromptFromBody(body)
    : formatMessagesAsPrompt(messages);
  const uploads = buildGeminiUploadedFileList(messages);
  const historySyncEnabled = session.historySyncEnabled === true;
  const sessionModeEnabled = isGeminiSessionModeEnabled(session);
  const previousTurnCount = getGeminiConversationTurnCount(session);
  const rotationInterval = getGeminiConversationRotationInterval(session);
  const shouldRotateConversation = sessionModeEnabled
    && rotationInterval > 0
    && previousTurnCount >= rotationInterval;
  const historyContextIds = sessionModeEnabled && !shouldRotateConversation
    ? getGeminiHistoryContextIds(session)
    : ["", "", ""];

  if (!prompt && uploads.length === 0) {
    throw createGeminiError("Gemini Web cần ít nhất một message để gửi.", 400);
  }

  // Xây dựng modelConfig: ưu tiên hash dynamic từ session, fallback hardcode
  const baseModelConfig = GEMINI_WEB_MODEL_PAYLOADS[model];
  const dynamicHashes = tokens.modelHashes || null;
  let modelConfig;

  if (dynamicHashes && model === "gemini-3.1-pro" && dynamicHashes.pro) {
    modelConfig = { ...baseModelConfig, modelId: dynamicHashes.pro };
    if (dynamicHashes.pro !== baseModelConfig.modelId) {
      console.log(`[Gemini Web] Dùng hash Pro DYNAMIC: ${dynamicHashes.pro} (thay vì hardcode: ${baseModelConfig.modelId})`);
    }
  } else if (dynamicHashes && model === "gemini-3.0-flash-thinking" && dynamicHashes.thinking) {
    modelConfig = { ...baseModelConfig, modelId: dynamicHashes.thinking };
    if (dynamicHashes.thinking !== baseModelConfig.modelId) {
      console.log(`[Gemini Web] Dùng hash Thinking DYNAMIC: ${dynamicHashes.thinking} (thay vì hardcode: ${baseModelConfig.modelId})`);
    }
  } else {
    modelConfig = baseModelConfig;
  }

  console.log(`[Gemini Web] Sending model=${model}, modelId=${modelConfig.modelId || "(default/null)"}, snlm0e=${(tokens.snlm0e || "").length > 0 ? `present(${tokens.snlm0e.length}chars)` : "MISSING!"}`);

  const requestPayload = buildGeminiRequestPayload(prompt, {
    sid: tokens.sid || "",
    snlm0e: tokens.snlm0e || "",
    contextIds: historyContextIds,
    uploads,
    modelConfig,
  });

  const params = new URLSearchParams({
    ...requestPayload.params,
    bl: tokens.bl,
  });
  const form = new URLSearchParams({
    at: tokens.snlm0e,
    "f.req": JSON.stringify([null, JSON.stringify(requestPayload.innerRequest)]),
  });

  const formPayload = form.toString();
  const formBuffer = Buffer.from(formPayload, "utf-8");

  // === DEBUG: Kích thước thật sự gửi lên Google ===
  console.log(`[Gemini Web] 📊 PAYLOAD DEBUG:`);
  console.log(`[Gemini Web]   → Prompt length: ${prompt.length} chars`);
  console.log(`[Gemini Web]   → Prompt preview: ${prompt.slice(0, 300).replace(/\n/g, '\\n')}...`);
  console.log(`[Gemini Web]   → Form body size: ${(formBuffer.length / 1024).toFixed(1)} KB (${formBuffer.length} bytes)`);

  const response = await fetch(`${GEMINI_WEB_GENERATE_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      ...GEMINI_WEB_BASE_HEADERS,
      "x-goog-ext-525005358-jspb": `["${requestPayload.uuid}",1]`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "Content-Length": String(formBuffer.length),
      Cookie: buildCookieHeader(cookies),
    },
    body: formBuffer,
  });

  await onUpstreamReady?.();

  if (response.status === 401 || response.status === 403) {
    throw createGeminiError("Gemini Web từ chối session hiện tại. Hãy connect lại cookie mới.", 401);
  }

  if (response.status === 400) {
    const detail = await readResponseTextSnippet(response);
    throw createGeminiError(
      `Gemini Web từ chối request nội bộ. Có thể token phiên đã cũ hoặc payload attachment không còn khớp${detail ? `: ${detail}` : ""}`,
      400,
    );
  }

  if (!response.ok) {
    const detail = await readResponseTextSnippet(response);
    throw createGeminiError(
      `Gemini Web upstream returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const parsed = await parseGeminiCompletionResponse(response, { onDelta, onFirstByte });
  const nextHistoryContextIds = sessionModeEnabled
    ? normalizeGeminiHistoryContextIds([parsed.conversationId, parsed.responseId, parsed.choiceId])
    : ["", "", ""];
  const nextSession = await upsertGeminiWebSession({
    ...session,
    status: "validated",
    lastError: null,
    lastErrorAt: null,
    sessionModeEnabled,
    conversationTurnCount: sessionModeEnabled
      ? Math.max(1, (shouldRotateConversation ? 0 : previousTurnCount) + 1)
      : 0,
    providerDataJson: JSON.stringify(buildGeminiProviderData(session, {
      cookies,
      tokens,
      historyContextIds: nextHistoryContextIds,
    })),
    syncedConversationId: sessionModeEnabled ? nextHistoryContextIds[0] || null : null,
    syncedParentMessageId: sessionModeEnabled ? nextHistoryContextIds[1] || null : null,
  });

  return {
    text: parsed.text,
    model,
    session: nextSession,
  };
}
