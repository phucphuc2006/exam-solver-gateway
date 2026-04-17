// ── ChatGPT Web Bridge — Constants & Shared Utilities ──

import crypto from "node:crypto";

// ── Public constants ──
export const CHATGPT_WEB_SESSION_ID = "chatgpt-web";
export const CHATGPT_WEB_PROVIDER = "chatgpt-web";
export const CHATGPT_WEB_CONVERSATION_URL = "https://chatgpt.com/backend-api/f/conversation";
export const CHATGPT_WEB_CONVERSATION_PREPARE_URL = "https://chatgpt.com/backend-api/f/conversation/prepare";
export const CHATGPT_WEB_CHAT_REQUIREMENTS_URL = "https://chatgpt.com/backend-api/sentinel/chat-requirements";
export const CHATGPT_WEB_MODELS_URL = "https://chatgpt.com/backend-api/models";
export const CHATGPT_WEB_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CHATGPT_WEB_FILES_URL = "https://chatgpt.com/backend-api/files";

// ── Internal constants ──
export const CHATGPT_WEB_CONVERSATION_HANDSHAKE_CACHE_TTL_MS = 45_000;
export const CHATGPT_WEB_RETRYABLE_HANDSHAKE_STATUSES = new Set([400, 401, 403, 409, 412, 422, 428]);

export const FORBIDDEN_CAPTURE_HEADERS = new Set([
  "cookie",
  "content-length",
  "host",
  "connection",
  "content-encoding",
  "transfer-encoding",
  "x-openai-target-path",
  "x-openai-target-route",
  "x-oai-turn-trace-id",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
]);

export const UNSUPPORTED_TOP_LEVEL_FIELDS = [
  "tools",
  "tool_choice",
  "functions",
  "function_call",
  "response_format",
  "audio",
  "file",
  "files",
  "modalities",
  "parallel_tool_calls",
  "json_schema",
  "input",
];

export const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

// ── Shared utility helpers ──

export function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeParseJson(value, fallback) {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function cloneJsonValue(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

export function buildValidationError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function isChatgptWebDebugEnabled() {
  const flag = normalizeString(process.env.DEBUG_CHATGPT_WEB).toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function getCurrentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function generateConversationEchoLogs() {
  const startedAt = Date.now();
  const checkpoint = startedAt + 120 + crypto.randomInt(20, 240);
  return `0,${startedAt},1,${checkpoint}`;
}
