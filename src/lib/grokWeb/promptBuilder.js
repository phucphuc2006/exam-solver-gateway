// ── Grok Web Bridge — Prompt Builder & Request Body ──

import { createAttachmentFallbackText, normalizeWebBridgeMessages } from "@/lib/webBridgeMessageParts";
import {
  GROK_WEB_BASE_URL,
  normalizeString,
  isPlainObject,
  cloneJsonValue,
  createGrokError,
  createGrokDeviceEnvInfo,
  readResponseTextSnippet,
} from "./constants.js";
import {
  getStoredGrokRequestTemplate,
  buildGrokReplayHeaders,
  getSessionCookies,
  getSessionHeaders,
} from "./session.js";

// ── Prompt formatting ──

export function formatMessagesAsPrompt(messages = []) {
  const normalized = Array.isArray(messages) ? messages : [];
  const lines = [];

  for (const message of normalized) {
    const role = normalizeString(message?.role || "user").toLowerCase();
    const content = normalizeString(message?.content);
    const fallbackText = Array.isArray(message?.attachments) && message.attachments.length > 0
      ? createAttachmentFallbackText(message.attachments)
      : "";
    const value = content || fallbackText;
    if (!value) continue;

    if (role === "system") {
      lines.push(`[SYSTEM]\n${value}`);
      continue;
    }

    const speaker = role === "assistant" ? "Assistant" : "User";
    lines.push(`${speaker}: ${value}`);
  }

  return lines.join("\n\n").trim();
}

// ── Message validation ──

export function validateGrokCompletionMessages(messages = []) {
  try {
    return normalizeWebBridgeMessages(messages, {
      providerLabel: "Grok Web bridge",
      allowImages: true,
      allowFiles: true,
    });
  } catch (error) {
    throw createGrokError(error.message || "Grok Web bridge nhan message khong hop le.", 400);
  }
}

// ── Conversation body builder ──

export function buildGrokConversationBody({
  session,
  model,
  prompt,
  fileAttachments = [],
  historySyncEnabled,
  parentResponseId = "",
}) {
  const template = getStoredGrokRequestTemplate(session);
  const baseBody = isPlainObject(template)
    ? cloneJsonValue(template, {})
    : {};

  baseBody.modelName = model;
  baseBody.message = prompt;
  baseBody.fileAttachments = Array.isArray(fileAttachments) ? fileAttachments : [];
  baseBody.imageAttachments = [];
  baseBody.disableSearch = baseBody.disableSearch === true;
  baseBody.enableImageGeneration = baseBody.enableImageGeneration !== false;
  baseBody.returnImageBytes = baseBody.returnImageBytes === true;
  baseBody.returnRawGrokInXaiRequest = baseBody.returnRawGrokInXaiRequest === true;
  baseBody.enableImageStreaming = baseBody.enableImageStreaming !== false;
  baseBody.imageGenerationCount = Number.isFinite(Number(baseBody.imageGenerationCount))
    ? Number(baseBody.imageGenerationCount)
    : 2;
  baseBody.forceConcise = baseBody.forceConcise === true;
  baseBody.toolOverrides = isPlainObject(baseBody.toolOverrides) ? baseBody.toolOverrides : {};
  baseBody.enableSideBySide = baseBody.enableSideBySide !== false;
  baseBody.sendFinalMetadata = baseBody.sendFinalMetadata !== false;
  baseBody.disableTextFollowUps = baseBody.disableTextFollowUps === true;
  baseBody.disableMemory = baseBody.disableMemory === true;
  baseBody.forceSideBySide = baseBody.forceSideBySide === true;
  baseBody.isAsyncChat = baseBody.isAsyncChat === true;
  baseBody.disableSelfHarmShortCircuit = baseBody.disableSelfHarmShortCircuit === true;
  baseBody.collectionIds = Array.isArray(baseBody.collectionIds) ? baseBody.collectionIds : [];
  baseBody.connectors = Array.isArray(baseBody.connectors) ? baseBody.connectors : [];
  baseBody.searchAllConnectors = baseBody.searchAllConnectors === true;
  baseBody.deviceEnvInfo = isPlainObject(baseBody.deviceEnvInfo)
    ? {
      ...createGrokDeviceEnvInfo(),
      ...baseBody.deviceEnvInfo,
    }
    : createGrokDeviceEnvInfo();

  if (parentResponseId) {
    baseBody.parentResponseId = parentResponseId;
    baseBody.skipCancelCurrentInflightRequests = true;
    delete baseBody.temporary;
    return baseBody;
  }

  delete baseBody.parentResponseId;
  delete baseBody.skipCancelCurrentInflightRequests;
  baseBody.temporary = historySyncEnabled !== true;
  baseBody.isPreset = baseBody.isPreset === true;
  baseBody.customPersonality = normalizeString(baseBody.customPersonality);
  baseBody.deepsearchPreset = normalizeString(baseBody.deepsearchPreset);
  baseBody.isReasoning = baseBody.isReasoning === true;
  return baseBody;
}

// ── Attachment upload ──

async function uploadGrokAttachment(attachment, { cookies, sessionHeaders } = {}) {
  const payload = {
    fileName: attachment?.filename || attachment?.name || `file-${Date.now()}`,
    fileMimeType: attachment?.mimeType || "application/octet-stream",
    content: attachment?.bytes?.toString("base64") || "",
  };

  if (!payload.content) {
    throw createGrokError("Grok Web bridge khong doc duoc noi dung attachment de upload.", 400);
  }

  const response = await fetch(`${GROK_WEB_BASE_URL}/upload-file`, {
    method: "POST",
    headers: buildGrokReplayHeaders({
      cookies,
      sessionHeaders,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    }),
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw createGrokError("Grok Web từ chối cookie hiện tại. Hãy lấy lại cookie mới.", 401);
  }

  if (!response.ok) {
    const detail = await readResponseTextSnippet(response);
    throw createGrokError(
      `Grok Web upload-file that bai (${response.status})${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  const uploaded = await response.json().catch(() => null);
  const fileMetadataId = normalizeString(uploaded?.fileMetadataId);
  if (!fileMetadataId) {
    throw createGrokError("Grok Web upload-file tra ve du lieu khong day du.", 502);
  }

  return {
    fileMetadataId,
    fileUri: normalizeString(uploaded?.fileUri),
  };
}

export async function uploadGrokMessageAttachments(messages = [], { cookies, sessionHeaders } = {}) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];

  for (const message of normalizedMessages) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      if (normalizeString(attachment?.upload?.fileMetadataId)) {
        continue;
      }

      attachment.upload = await uploadGrokAttachment(attachment, {
        cookies,
        sessionHeaders,
      });
    }
  }
}

export function collectGrokUploadedAttachmentIds(messages = []) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const ids = [];

  for (const message of normalizedMessages) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      const fileMetadataId = normalizeString(attachment?.upload?.fileMetadataId);
      if (fileMetadataId) {
        ids.push(fileMetadataId);
      }
    }
  }

  return ids;
}
