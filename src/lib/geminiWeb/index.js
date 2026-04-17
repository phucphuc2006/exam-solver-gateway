// ── Gemini Web Bridge — Re-export Index ──
// Backward compatible re-export for `import { ... } from "@/lib/geminiWeb"`

// ── Constants ──
export {
  GEMINI_WEB_PROVIDER,
  GEMINI_WEB_SESSION_ID,
  GEMINI_WEB_BASE_URL,
  GEMINI_WEB_APP_URL,
  GEMINI_WEB_GENERATE_URL,
  GEMINI_WEB_UPLOAD_URL,
  GEMINI_WEB_DEFAULT_MODELS,
  GEMINI_WEB_BASE_HEADERS,
  GEMINI_WEB_UPLOAD_HEADERS,
  GEMINI_WEB_MODEL_PAYLOADS,
  normalizeString,
  safeParseJson,
  nowIso,
  createGeminiError,
} from "./constants.js";

// ── Session & Cookie ──
export {
  buildCookieHeader,
  parseCookieHeaderString,
  normalizeGeminiCookies,
  serializeCookies,
  readGeminiProviderData,
  normalizeGeminiHistoryContextIds,
  getGeminiHistoryContextIds,
  isGeminiSessionModeEnabled,
  getGeminiConversationRotationInterval,
  getGeminiConversationTurnCount,
  buildGeminiProviderData,
  getSessionCookies,
  getStoredGeminiModels,
  redactGeminiWebSession,
  normalizeGeminiWebConnectPayload,
  validateAndStoreGeminiWebSession,
  fetchGeminiPageTokens,
} from "./session.js";

// ── Prompt Builder ──
export {
  normalizeGeminiWebModel,
  formatRawGeminiPromptFromBody,
  formatMessagesAsPrompt,
  validateGeminiCompletionMessages,
  buildGeminiRequestPayload,
  buildGeminiUploadedFileList,
} from "./promptBuilder.js";

// ── Response Parser ──
export {
  parseGeminiTokensFromPage,
  extractGeminiContext,
  parseGeminiGenerateResponse,
  parseGeminiCompletionResponse,
  readResponseTextSnippet,
} from "./responseParser.js";

// ── File Upload ──
export {
  uploadGeminiAttachmentResumable,
  uploadGeminiMessageAttachments,
} from "./fileUpload.js";

// ── Execution ──
export {
  executeGeminiWebCompletion,
} from "./execution.js";
