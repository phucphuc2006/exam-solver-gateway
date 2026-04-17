/* global chrome */

const PROVIDERS = {
  CHATGPT: "chatgpt-web",
  GEMINI: "gemini-web",
  GROK: "grok-web",
};

const CHATGPT_CAPTURE_TIMEOUT_MS = 90_000;
const CHATGPT_REQUEST_FILTER = {
  urls: [
    "https://chatgpt.com/backend-api/*",
  ],
};
const GROK_CAPTURE_TIMEOUT_MS = 90_000;
const GROK_REQUEST_FILTER = {
  urls: [
    "https://grok.com/rest/app-chat/conversations/*",
  ],
};

const pendingChatgptCaptures = new Map();
const pendingChatgptRequests = new Map();
const finalizingChatgptRequests = new Set();
const pendingGrokCaptures = new Map();
const pendingGrokRequests = new Map();
const finalizingGrokRequests = new Set();

function createRequestId(prefix = "request") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === PROVIDERS.GEMINI) return PROVIDERS.GEMINI;
  if (raw === PROVIDERS.GROK) return PROVIDERS.GROK;
  return PROVIDERS.CHATGPT;
}

function normalizeTimeoutMs(value, fallbackMs) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }

  return Math.min(Math.max(parsed, 1_000), 180_000);
}

function buildHeadersMap(requestHeaders = []) {
  const headers = {};

  for (const header of requestHeaders || []) {
    const key = String(header?.name || "").trim().toLowerCase();
    const value = String(header?.value || "").trim();
    if (!key || !value) {
      continue;
    }

    headers[key] = value;
  }

  return headers;
}

function decodeRequestBody(requestBody) {
  if (!requestBody || !Array.isArray(requestBody.raw) || requestBody.raw.length === 0) {
    return "";
  }

  const textDecoder = new TextDecoder();
  const parts = [];

  for (const entry of requestBody.raw) {
    const bytes = entry?.bytes;
    if (!bytes) {
      continue;
    }

    try {
      parts.push(textDecoder.decode(new Uint8Array(bytes)));
    } catch {
    }
  }

  return parts.join("");
}

function parseJsonSafely(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPathname(url) {
  try {
    return new URL(url).pathname || "";
  } catch {
    return "";
  }
}

function isConversationPath(pathname) {
  return pathname === "/backend-api/f/conversation" || pathname === "/backend-api/conversation";
}

function isGrokConversationPath(pathname) {
  const path = String(pathname || "").trim();
  return path === "/rest/app-chat/conversations/new"
    || /^\/rest\/app-chat\/conversations\/[^/]+\/responses$/i.test(path);
}

function mapCookiesToObject(cookies = []) {
  const result = {};

  for (const cookie of cookies) {
    const name = String(cookie?.name || "").trim();
    const value = String(cookie?.value || "").trim();
    if (!name || !value) {
      continue;
    }

    result[name] = value;
  }

  return result;
}

function mapCookiesToCaptureArray(cookies = []) {
  return (cookies || [])
    .map((cookie) => {
      const name = String(cookie?.name || "").trim();
      const value = String(cookie?.value || "").trim();
      if (!name || !value) {
        return null;
      }

      return {
        name,
        value,
        domain: String(cookie?.domain || "").trim(),
        path: String(cookie?.path || "").trim() || "/",
        secure: cookie?.secure === true,
        httpOnly: cookie?.httpOnly === true,
      };
    })
    .filter(Boolean);
}

function parseCookieHeaderString(cookieHeader = "") {
  const result = {};

  for (const part of String(cookieHeader || "").split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const name = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (!name || !value) {
      continue;
    }

    result[name] = value;
  }

  return result;
}

function mapCookieHeaderToCaptureArray(cookieHeader = "") {
  return Object.entries(parseCookieHeaderString(cookieHeader)).map(([name, value]) => ({
    name,
    value,
    domain: "grok.com",
    path: "/",
    secure: true,
    httpOnly: true,
  }));
}

function queryCookies(details) {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(details, (cookies) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || "Không thể đọc cookies từ extension."));
        return;
      }

      resolve(Array.isArray(cookies) ? cookies : []);
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || "Không thể đọc danh sách tab."));
        return;
      }

      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function getExtensionUserAgent() {
  return String(globalThis.navigator?.userAgent || "").trim()
    || "Mozilla/5.0";
}

function resolveAllPendingChatgpt(result) {
  for (const [requestId, pending] of pendingChatgptCaptures.entries()) {
    clearTimeout(pending.timeoutId);
    pendingChatgptCaptures.delete(requestId);
    pending.resolve(result);
  }
}

function rejectAllPendingChatgpt(error) {
  const message = String(error?.message || error || "ChatGPT Web auto connect failed.");

  for (const [requestId, pending] of pendingChatgptCaptures.entries()) {
    clearTimeout(pending.timeoutId);
    pendingChatgptCaptures.delete(requestId);
    pending.reject(new Error(message));
  }
}

async function finalizeChatgptCapture(requestId) {
  const entry = pendingChatgptRequests.get(requestId);
  if (!entry) {
    return;
  }

  const cookies = await queryCookies({ url: "https://chatgpt.com/" });
  const capture = {
    headers: entry.headers || {},
    cookies: mapCookiesToCaptureArray(cookies),
    userAgent: entry.userAgent || getExtensionUserAgent(),
    captureUrl: entry.url || "https://chatgpt.com/backend-api/f/conversation",
    capturedTargetPath: entry.capturedTargetPath || getPathname(entry.url),
    requestTemplate: entry.requestTemplate || null,
    captureSource: "browser-extension",
    capturedAt: entry.capturedAt || new Date().toISOString(),
  };

  pendingChatgptRequests.delete(requestId);
  resolveAllPendingChatgpt({
    provider: PROVIDERS.CHATGPT,
    capture,
    message: "Đã bắt được request conversation thật từ ChatGPT Web.",
  });
}

function maybeFinalizeChatgptCapture(requestId) {
  if (pendingChatgptCaptures.size === 0 || finalizingChatgptRequests.has(requestId)) {
    return;
  }

  const entry = pendingChatgptRequests.get(requestId);
  if (!entry) {
    return;
  }

  const hasAuthHeader = Boolean(entry.headers?.authorization);
  const hasRequestTemplate = Boolean(entry.requestTemplate && typeof entry.requestTemplate === "object");
  const targetPath = entry.capturedTargetPath || getPathname(entry.url);
  if (!isConversationPath(targetPath) || !hasAuthHeader || !hasRequestTemplate) {
    return;
  }

  finalizingChatgptRequests.add(requestId);
  void finalizeChatgptCapture(requestId)
    .catch((error) => {
      rejectAllPendingChatgpt(error);
    })
    .finally(() => {
      finalizingChatgptRequests.delete(requestId);
    });
}

async function armChatgptCapture(payload = {}) {
  const timeoutMs = normalizeTimeoutMs(payload.timeoutMs, CHATGPT_CAPTURE_TIMEOUT_MS);
  const openTabs = await queryTabs({ url: "https://chatgpt.com/*" }).catch(() => []);

  return new Promise((resolve, reject) => {
    const requestId = createRequestId("chatgpt-auto-connect");
    const timeoutId = setTimeout(() => {
      pendingChatgptCaptures.delete(requestId);
      reject(new Error(
        openTabs.length > 0
          ? "Không bắt được request conversation thật từ ChatGPT Web trong thời gian chờ. Hãy mở tab chat thường và gửi 1 tin nhắn ngắn rồi thử lại."
          : "Chưa thấy request thật từ ChatGPT Web. Hãy mở chatgpt.com, gửi 1 tin nhắn ngắn trong chat thường rồi thử lại.",
      ));
    }, timeoutMs);

    pendingChatgptCaptures.set(requestId, {
      resolve,
      reject,
      timeoutId,
    });
  });
}

async function autoConnectGemini(enableHtmlFetch = true) {
  const cookies = await queryCookies({ url: "https://gemini.google.com/" });
  const cookieMap = mapCookiesToObject(cookies);
  const psid = cookieMap["__Secure-1PSID"] || "";
  const psidts = cookieMap["__Secure-1PSIDTS"] || "";

  if (!psid || !psidts) {
    throw new Error("Không tìm thấy đủ cookie Gemini. Hãy đăng nhập Gemini Web trong trình duyệt này trước.");
  }

  // Fetch HTML trang /app trong extension context (browser thật, không bị 502)
  let pageHtml = null;
  if (enableHtmlFetch) {
    try {
      const cookieHeader = cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      const response = await fetch("https://gemini.google.com/app", {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Cookie": cookieHeader,
          "User-Agent": getExtensionUserAgent(),
        },
        credentials: "include",
      });
      if (response.ok) {
        pageHtml = await response.text();
      }
    } catch {
      // Nếu fetch thất bại, vẫn trả cookie bình thường (fallback → server sẽ tự fetch)
    }
  }

  return {
    provider: PROVIDERS.GEMINI,
    sessionPayload: {
      cookies: {
        "__Secure-1PSID": psid,
        "__Secure-1PSIDTS": psidts,
      },
      userAgent: getExtensionUserAgent(),
      captureSource: "browser-extension",
      pageHtml: pageHtml || null,
    },
    message: pageHtml
      ? "Đã lấy cookie + HTML trang Gemini Web từ extension."
      : "Đã lấy cookie Gemini Web từ extension (không lấy được HTML page).",
  };
}

async function autoConnectGrok() {
  const openTabs = await queryTabs({ url: "https://grok.com/*" }).catch(() => []);

  return new Promise((resolve, reject) => {
    const requestId = createRequestId("grok-auto-connect");
    const timeoutId = setTimeout(() => {
      pendingGrokCaptures.delete(requestId);
      reject(new Error(
        openTabs.length > 0
          ? "Không bắt được request chat thật từ Grok Web trong thời gian chờ. Hãy mở tab chat thường trên grok.com và gửi 1 tin nhắn ngắn rồi thử lại."
          : "Chưa thấy tab Grok Web đang mở. Hãy mở grok.com, gửi 1 tin nhắn ngắn trong chat thường rồi thử lại.",
      ));
    }, GROK_CAPTURE_TIMEOUT_MS);

    pendingGrokCaptures.set(requestId, {
      resolve,
      reject,
      timeoutId,
    });
  });
}

function resolveAllPendingGrok(result) {
  for (const [requestId, pending] of pendingGrokCaptures.entries()) {
    clearTimeout(pending.timeoutId);
    pendingGrokCaptures.delete(requestId);
    pending.resolve(result);
  }
}

function rejectAllPendingGrok(error) {
  const message = String(error?.message || error || "Grok Web auto connect failed.");

  for (const [requestId, pending] of pendingGrokCaptures.entries()) {
    clearTimeout(pending.timeoutId);
    pendingGrokCaptures.delete(requestId);
    pending.reject(new Error(message));
  }
}

async function finalizeGrokCapture(requestId) {
  const entry = pendingGrokRequests.get(requestId);
  if (!entry) {
    return;
  }

  const headerCookies = parseCookieHeaderString(entry.headers?.cookie || "");
  let captureCookies = mapCookieHeaderToCaptureArray(entry.headers?.cookie || "");

  if (captureCookies.length === 0) {
    const cookies = await queryCookies({ url: "https://grok.com/" });
    captureCookies = mapCookiesToCaptureArray(cookies);
  }

  pendingGrokRequests.delete(requestId);
  resolveAllPendingGrok({
    provider: PROVIDERS.GROK,
    sessionPayload: {
      cookies: Object.keys(headerCookies).length > 0 ? headerCookies : mapCookiesToObject(captureCookies),
      headers: entry.headers || {},
      requestTemplate: entry.requestTemplate || null,
      userAgent: entry.userAgent || getExtensionUserAgent(),
      captureUrl: entry.url || "https://grok.com/rest/app-chat/conversations/new",
      capturedTargetPath: entry.capturedTargetPath || getPathname(entry.url),
      captureSource: "browser-extension",
      capturedAt: entry.capturedAt || new Date().toISOString(),
    },
    message: "Đã bắt được request chat thật từ Grok Web.",
  });
}

function maybeFinalizeGrokCapture(requestId) {
  if (pendingGrokCaptures.size === 0 || finalizingGrokRequests.has(requestId)) {
    return;
  }

  const entry = pendingGrokRequests.get(requestId);
  if (!entry) {
    return;
  }

  const hasCookieHeader = Boolean(entry.headers?.cookie);
  const hasRequestTemplate = Boolean(entry.requestTemplate && typeof entry.requestTemplate === "object");
  const targetPath = entry.capturedTargetPath || getPathname(entry.url);
  if (!isGrokConversationPath(targetPath) || !hasCookieHeader || !hasRequestTemplate) {
    return;
  }

  finalizingGrokRequests.add(requestId);
  void finalizeGrokCapture(requestId)
    .catch((error) => {
      rejectAllPendingGrok(error);
    })
    .finally(() => {
      finalizingGrokRequests.delete(requestId);
    });
}

function handleGrokBeforeRequest(details) {
  if (pendingGrokCaptures.size === 0) {
    return;
  }

  const targetPath = getPathname(details.url);
  if (!isGrokConversationPath(targetPath)) {
    return;
  }

  const requestTemplate = parseJsonSafely(decodeRequestBody(details.requestBody));
  const existing = pendingGrokRequests.get(details.requestId) || {};

  pendingGrokRequests.set(details.requestId, {
    ...existing,
    url: details.url,
    tabId: details.tabId,
    requestTemplate,
    capturedTargetPath: targetPath,
    capturedAt: existing.capturedAt || new Date().toISOString(),
  });

  maybeFinalizeGrokCapture(details.requestId);
}

function handleGrokBeforeSendHeaders(details) {
  if (pendingGrokCaptures.size === 0 && !pendingGrokRequests.has(details.requestId)) {
    return;
  }

  const targetPath = getPathname(details.url);
  if (!isGrokConversationPath(targetPath)) {
    return;
  }

  const headers = buildHeadersMap(details.requestHeaders);
  const existing = pendingGrokRequests.get(details.requestId) || {};

  pendingGrokRequests.set(details.requestId, {
    ...existing,
    url: details.url,
    tabId: details.tabId,
    headers,
    userAgent: headers["user-agent"] || existing.userAgent || getExtensionUserAgent(),
    capturedTargetPath: targetPath,
    capturedAt: existing.capturedAt || new Date().toISOString(),
  });

  maybeFinalizeGrokCapture(details.requestId);
}

function cleanupTrackedGrokRequest(details) {
  if (!details?.requestId) {
    return;
  }

  pendingGrokRequests.delete(details.requestId);
  finalizingGrokRequests.delete(details.requestId);
}

function handleChatgptBeforeRequest(details) {
  if (pendingChatgptCaptures.size === 0) {
    return;
  }

  const targetPath = getPathname(details.url);
  if (!isConversationPath(targetPath)) {
    return;
  }

  const requestTemplate = parseJsonSafely(decodeRequestBody(details.requestBody));
  const existing = pendingChatgptRequests.get(details.requestId) || {};

  pendingChatgptRequests.set(details.requestId, {
    ...existing,
    url: details.url,
    tabId: details.tabId,
    requestTemplate,
    capturedTargetPath: targetPath,
    capturedAt: existing.capturedAt || new Date().toISOString(),
  });

  maybeFinalizeChatgptCapture(details.requestId);
}

function handleChatgptBeforeSendHeaders(details) {
  if (pendingChatgptCaptures.size === 0 && !pendingChatgptRequests.has(details.requestId)) {
    return;
  }

  const targetPath = getPathname(details.url);
  if (!isConversationPath(targetPath)) {
    return;
  }

  const headers = buildHeadersMap(details.requestHeaders);
  const existing = pendingChatgptRequests.get(details.requestId) || {};

  pendingChatgptRequests.set(details.requestId, {
    ...existing,
    url: details.url,
    tabId: details.tabId,
    headers,
    userAgent: headers["user-agent"] || existing.userAgent || getExtensionUserAgent(),
    capturedTargetPath: targetPath,
    capturedAt: existing.capturedAt || new Date().toISOString(),
  });

  maybeFinalizeChatgptCapture(details.requestId);
}

function cleanupTrackedChatgptRequest(details) {
  if (!details?.requestId) {
    return;
  }

  pendingChatgptRequests.delete(details.requestId);
  finalizingChatgptRequests.delete(details.requestId);
}

chrome.webRequest.onBeforeRequest.addListener(
  handleChatgptBeforeRequest,
  CHATGPT_REQUEST_FILTER,
  ["requestBody"],
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  handleChatgptBeforeSendHeaders,
  CHATGPT_REQUEST_FILTER,
  ["requestHeaders", "extraHeaders"],
);

chrome.webRequest.onCompleted.addListener(
  cleanupTrackedChatgptRequest,
  CHATGPT_REQUEST_FILTER,
);

chrome.webRequest.onErrorOccurred.addListener(
  cleanupTrackedChatgptRequest,
  CHATGPT_REQUEST_FILTER,
);

chrome.webRequest.onBeforeRequest.addListener(
  handleGrokBeforeRequest,
  GROK_REQUEST_FILTER,
  ["requestBody"],
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  handleGrokBeforeSendHeaders,
  GROK_REQUEST_FILTER,
  ["requestHeaders", "extraHeaders"],
);

chrome.webRequest.onCompleted.addListener(
  cleanupTrackedGrokRequest,
  GROK_REQUEST_FILTER,
);

chrome.webRequest.onErrorOccurred.addListener(
  cleanupTrackedGrokRequest,
  GROK_REQUEST_FILTER,
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = String(message?.type || "").trim();

  if (type === "PING") {
    sendResponse({
      ok: true,
      payload: {
        ready: true,
        providers: [PROVIDERS.CHATGPT, PROVIDERS.GEMINI, PROVIDERS.GROK],
      },
    });
    return undefined;
  }

  // ── Inject Mode: kiểm tra tab có sẵn sàng không ──
  if (type === "INJECT_STATUS") {
    const provider = normalizeProvider(message?.payload?.provider);
    const urlPattern = provider === PROVIDERS.GEMINI
      ? "https://gemini.google.com/*"
      : provider === PROVIDERS.GROK
        ? "https://grok.com/*"
        : "https://chatgpt.com/*";

    (async () => {
      const tabs = await queryTabs({ url: urlPattern }).catch(() => []);
      if (tabs.length === 0) {
        return { ok: false, error: `Không tìm thấy tab ${provider} đang mở.`, ready: false };
      }

      // Ping content script trên tab đầu tiên
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: "INJECT_PING" }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            resolve({ ok: false, error: "Content script chưa sẵn sàng.", ready: false, tabId: tabs[0].id });
          } else {
            resolve({ ok: true, ready: response.ready, tabId: tabs[0].id, url: response.url });
          }
        });
      });
    })()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));

    return true;
  }

  // ── Inject Mode: gửi prompt tới content script ──
  if (type === "INJECT_PROMPT") {
    const provider = normalizeProvider(message?.payload?.provider);
    const prompt = String(message?.payload?.prompt || "").trim();
    const taskId = String(message?.payload?.taskId || `inject-${Date.now()}`);
    const urlPattern = provider === PROVIDERS.GEMINI
      ? "https://gemini.google.com/*"
      : provider === PROVIDERS.GROK
        ? "https://grok.com/*"
        : "https://chatgpt.com/*";

    if (!prompt) {
      sendResponse({ ok: false, error: "Prompt rỗng." });
      return undefined;
    }

    (async () => {
      const tabs = await queryTabs({ url: urlPattern }).catch(() => []);
      if (tabs.length === 0) {
        throw new Error(`Không tìm thấy tab ${provider} đang mở. Hãy mở trang web tương ứng trước.`);
      }

      const tabId = tabs[0].id;

      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: "INJECT_PROMPT", taskId, prompt }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Content script không phản hồi: ${chrome.runtime.lastError.message}`));
          } else if (!response?.ok) {
            reject(new Error(response?.error || "Inject failed"));
          } else {
            resolve({ ok: true, taskId, tabId, status: "injecting" });
          }
        });
      });
    })()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));

    return true;
  }

  // ── Inject Mode: cancel inject hiện tại ──
  if (type === "INJECT_CANCEL") {
    const provider = normalizeProvider(message?.payload?.provider);
    const taskId = String(message?.payload?.taskId || "");
    const urlPattern = provider === PROVIDERS.GEMINI
      ? "https://gemini.google.com/*"
      : provider === PROVIDERS.GROK
        ? "https://grok.com/*"
        : "https://chatgpt.com/*";

    (async () => {
      const tabs = await queryTabs({ url: urlPattern }).catch(() => []);
      if (tabs.length === 0) return { ok: true, cancelled: false };

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { type: "INJECT_CANCEL", taskId }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: true, cancelled: false });
          } else {
            resolve(response || { ok: true, cancelled: false });
          }
        });
      });
    })()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: true, cancelled: false }));

    return true;
  }

  // ── Inject relay: forward INJECT_DELTA / INJECT_DONE / INJECT_ERROR / INJECT_SUBMITTED từ content scripts ──
  if (
    type === "INJECT_DELTA" ||
    type === "INJECT_DONE" ||
    type === "INJECT_ERROR" ||
    type === "INJECT_SUBMITTED" ||
    type === "INJECTOR_READY"
  ) {
    // Forward tới tất cả dashboard tabs
    queryTabs({}).catch(() => []).then((allTabs) => {
      for (const tab of allTabs) {
        const tabUrl = String(tab?.url || "");
        const isDashboard = tabUrl.includes("localhost") ||
          tabUrl.includes("127.0.0.1") ||
          tabUrl.includes("trycloudflare.com") ||
          tabUrl.includes("ngrok-free.app");

        if (isDashboard && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            source: "background-inject-relay",
            type,
            provider: message?.provider || "",
            taskId: message?.taskId || "",
            delta: message?.delta || "",
            fullText: message?.fullText || "",
            text: message?.text || "",
            error: message?.error || "",
            url: message?.url || "",
          }).catch(() => {});
        }
      }
    });

    return undefined;
  }

  if (type !== "AUTO_CONNECT") {
    return undefined;
  }

  const provider = normalizeProvider(message?.payload?.provider);
  const enableHtmlFetch = message?.payload?.enableHtmlFetch === true; // Mặc định là false – chỉ lấy HTML khi bật rõ ràng

  (async () => {
    if (provider === PROVIDERS.GEMINI) {
      return autoConnectGemini(enableHtmlFetch);
    }

    if (provider === PROVIDERS.GROK) {
      return autoConnectGrok();
    }

    return armChatgptCapture(message?.payload || {});
  })()
    .then((payload) => {
      sendResponse({
        ok: true,
        payload,
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: String(error?.message || error || "Auto connect failed."),
      });
    });

  return true;
});

// ══════════════════════════════════════════════════════
// ── Inject Relay: WebSocket Persistent Connection ──
// Extension kết nối WS tới backend, nhận task real-time
// ══════════════════════════════════════════════════════

const injectRelayState = {
  enabled: new Map(), // provider → boolean
  connected: new Map(), // provider → boolean (đang connected?)
  sockets: new Map(), // provider → WebSocket instance
  baseUrl: "", // http://localhost:21088
  wsPort: 21099, // WS server port (default)
  reconnectTimers: new Map(), // provider → timeout id
  reconnectAttempts: new Map(), // provider → number
};

// ── Auto-restore: Load config từ chrome.storage.local khi extension start ──
try {
  if (chrome?.storage?.local) {
    chrome.storage.local.get("injectRelayConfig", (result) => {
      const cfg = result?.injectRelayConfig;
      if (cfg?.baseUrl && cfg?.providers) {
        injectRelayState.baseUrl = cfg.baseUrl;
        if (cfg.wsPort) injectRelayState.wsPort = cfg.wsPort;
        console.log(`[InjectRelay] Auto-restore config: baseUrl=${cfg.baseUrl}, wsPort=${cfg.wsPort || 21099}`);
        for (const [provider, enabled] of Object.entries(cfg.providers)) {
          if (enabled) {
            injectRelayState.enabled.set(provider, true);
            console.log(`[InjectRelay] Auto-starting WS for ${provider}`);
            void connectInjectRelayWs(provider);
          }
        }
      }
    });
  }
} catch (e) {
  console.warn("[InjectRelay] Auto-restore skipped:", e.message);
}

// ── Keep-alive Alarm: Đánh thức Service Worker (MV3) và Reconnect nếu bị đứt ──
try {
  chrome.alarms.create("ws-keep-alive", { periodInMinutes: 0.25 }); // 15 giây
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "ws-keep-alive") {
      for (const [provider, enabled] of injectRelayState.enabled.entries()) {
        if (enabled) {
          const sock = injectRelayState.sockets.get(provider);
          // Nếu socket không tồn tại, hoặc đã đóng, hoặc đang đóng thì connect lại
          if (!sock || sock.readyState === WebSocket.CLOSED || sock.readyState === WebSocket.CLOSING) {
            console.log(`[InjectRelay] Keep-alive wakeup: WS dead for ${provider}. Reconnecting...`);
            connectInjectRelayWs(provider);
          }
        }
      }
    }
  });
} catch (e) {
  console.warn("[InjectRelay] Setup keep-alive skipped:", e.message);
}

// Content script → background: khi INJECT_DELTA/DONE/ERROR, POST về backend
function relayInjectResultToBackend(action, payload) {
  if (!injectRelayState.baseUrl) return;

  const url = `${injectRelayState.baseUrl}/api/inject-relay`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  }).catch((err) => {
    console.warn(`[InjectRelay] POST ${action} failed:`, err.message);
  });
}

// Listen cho inject messages từ content scripts → relay tới backend
chrome.runtime.onMessage.addListener((message, _sender) => {
  if (!message?.source) return;

  const isInjectorMessage =
    message.source === "chatgpt-injector" ||
    message.source === "gemini-injector" ||
    message.source === "grok-injector";

  if (!isInjectorMessage) return;

  const type = String(message.type || "");
  const taskId = message.taskId || "";

  if (type === "INJECT_DELTA" && taskId) {
    relayInjectResultToBackend("delta", {
      taskId,
      delta: message.delta || "",
      fullText: message.fullText || "",
    });
  } else if (type === "INJECT_DONE" && taskId) {
    relayInjectResultToBackend("done", {
      taskId,
      text: message.text || "",
    });
  } else if (type === "INJECT_ERROR" && taskId) {
    relayInjectResultToBackend("error", {
      taskId,
      error: message.error || "Inject failed",
    });
  }
});

/**
 * Kết nối WebSocket persistent tới backend inject relay
 */
function connectInjectRelayWs(provider) {
  // Cleanup old socket nếu có
  const existingSocket = injectRelayState.sockets.get(provider);
  if (existingSocket) {
    try { existingSocket.close(); } catch {}
    injectRelayState.sockets.delete(provider);
  }

  if (!injectRelayState.enabled.get(provider)) {
    console.log(`[InjectRelay] WS not enabled for ${provider}, skipping connect`);
    return;
  }

  // Build WS URL từ baseUrl
  const baseUrl = injectRelayState.baseUrl;
  if (!baseUrl) {
    console.warn(`[InjectRelay] No baseUrl configured, cannot connect WS for ${provider}`);
    return;
  }

  // Parse hostname từ baseUrl (http://localhost:21088 → localhost)
  let hostname = "127.0.0.1";
  try {
    const parsed = new URL(baseUrl);
    hostname = parsed.hostname;
  } catch {}

  const wsPort = injectRelayState.wsPort || 21099;
  const wsUrl = `ws://${hostname}:${wsPort}/inject-relay?provider=${encodeURIComponent(provider)}`;

  console.log(`[InjectRelay] Connecting WS: ${wsUrl}`);

  let socket;
  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    console.warn(`[InjectRelay] WS create failed for ${provider}:`, err.message);
    scheduleReconnect(provider);
    return;
  }

  injectRelayState.sockets.set(provider, socket);

  socket.onopen = () => {
    console.log(`[InjectRelay] ✅ WS connected for ${provider}`);
    injectRelayState.connected.set(provider, true);
    injectRelayState.reconnectAttempts.set(provider, 0); // Reset reconnect counter
  };

  socket.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    // Heartbeat ping → reply pong
    if (msg.type === "ping") {
      try { socket.send(JSON.stringify({ type: "pong" })); } catch {}
      return;
    }

    // Connected ack
    if (msg.type === "connected") {
      console.log(`[InjectRelay] WS ack for ${msg.provider}`);
      return;
    }

    // ── Nhận task từ backend ──
    if (msg.type === "task" && msg.task) {
      const task = msg.task;
      console.log(`[InjectRelay] Received task ${task.taskId} for ${provider} via WS`);

      // Tìm tab matching provider
      const urlPattern = provider === PROVIDERS.GEMINI
        ? "https://gemini.google.com/*"
        : provider === PROVIDERS.GROK
          ? ["https://grok.com/*", "https://x.com/i/grok*"]
          : "https://chatgpt.com/*";

      const tabs = await queryTabs({ url: urlPattern }).catch(() => []);
      if (tabs.length === 0) {
        relayInjectResultToBackend("error", {
          taskId: task.taskId,
          error: `Không tìm thấy tab ${provider} đang mở.`,
        });
        return;
      }

      // Gửi inject prompt tới content script
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "INJECT_PROMPT", taskId: task.taskId, prompt: task.prompt },
        (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            relayInjectResultToBackend("error", {
              taskId: task.taskId,
              error: chrome.runtime.lastError?.message || response?.error || "Content script không phản hồi.",
            });
          }
        },
      );
    }
  };

  socket.onclose = (event) => {
    console.log(`[InjectRelay] WS disconnected for ${provider} (code: ${event.code})`);
    injectRelayState.connected.set(provider, false);
    injectRelayState.sockets.delete(provider);

    // Auto-reconnect nếu vẫn enabled
    if (injectRelayState.enabled.get(provider)) {
      scheduleReconnect(provider);
    }
  };

  socket.onerror = (err) => {
    console.warn(`[InjectRelay] WS error for ${provider}:`, err.message || "connection error");
  };
}

/**
 * Auto-reconnect với exponential backoff
 */
function scheduleReconnect(provider) {
  // Clear timer cũ
  const existingTimer = injectRelayState.reconnectTimers.get(provider);
  if (existingTimer) clearTimeout(existingTimer);

  if (!injectRelayState.enabled.get(provider)) return;

  const attempts = injectRelayState.reconnectAttempts.get(provider) || 0;
  // Backoff: 1s, 2s, 4s, 8s, 16s, max 30s
  const delay = Math.min(1000 * Math.pow(2, attempts), 30_000);

  console.log(`[InjectRelay] Reconnecting ${provider} in ${delay}ms (attempt ${attempts + 1})`);

  const timer = setTimeout(() => {
    injectRelayState.reconnectAttempts.set(provider, attempts + 1);
    connectInjectRelayWs(provider);
  }, delay);

  injectRelayState.reconnectTimers.set(provider, timer);
}

/**
 * Ngắt kết nối WS cho provider
 */
function disconnectInjectRelayWs(provider) {
  injectRelayState.enabled.set(provider, false);

  // Clear reconnect timer
  const timer = injectRelayState.reconnectTimers.get(provider);
  if (timer) {
    clearTimeout(timer);
    injectRelayState.reconnectTimers.delete(provider);
  }

  // Close socket
  const socket = injectRelayState.sockets.get(provider);
  if (socket) {
    try { socket.close(1000, "disabled"); } catch {}
    injectRelayState.sockets.delete(provider);
  }

  injectRelayState.connected.set(provider, false);
  console.log(`[InjectRelay] WS disconnected for ${provider} (user disabled)`);
}

// Listen cho INJECT_RELAY_CONFIG từ dashboard
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (String(message?.type || "").trim() !== "INJECT_RELAY_CONFIG") {
    return undefined;
  }

  const provider = normalizeProvider(message?.payload?.provider);
  const enabled = message?.payload?.enabled === true;
  const baseUrl = String(message?.payload?.baseUrl || "").replace(/\/$/, "");
  const wsPort = Number(message?.payload?.wsPort) || 21099;

  if (baseUrl) {
    injectRelayState.baseUrl = baseUrl;
  }
  injectRelayState.wsPort = wsPort;

  injectRelayState.enabled.set(provider, enabled);

  // ── Persist config vào chrome.storage.local ──
  try {
    if (chrome?.storage?.local) {
      const providersObj = {};
      for (const [k, v] of injectRelayState.enabled.entries()) {
        providersObj[k] = v;
      }
      chrome.storage.local.set({
        injectRelayConfig: {
          baseUrl: injectRelayState.baseUrl,
          wsPort: injectRelayState.wsPort,
          providers: providersObj,
        }
      });
    }
  } catch (e) {
    console.warn("[InjectRelay] Persist config skipped:", e.message);
  }

  if (enabled) {
    // POST config lên backend
    if (injectRelayState.baseUrl) {
      fetch(`${injectRelayState.baseUrl}/api/inject-relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "config", provider, enabled: true }),
      }).catch(() => {});
    }

    void connectInjectRelayWs(provider);
  } else {
    disconnectInjectRelayWs(provider);

    if (injectRelayState.baseUrl) {
      fetch(`${injectRelayState.baseUrl}/api/inject-relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "config", provider, enabled: false }),
      }).catch(() => {});
    }
  }

  sendResponse({ ok: true, provider, enabled, baseUrl: injectRelayState.baseUrl });
  return true;
});

