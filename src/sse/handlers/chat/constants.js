// ── Chat Handler — Constants & shared sets ──

export const WEB_BRIDGE_PROVIDERS = new Set(["chatgpt-web", "gemini-web", "grok-web"]);
export const WEB_BRIDGE_RAW_MESSAGE_PASSTHROUGH_PROVIDERS = new Set(["chatgpt-web"]);
export const UNSUPPORTED_WEB_BRIDGE_FIELDS = [
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
export const WEB_BRIDGE_TEXT_PART_TYPES = new Set(["text", "input_text"]);
export const WEB_BRIDGE_SUPPORTED_PART_TYPES = new Set(["text", "input_text", "image_url", "input_image", "file"]);
export const WEB_BRIDGE_MAX_SYSTEM_MESSAGES = 2;
export const WEB_BRIDGE_MAX_NON_SYSTEM_MESSAGES = 6;
export const WEB_BRIDGE_MAX_TOTAL_TEXT_CHARS = 6000;
export const WEB_BRIDGE_MAX_SYSTEM_MESSAGE_CHARS = 1200;
export const WEB_BRIDGE_MAX_MESSAGE_CHARS = 2000;
export const WEB_BRIDGE_TRUNCATION_SUFFIX = "\n\n[... da cat gon boi Web Bridge ...]";
export const UNTRUSTED_METADATA_PREFIXES = [
  "conversation info (untrusted metadata):",
  "sender (untrusted metadata):",
];
export const OPENCLAW_SCAFFOLD_MARKERS = [
  "you are a personal assistant running inside openclaw",
  "## tooling",
  "tool availability (filtered by policy):",
  "call tools exactly as listed.",
  "agents_list",
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "session_status",
];
export const UNTRUSTED_METADATA_JSON_KEYS = [
  "\"message_id\"",
  "\"sender_id\"",
  "\"sender\"",
  "\"timestamp\"",
  "\"label\"",
  "\"username\"",
];

export const WB_OPENAI_PROTOCOL = "nexus-wb-openai.v1";

export function isWebBridgeProvider(provider) {
  return WEB_BRIDGE_PROVIDERS.has(provider);
}

export function isWebBridgeRawMessagePassthrough(provider) {
  return WEB_BRIDGE_RAW_MESSAGE_PASSTHROUGH_PROVIDERS.has(provider);
}

export function shouldUseRawWebBridgePassthrough(provider, body = {}) {
  void body;
  return isWebBridgeRawMessagePassthrough(provider);
}

export function normalizeBridgeModel(provider, model, fallback = "") {
  const rawModel = typeof model === "string" ? model.trim() : "";
  const prefix = `${provider}/`;
  if (rawModel.startsWith(prefix)) {
    return rawModel.slice(prefix.length) || fallback;
  }
  return rawModel || fallback;
}
