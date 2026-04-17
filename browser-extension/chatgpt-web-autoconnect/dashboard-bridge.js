/* global chrome */

const PAGE_SOURCE = "nexusai-chatgpt-web-page";
const BRIDGE_SOURCE = "nexusai-chatgpt-web-extension";
const EXTENSION_CONTEXT_INVALIDATED_CODE = "EXTENSION_CONTEXT_INVALIDATED";
const DASHBOARD_PAGE_BRIDGE_PING = "DASHBOARD_PAGE_BRIDGE_PING";
const DASHBOARD_PAGE_BRIDGE_PONG = "DASHBOARD_PAGE_BRIDGE_PONG";
const DASHBOARD_BRIDGE_PING_TIMEOUT_MS = 1500;

const pendingDashboardBridgePings = new Map();

function isContextInvalidatedError(value) {
  return /extension context invalidated/i.test(String(value || "").trim());
}

function normalizeRuntimeError(error) {
  const rawMessage = String(error?.message || error || "").trim();
  if (!rawMessage) {
    return {
      code: "",
      message: "",
    };
  }

  if (isContextInvalidatedError(rawMessage)) {
    return {
      code: EXTENSION_CONTEXT_INVALIDATED_CODE,
      message: "Extension vừa được reload hoặc cập nhật nên bridge cũ trên tab này không còn hợp lệ. Hãy tải lại tab dashboard rồi thử lại.",
    };
  }

  return {
    code: "",
    message: rawMessage || "NexusAI Web Bridge failed.",
  };
}

function hasRuntimeError(runtimeState) {
  return Boolean(runtimeState?.code || String(runtimeState?.message || "").trim());
}

function postToPage(message = {}) {
  window.postMessage({
    source: BRIDGE_SOURCE,
    ...message,
  }, "*");
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `dashboard-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBridgePingTimeout(timeoutMs) {
  const normalized = Number(timeoutMs);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return DASHBOARD_BRIDGE_PING_TIMEOUT_MS;
  }

  return Math.min(Math.max(normalized, 300), 5000);
}

function buildDashboardBridgeSnapshot(overrides = {}) {
  return {
    bridgeReady: false,
    dashboardUrl: window.location.href,
    title: document.title || "",
    pageVisible: document.visibilityState || "visible",
    respondedAt: new Date().toISOString(),
    ...overrides,
  };
}

function pingDashboardPageBridge(timeoutMs = DASHBOARD_BRIDGE_PING_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const effectiveTimeoutMs = normalizeBridgePingTimeout(timeoutMs);
    const timeoutId = window.setTimeout(() => {
      pendingDashboardBridgePings.delete(requestId);
      resolve(buildDashboardBridgeSnapshot());
    }, effectiveTimeoutMs);

    pendingDashboardBridgePings.set(requestId, {
      resolve,
      timeoutId,
    });

    postToPage({
      type: DASHBOARD_PAGE_BRIDGE_PING,
      requestId,
      payload: buildDashboardBridgeSnapshot(),
    });
  });
}

function relayRuntimeMessage(data) {
  try {
    chrome.runtime.sendMessage(
      {
        type: data.type,
        requestId: data.requestId,
        payload: data.payload || {},
        pageUrl: window.location.href,
      },
      (response) => {
        const runtimeState = normalizeRuntimeError(chrome.runtime.lastError);
        if (hasRuntimeError(runtimeState)) {
          postToPage({
            type: `${data.type}_RESULT`,
            requestId: data.requestId,
            ok: false,
            error: runtimeState.message,
            code: runtimeState.code || undefined,
          });
          return;
        }

        if (!response || typeof response !== "object") {
          postToPage({
            type: `${data.type}_RESULT`,
            requestId: data.requestId,
            ok: false,
            error: "Extension background không trả về phản hồi.",
          });
          return;
        }

        postToPage({
          type: response.type || `${data.type}_RESULT`,
          requestId: data.requestId,
          ...response,
        });
      },
    );
  } catch (error) {
    const runtimeState = normalizeRuntimeError(error);
    postToPage({
      type: `${data.type}_RESULT`,
      requestId: data.requestId,
      ok: false,
      error: runtimeState.message,
      code: runtimeState.code || undefined,
    });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== PAGE_SOURCE || !data.type) {
    return;
  }

  if (data.type === DASHBOARD_PAGE_BRIDGE_PONG) {
    const requestId = String(data.requestId || "");
    const pending = pendingDashboardBridgePings.get(requestId);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeoutId);
    pendingDashboardBridgePings.delete(requestId);
    pending.resolve(buildDashboardBridgeSnapshot({
      ...(data.payload || {}),
      bridgeReady: true,
    }));
    return;
  }

  relayRuntimeMessage(data);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return undefined;
  }

  // ── Inject relay: forward messages từ background (content script → background → đây → page) ──
  if (message.source === "background-inject-relay") {
    postToPage({
      type: message.type,
      provider: message.provider || "",
      taskId: message.taskId || "",
      delta: message.delta || "",
      fullText: message.fullText || "",
      text: message.text || "",
      error: message.error || "",
      url: message.url || "",
    });
    return undefined;
  }

  if (message.type !== "PING_DASHBOARD_BRIDGE") {
    return undefined;
  }

  pingDashboardPageBridge(message.timeoutMs)
    .then((payload) => {
      sendResponse({
        ok: true,
        ...payload,
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: String(error?.message || error || "Dashboard bridge ping failed."),
      });
    });

  return true;
});

postToPage({
  type: "READY",
  ok: true,
});
