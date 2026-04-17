// ── ChatGPT Web Page — Capture & cURL helpers ──

export function getBackendApiUrlFromCurl(rawCurl) {
  const match = String(rawCurl || "").match(/https:\/\/chatgpt\.com\/backend-api\/[^\s'"]+/i);
  return match ? match[0] : "";
}

export function decodeCurlArgument(rawValue = "") {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return "";
  }

  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith("\"") && raw.endsWith("\""))) {
    const inner = raw.slice(1, -1);
    if (raw.startsWith("\"")) {
      return inner.replace(/\\(["\\/$`])/g, "$1");
    }
    return inner;
  }

  return raw;
}

export function extractJsonRequestBodyFromCurl(rawCurl) {
  const raw = String(rawCurl || "");
  const match = raw.match(/(?:--data-raw|--data-binary|--data|-d)\s+('(?:[^']|\\')*'|"(?:[^"\\]|\\.)*"|[^\s]+)/is);
  if (!match) {
    return null;
  }

  const decoded = decodeCurlArgument(match[1]);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function looksLikeChatgptWebCurl(rawValue) {
  const raw = String(rawValue || "").trim();
  return Boolean(getBackendApiUrlFromCurl(raw)) && /\bcurl\b/i.test(raw);
}

export function getTargetPathFromCaptureUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).pathname || "";
  } catch {
    if (raw.startsWith("/")) {
      const questionIndex = raw.indexOf("?");
      return questionIndex >= 0 ? raw.slice(0, questionIndex) : raw;
    }
    return "";
  }
}

export function isConversationCaptureUrl(value) {
  const path = getTargetPathFromCaptureUrl(value);
  return path === "/backend-api/f/conversation" || path === "/backend-api/conversation";
}

export function getCaptureMode(value) {
  if (isConversationCaptureUrl(value)) {
    return "conversation";
  }
  return "unknown";
}

export function isSupportedCaptureUrl(value) {
  return getCaptureMode(value) !== "unknown";
}

export function resolveCaptureTargetPath(captureUrl, capturedTargetPath) {
  return getTargetPathFromCaptureUrl(capturedTargetPath) || getTargetPathFromCaptureUrl(captureUrl);
}
