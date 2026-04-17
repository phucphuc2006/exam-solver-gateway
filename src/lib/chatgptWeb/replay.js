// ── ChatGPT Web Bridge — Replay Headers & Fetch ──
// Handles: building replay headers, fetching from ChatGPT API, replay context,
// attachment upload, debug logging

import crypto from "node:crypto";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";
import {
  normalizeString,
  isPlainObject,
  safeParseJson,
  buildValidationError,
  isChatgptWebDebugEnabled,
  CHATGPT_WEB_FILES_URL,
} from "./constants.js";
import {
  buildCookieHeader,
  mergeCookieHeaders,
  removeAuthHeaders,
  hasBearerAuthorization,
  shouldPreserveAuthForTargetPath,
  getTargetPathFromUrl,
} from "./session.js";
import { createAttachmentFallbackText, normalizeWebBridgeMessages } from "@/lib/webBridgeMessageParts";

// ── Replay context ──

function normalizeReplayContext(replayContext = {}) {
  const normalized = {};

  for (const [rawKey, rawValue] of Object.entries(replayContext || {})) {
    const key = normalizeString(rawKey).toLowerCase();
    const value = normalizeString(rawValue);
    if (!key || !value) {
      continue;
    }
    normalized[key] = value;
  }

  return normalized;
}

export function createChatgptReplayContext(session, extraHeaders = {}) {
  const templateHeaders = safeParseJson(session?.headersJson, {});
  const mergedHeaders = {
    ...templateHeaders,
    ...Object.fromEntries(
      Object.entries(extraHeaders || {}).map(([key, value]) => [String(key).toLowerCase(), value]),
    ),
  };

  return {
    originator: normalizeString(mergedHeaders.originator) || "pi",
    "oai-device-id": normalizeString(mergedHeaders["oai-device-id"]) || crypto.randomUUID(),
    "oai-language": normalizeString(mergedHeaders["oai-language"]) || "en-US",
    "x-oai-turn-trace-id": crypto.randomUUID(),
  };
}

export function resolveChatgptWebConversationPath(session, extraHeaders = {}) {
  const templateHeaders = safeParseJson(session?.headersJson, {});
  const { extractCapturedTargetPath } = require("./session.js");
  const capturedTargetPath = extractCapturedTargetPath({
    captureUrl: session?.captureUrl,
    capturedTargetPath: session?.capturedTargetPath,
    headers: {
      ...templateHeaders,
      ...Object.fromEntries(
        Object.entries(extraHeaders || {}).map(([key, value]) => [String(key).toLowerCase(), value]),
      ),
    },
  });
  return capturedTargetPath === "/backend-api/conversation"
    ? "/backend-api/conversation"
    : "/backend-api/f/conversation";
}

export function buildChatgptWebUrl(path) {
  return new URL(path, "https://chatgpt.com").toString();
}

// ── Build replay headers ──

export function buildChatgptWebReplayHeaders(session, { stream = true, headers = {}, preserveAuth = false, replayContext = {} } = {}) {
  const templateHeaders = safeParseJson(session?.headersJson, {});
  const cookies = safeParseJson(session?.cookiesJson, []);
  const cookieStr = buildCookieHeader(cookies);
  const templateAuthorization = normalizeString(templateHeaders.authorization);
  const templateAccountId = normalizeString(
    templateHeaders["chatgpt-account-id"] || templateHeaders["x-chatgpt-account-id"],
  );
  const normalizedReplayContext = normalizeReplayContext(replayContext);

  const mergedHeaders = {
    ...(preserveAuth ? templateHeaders : removeAuthHeaders(templateHeaders)),
    ...Object.fromEntries(
      Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  };

  const mergedCookieStr = mergeCookieHeaders(cookieStr, normalizeString(mergedHeaders.cookie));
  const shouldPreferCookieOnly = !preserveAuth && Boolean(mergedCookieStr);
  const nextHeaders = shouldPreferCookieOnly ? removeAuthHeaders(mergedHeaders) : mergedHeaders;

  if (!preserveAuth && !cookieStr && templateAuthorization && !hasBearerAuthorization(nextHeaders)) {
    nextHeaders.authorization = templateAuthorization;
    if (templateAccountId && !nextHeaders["chatgpt-account-id"] && !nextHeaders["x-chatgpt-account-id"]) {
      nextHeaders["chatgpt-account-id"] = templateAccountId;
    }
  }

  if (!normalizeString(nextHeaders["content-type"])) {
    nextHeaders["content-type"] = "application/json";
  }
  if (!normalizeString(nextHeaders.accept)) {
    nextHeaders.accept = stream ? "text/event-stream" : "application/json";
  }
  nextHeaders.origin = nextHeaders.origin || "https://chatgpt.com";
  nextHeaders.referer = nextHeaders.referer || "https://chatgpt.com/";
  nextHeaders["user-agent"] = session?.userAgent || nextHeaders["user-agent"] || "Mozilla/5.0";
  nextHeaders.originator = normalizedReplayContext.originator || nextHeaders.originator || "pi";
  nextHeaders["oai-device-id"] = normalizedReplayContext["oai-device-id"] || nextHeaders["oai-device-id"] || crypto.randomUUID();
  nextHeaders["oai-language"] = normalizedReplayContext["oai-language"] || nextHeaders["oai-language"] || "en-US";
  if (normalizedReplayContext["x-oai-turn-trace-id"]) {
    nextHeaders["x-oai-turn-trace-id"] = normalizedReplayContext["x-oai-turn-trace-id"];
  }
  if (normalizedReplayContext["x-openai-target-path"]) {
    nextHeaders["x-openai-target-path"] = normalizedReplayContext["x-openai-target-path"];
  }
  if (normalizedReplayContext["x-openai-target-route"]) {
    nextHeaders["x-openai-target-route"] = normalizedReplayContext["x-openai-target-route"];
  }
  if (mergedCookieStr) {
    nextHeaders.cookie = mergedCookieStr;
  }

  if (!nextHeaders.authorization && !nextHeaders.cookie) {
    throw new Error("Session does not include replayable ChatGPT auth headers or cookies.");
  }

  return nextHeaders;
}

// ── Fetch ──

export async function fetchChatgptWeb(session, url, { method = "GET", body, headers = {}, stream = true, signal, replayContext = {} } = {}) {
  const targetPath = getTargetPathFromUrl(url);
  const normalizedReplayContext = {
    ...normalizeReplayContext(replayContext),
    ...(targetPath ? {
      "x-openai-target-path": targetPath,
      "x-openai-target-route": targetPath,
    } : {}),
  };

  return proxyAwareFetch(url, {
    method,
    headers: buildChatgptWebReplayHeaders(session, {
      stream,
      headers,
      preserveAuth: shouldPreserveAuthForTargetPath(targetPath),
      replayContext: normalizedReplayContext,
    }),
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    signal,
  });
}

function readResponseTextSnippet(response) {
  return response.text()
    .then((text) => normalizeString(text).slice(0, 300))
    .catch(() => "");
}

// ── Debug logging ──

function redactChatgptWebDebugValue(headerName, value) {
  const key = normalizeString(headerName).toLowerCase();
  const normalized = normalizeString(value);
  if (!normalized) {
    return normalized;
  }

  if (
    key === "authorization"
    || key === "cookie"
    || key.includes("token")
    || key.includes("sentinel")
  ) {
    if (normalized.length <= 12) {
      return "[redacted]";
    }
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  }

  return normalized;
}

export function logChatgptConversationDebug(body, headers, extra = {}) {
  if (!isChatgptWebDebugEnabled()) {
    return;
  }

  const safeBody = {
    action: normalizeString(body?.action) || "next",
    model: normalizeString(body?.model) || "auto",
    conversation_id: normalizeString(body?.conversation_id) || null,
    parent_message_id: normalizeString(body?.parent_message_id) || null,
    current_node: normalizeString(body?.current_node) || null,
    current_leaf_message_id: normalizeString(body?.current_leaf_message_id) || null,
    history_and_training_disabled: body?.history_and_training_disabled === true,
    timezone: normalizeString(body?.timezone) || null,
    timezone_offset_min: Number.isFinite(Number(body?.timezone_offset_min))
      ? Number(body.timezone_offset_min)
      : null,
    message_count: Array.isArray(body?.messages) ? body.messages.length : 0,
    message_roles: Array.isArray(body?.messages)
      ? body.messages.map((message) => normalizeString(message?.author?.role || message?.role || "unknown") || "unknown")
      : [],
    supported_encodings: Array.isArray(body?.supported_encodings) ? body.supported_encodings : [],
    force_use_sse: body?.force_use_sse === true,
    websocket_request_id: normalizeString(body?.websocket_request_id) || null,
    ...Object.fromEntries(
      Object.entries(extra || {}).map(([key, value]) => [key, value ?? null]),
    ),
  };

  const redactedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key, redactChatgptWebDebugValue(key, value)]),
  );

  console.error("====== CHATGPT WEB DEBUG ======");
  console.error("body:", JSON.stringify(safeBody, null, 2));
  console.error("headers:", JSON.stringify(redactedHeaders, null, 2));
  console.error("================================");
}

// ── Attachment upload ──

function getChatgptWebAttachmentUseCase(attachment) {
  return attachment?.kind === "image" ? "multimodal" : "my_files";
}

export function buildChatgptWebAttachmentMetadata(attachment = {}) {
  const uploaded = isPlainObject(attachment.upload) ? attachment.upload : {};
  const mimeType = normalizeString(uploaded.mimeType || attachment.mimeType) || "application/octet-stream";
  const metadata = {
    id: normalizeString(uploaded.fileId),
    name: normalizeString(uploaded.filename || attachment.filename || attachment.name),
    size: Number(uploaded.size || attachment.size || 0),
    mime_type: mimeType,
    mimeType,
    source: "local",
  };

  if (attachment.kind === "image") {
    const width = Number.isFinite(Number(attachment.width)) ? Number(attachment.width) : null;
    const height = Number.isFinite(Number(attachment.height)) ? Number(attachment.height) : null;
    if (width) metadata.width = width;
    if (height) metadata.height = height;
  }

  return metadata;
}

export function buildChatgptWebMessageContentParts(message = {}, textValue = "") {
  const sourceParts = Array.isArray(message.contentParts) ? message.contentParts : [];
  const parts = [];

  for (const part of sourceParts) {
    if (part?.type === "text") {
      parts.push(part.text ?? "");
      continue;
    }

    if (part?.kind === "image") {
      const uploaded = isPlainObject(part.upload) ? part.upload : null;
      const fileId = normalizeString(uploaded?.fileId);
      if (!fileId) {
        continue;
      }

      const imagePart = {
        content_type: "image_asset_pointer",
        asset_pointer: `file-service://${fileId}`,
        size_bytes: Number(uploaded.size || part.size || 0),
      };

      const width = Number.isFinite(Number(part.width)) ? Number(part.width) : null;
      const height = Number.isFinite(Number(part.height)) ? Number(part.height) : null;
      if (width) imagePart.width = width;
      if (height) imagePart.height = height;
      parts.push(imagePart);
    }
  }

  if (parts.length === 0) {
    const fallbackText = textValue || createAttachmentFallbackText(message.attachments);
    parts.push(fallbackText || "");
  }

  return parts;
}

async function createChatgptWebFileUpload(session, attachment, replayContext) {
  const response = await fetchChatgptWeb(session, CHATGPT_WEB_FILES_URL, {
    method: "POST",
    body: {
      file_name: attachment.filename || attachment.name || `file-${Date.now()}`,
      file_size: attachment.size || attachment.bytes?.length || 0,
      use_case: getChatgptWebAttachmentUseCase(attachment),
    },
    stream: false,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
    replayContext,
  });

  if (!response.ok) {
    const detail = await readResponseTextSnippet(response);
    throw buildValidationError(
      response.status,
      `ChatGPT Web tao file upload that bai (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  const payload = await response.json().catch(() => null);
  const fileId = normalizeString(payload?.file_id || payload?.id);
  const uploadUrl = normalizeString(payload?.upload_url);
  if (!fileId || !uploadUrl) {
    throw buildValidationError(502, "ChatGPT Web tra ve thong tin upload file khong day du.");
  }

  return {
    fileId,
    uploadUrl,
    filename: attachment.filename || attachment.name || `file-${Date.now()}`,
    mimeType: attachment.mimeType || "application/octet-stream",
    size: attachment.size || attachment.bytes?.length || 0,
  };
}

async function uploadChatgptWebFileBytes(uploadUrl, attachment) {
  const response = await proxyAwareFetch(uploadUrl, {
    method: "PUT",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": attachment.mimeType || "application/octet-stream",
      origin: "https://chatgpt.com",
      referer: "https://chatgpt.com/",
      "x-ms-blob-type": "BlockBlob",
      "x-ms-version": "2020-04-08",
    },
    body: attachment.bytes,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const detail = await readResponseTextSnippet(response);
    throw buildValidationError(
      response.status,
      `ChatGPT Web upload bytes that bai (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
}

async function finalizeChatgptWebFileUpload(session, fileId, replayContext) {
  const response = await fetchChatgptWeb(session, `${CHATGPT_WEB_FILES_URL}/${fileId}/uploaded`, {
    method: "POST",
    body: {},
    stream: false,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
    replayContext,
  });

  if (!response.ok) {
    const detail = await readResponseTextSnippet(response);
    throw buildValidationError(
      response.status,
      `ChatGPT Web finalize file that bai (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return response.json().catch(() => null);
}

async function uploadChatgptWebAttachment(session, attachment, replayContext) {
  const createdFile = await createChatgptWebFileUpload(session, attachment, replayContext);
  await uploadChatgptWebFileBytes(createdFile.uploadUrl, attachment);
  const uploadedPayload = await finalizeChatgptWebFileUpload(session, createdFile.fileId, replayContext);

  return {
    ...createdFile,
    downloadUrl: normalizeString(uploadedPayload?.download_url),
  };
}

export async function uploadChatgptWebMessageAttachments(session, messages = [], replayContext) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];

  for (const message of normalizedMessages) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      if (normalizeString(attachment?.upload?.fileId)) {
        continue;
      }
      attachment.upload = await uploadChatgptWebAttachment(session, attachment, replayContext);
    }
  }
}
