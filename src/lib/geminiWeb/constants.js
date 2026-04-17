// ── Gemini Web Bridge — Constants & Shared Utilities ──

export const GEMINI_WEB_PROVIDER = "gemini-web";
export const GEMINI_WEB_SESSION_ID = "gemini-web";
export const GEMINI_WEB_BASE_URL = "https://gemini.google.com";
export const GEMINI_WEB_APP_URL = `${GEMINI_WEB_BASE_URL}/app`;
export const GEMINI_WEB_GENERATE_URL = `${GEMINI_WEB_BASE_URL}/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`;
export const GEMINI_WEB_UPLOAD_URL = "https://content-push.googleapis.com/upload/";

export const GEMINI_WEB_DEFAULT_MODELS = [
  "gemini-3.1-pro",
  "gemini-3.0-flash",
  "gemini-3.0-flash-thinking",
];

export const GEMINI_WEB_BASE_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
  Origin: GEMINI_WEB_BASE_URL,
  Referer: `${GEMINI_WEB_BASE_URL}/`,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "X-Same-Domain": "1",
};

export const GEMINI_WEB_UPLOAD_HEADERS = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.7",
  authorization: "Basic c2F2ZXM6cyNMdGhlNmxzd2F2b0RsN3J1d1U=",
  "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
  origin: GEMINI_WEB_BASE_URL,
  "push-id": "feeds/mcudyrk2a4khkz",
  referer: `${GEMINI_WEB_BASE_URL}/`,
  "x-goog-upload-protocol": "resumable",
  "x-tenant-id": "bard-storage",
  "user-agent": GEMINI_WEB_BASE_HEADERS["User-Agent"],
};

export const GEMINI_WEB_MODEL_PAYLOADS = {
  "gemini-3.1-pro": {
    modelId: null,
    index17: [[1]],
    index68: 2,
  },
  "gemini-3.0-flash": {
    modelId: null,
    index17: [[0]],
    index68: 2,
  },
  "gemini-3.0-flash-thinking": {
    modelId: "43c00476dd942b0ab14710697fed6637",
    index17: [[0]],
    index68: 2,
  },
};

// ── Shared utilities ──

export function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
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

export function createGeminiError(message, status = 500, session = null) {
  const error = new Error(message);
  error.status = status;
  if (session) {
    error.session = session;
  }
  return error;
}
