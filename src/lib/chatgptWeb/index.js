// ── ChatGPT Web Bridge — Re-export Index ──
// This file re-exports all public APIs from the modular chatgptWeb sub-modules
// to maintain backward compatibility with existing `import { ... } from "@/lib/chatgptWeb"`

// ── Constants & Utilities ──
export {
  CHATGPT_WEB_SESSION_ID,
  CHATGPT_WEB_PROVIDER,
  CHATGPT_WEB_CONVERSATION_URL,
  CHATGPT_WEB_CONVERSATION_PREPARE_URL,
  CHATGPT_WEB_CHAT_REQUIREMENTS_URL,
  CHATGPT_WEB_MODELS_URL,
  CHATGPT_WEB_USAGE_URL,
  CHATGPT_WEB_FILES_URL,
  CHATGPT_WEB_CONVERSATION_HANDSHAKE_CACHE_TTL_MS,
  CHATGPT_WEB_RETRYABLE_HANDSHAKE_STATUSES,
  FORBIDDEN_CAPTURE_HEADERS,
  UNSUPPORTED_TOP_LEVEL_FIELDS,
  ALLOWED_ROLES,
  normalizeString,
  isPlainObject,
  safeParseJson,
  nowIso,
  cloneJsonValue,
  buildValidationError,
  isChatgptWebDebugEnabled,
  getCurrentTimezone,
  generateConversationEchoLogs,
} from "./constants.js";

// ── Session Management ──
export {
  buildCookieHeader,
  parseCookieHeader,
  mergeCookieHeaders,
  getResponseSetCookieHeaders,
  appendCookieFromResponse,
  normalizeCapturedHeaders,
  normalizeCapturedCookies,
  removeAuthHeaders,
  decodeJwtPayload,
  getBearerTokenFromHeaders,
  hasBearerAuthorization,
  getChatgptWebAuthorizationError,
  getTargetPathFromUrl,
  normalizeTargetPath,
  extractCapturedTargetPath,
  isConversationTargetPath,
  shouldPreserveAuthForTargetPath,
  getChatgptWebCaptureMode,
  getChatgptWebCaptureTargetError,
  normalizeChatgptWebCaptureBundle,
  getStoredChatgptWebModels,
  getStoredChatgptWebRequestTemplate,
  isChatgptWebHistorySyncEnabled,
  isChatgptWebSessionModeEnabled,
  getChatgptWebConversationRotationInterval,
  getChatgptWebConversationTurnCount,
  getChatgptWebSyncedConversationState,
  getChatgptWebRequestTemplateError,
  redactChatgptWebSession,
  validateAndStoreChatgptWebSession,
} from "./session.js";

// ── Model Discovery ──
export {
  normalizeChatgptWebModels,
  resolveChatgptWebModel,
} from "./modelDiscovery.js";

// ── Replay & Fetch ──
export {
  createChatgptReplayContext,
  resolveChatgptWebConversationPath,
  buildChatgptWebUrl,
  buildChatgptWebReplayHeaders,
  fetchChatgptWeb,
  logChatgptConversationDebug,
  buildChatgptWebAttachmentMetadata,
  buildChatgptWebMessageContentParts,
  uploadChatgptWebMessageAttachments,
} from "./replay.js";

// ── Conversation Builder ──
export {
  validateChatgptWebRequest,
  buildConversationReplayPayload,
  buildConversationRequestBody,
  buildConversationPrepareBody,
  buildConversationHandshakeCacheKey,
  buildCapturedConversationHandshakeHeaders,
  canAttemptPrepareWithoutRefreshingRequirements,
  extractConversationHandshakeCachePayload,
  buildContinuationRequestTemplate,
  applyConversationPreparePayloadToHeaders,
} from "./conversationBuilder.js";

// ── Response Parser ──
export {
  parseConversationEvent,
  extractConversationEventError,
  extractConversationErrorMessage,
  extractConversationContinuationState,
  createOpenAiCompatibleConversationStreamResponse,
  convertChatgptConversationStreamToJson,
  convertChatgptConversationResponseToJson,
} from "./responseParser.js";

// ── Execution Pipeline ──
export {
  executeChatgptWebCompletion,
} from "./execution.js";
