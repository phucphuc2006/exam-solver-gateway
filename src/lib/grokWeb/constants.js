// ── Grok Web Bridge — Constants & Shared Utilities ──

export const GROK_WEB_PROVIDER = "grok-web";
export const GROK_WEB_SESSION_ID = "grok-web";
export const GROK_WEB_BASE_URL = "https://grok.com/rest/app-chat";
export const GROK_WEB_APP_URL = "https://grok.com/";

export const GROK_WEB_DEFAULT_MODELS = [
  "grok-3",
];

export const GROK_WEB_HEADERS = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json",
  origin: "https://grok.com",
  referer: "https://grok.com/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
};

export const GROK_FORBIDDEN_CAPTURE_HEADERS = new Set([
  "cookie",
  "content-length",
  "host",
  "connection",
  "content-encoding",
  "transfer-encoding",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
]);

// ── Shared utilities ──

export function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function safeParseJson(value, fallback) {
  if (!value || typeof value !== "string") {
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

export function createGrokError(message, status = 500, session = null) {
  const error = new Error(message);
  error.status = status;
  if (session) {
    error.session = session;
  }
  return error;
}

export function createGrokDeviceEnvInfo() {
  return {
    darkModeEnabled: false,
    devicePixelRatio: 1,
    screenWidth: 1920,
    screenHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 720,
  };
}

export function readResponseTextSnippet(response) {
  return response.text()
    .then((text) => normalizeString(text).slice(0, 300))
    .catch(() => "");
}
