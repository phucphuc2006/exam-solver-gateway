// ── ChatGPT Web Page — Browser Extension Bridge helpers ──

export const CHATGPT_WEB_EXTENSION_CONTEXT_INVALIDATED_CODE = "EXTENSION_CONTEXT_INVALIDATED";
export const AUTO_CONNECT_STORAGE_KEY = "chatgpt-web-auto-connect-enabled";
export const CHATGPT_WEB_EXTENSION_STICKY_STORAGE_KEY = "nexusai-web-extension-bridge-ready";
export const CHATGPT_WEB_EXTENSION_PAGE_SOURCE = "nexusai-chatgpt-web-page";
export const CHATGPT_WEB_EXTENSION_BRIDGE_SOURCE = "nexusai-chatgpt-web-extension";
export const CHATGPT_WEB_EXTENSION_REQUEST_TIMEOUT_MS = 15000;
export const CHATGPT_WEB_EXTENSION_AUTO_CONNECT_TIMEOUT_MS = 85000;

export function readStickyExtensionAvailability() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(CHATGPT_WEB_EXTENSION_STICKY_STORAGE_KEY) === "1";
}

export function writeStickyExtensionAvailability(value) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(CHATGPT_WEB_EXTENSION_STICKY_STORAGE_KEY, "1");
    return;
  }

  window.localStorage.removeItem(CHATGPT_WEB_EXTENSION_STICKY_STORAGE_KEY);
}

export function isExtensionContextInvalidatedError(value, code = "") {
  const message = String(value || "").trim();
  return (
    code === CHATGPT_WEB_EXTENSION_CONTEXT_INVALIDATED_CODE
    || /extension context invalidated/i.test(message)
    || /bridge cũ trên tab này không còn hợp lệ/i.test(message)
  );
}

export function getBrowserExtensionErrorMessage(value, code = "") {
  const message = String(value || "").trim();
  if (isExtensionContextInvalidatedError(message, code)) {
    return "Extension vừa được reload hoặc cập nhật nên tab dashboard này đang giữ bridge cũ. Hãy tải lại tab rồi thử lại.";
  }

  return message || "ChatGPT Web extension request failed.";
}

export function getSessionAttemptKey(session, scope = "") {
  return [
    session?.id || "",
    session?.capturedAt || "",
    session?.status || "",
    session?.lastValidatedAt || "",
    session?.lastErrorAt || "",
    scope,
  ].join("::");
}
