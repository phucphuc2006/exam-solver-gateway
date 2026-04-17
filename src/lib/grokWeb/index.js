// ── Grok Web Bridge — Re-export Index ──
// Backward compatible re-export for `import { ... } from "@/lib/grokWeb"`

// ── Constants ──
export {
  GROK_WEB_PROVIDER,
  GROK_WEB_SESSION_ID,
  GROK_WEB_BASE_URL,
  GROK_WEB_APP_URL,
  GROK_WEB_DEFAULT_MODELS,
  GROK_WEB_HEADERS,
  GROK_FORBIDDEN_CAPTURE_HEADERS,
  normalizeString,
  isPlainObject,
  safeParseJson,
  nowIso,
  cloneJsonValue,
  createGrokError,
  createGrokDeviceEnvInfo,
  readResponseTextSnippet,
} from "./constants.js";

// ── Session & Cookie ──
export {
  parseCookieHeaderString,
  buildCookieHeader,
  serializeCookies,
  normalizeGrokCookies,
  normalizeGrokCapturedHeaders,
  normalizeGrokRequestTemplate,
  readGrokProviderData,
  buildGrokProviderData,
  isGrokSessionModeEnabled,
  getGrokConversationRotationInterval,
  getGrokConversationTurnCount,
  getSessionCookies,
  getSessionHeaders,
  getStoredGrokRequestTemplate,
  getStoredGrokModels,
  buildGrokReplayHeaders,
  redactGrokWebSession,
  normalizeGrokWebConnectPayload,
  validateGrokSessionCookies,
  validateAndStoreGrokWebSession,
} from "./session.js";

// ── Prompt Builder ──
export {
  formatMessagesAsPrompt,
  validateGrokCompletionMessages,
  buildGrokConversationBody,
  uploadGrokMessageAttachments,
  collectGrokUploadedAttachmentIds,
} from "./promptBuilder.js";

// ── Response Parser ──
export {
  parseGrokStreamLines,
  parseGrokCompletionResponse,
} from "./responseParser.js";

// ── Execution ──
export {
  executeGrokWebCompletion,
} from "./execution.js";
