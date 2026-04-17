// ── Chat Handler — Barrel re-export ──
// Maintains backward compatibility: `import { handleChat } from "./chat"`

// Constants & detection helpers
export {
  WEB_BRIDGE_PROVIDERS,
  WEB_BRIDGE_RAW_MESSAGE_PASSTHROUGH_PROVIDERS,
  UNSUPPORTED_WEB_BRIDGE_FIELDS,
  WEB_BRIDGE_TEXT_PART_TYPES,
  WEB_BRIDGE_SUPPORTED_PART_TYPES,
  WEB_BRIDGE_MAX_SYSTEM_MESSAGES,
  WEB_BRIDGE_MAX_NON_SYSTEM_MESSAGES,
  WEB_BRIDGE_MAX_TOTAL_TEXT_CHARS,
  WEB_BRIDGE_MAX_SYSTEM_MESSAGE_CHARS,
  WEB_BRIDGE_MAX_MESSAGE_CHARS,
  WEB_BRIDGE_TRUNCATION_SUFFIX,
  UNTRUSTED_METADATA_PREFIXES,
  OPENCLAW_SCAFFOLD_MARKERS,
  UNTRUSTED_METADATA_JSON_KEYS,
  WB_OPENAI_PROTOCOL,
  isWebBridgeProvider,
  isWebBridgeRawMessagePassthrough,
  shouldUseRawWebBridgePassthrough,
  normalizeBridgeModel,
} from "./constants.js";

// Message sanitizer
export {
  sanitizeWebBridgeBody,
  sanitizeWebBridgeMessage,
  normalizeWebBridgeRole,
  normalizeWebBridgePart,
  normalizeWebBridgePartsValue,
  normalizeWebBridgeContentValue,
  buildWebBridgeToolCallFallback,
  compactWebBridgeMessages,
  stripUntrustedMetadataPreamble,
  normalizeBridgeTextValue,
  extractTextFromNormalizedWebBridgePart,
  getWebBridgeTextView,
  isUntrustedMetadataPrefixText,
  isStandaloneJsonMetadataLabel,
  looksLikeUntrustedMetadataJson,
  hasWebBridgeMessageContent,
  isOpenClawScaffoldingText,
  trimWebBridgeText,
  trimWebBridgeContent,
  getWebBridgeMessageTextLength,
} from "./messageSanitizer.js";

// Web Bridge (WS proxy + response builders + provider dispatch)
export {
  forwardViaWebBridge,
  handleWebBridgeChat,
  createWebBridgeJsonCompletion,
  createWebBridgeChunkPayload,
  createWebBridgeStreamResponse,
  readWebBridgeUpstreamError,
  saveLastWebBridgeRawRequestSnapshot,
} from "./webBridge.js";

// Inject Relay
export { handleInjectRelay } from "./injectRelay.js";

// Main handler
export { handleChat, __testables } from "./handler.js";
