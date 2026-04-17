import crypto from "node:crypto";

import {
  getApiKeys,
  getChatgptWebSession,
  getGeminiWebSession,
  getGrokWebSession,
  getSettings,
} from "@/lib/localDb";
import { ensureWebBridgeSidecarReady, getWebBridgeSidecarStatus } from "@/lib/webBridgeSidecar";
import { getWebBridgeControlWsUrl } from "@/lib/webBridgeServerConfig";
import { WEB_BRIDGE_CONTROL_PROTOCOL } from "@/shared/constants/webBridge";

const RECONNECT_DELAY_MS = 2_000;

function getRuntimeState() {
  if (!global.__webBridgeControlPlaneState) {
    global.__webBridgeControlPlaneState = {
      socket: null,
      connectPromise: null,
      reconnectTimer: null,
      outboundQueue: [],
      connected: false,
      lastConnectedAt: null,
      lastError: null,
      lastMetrics: null,
    };
  }

  return global.__webBridgeControlPlaneState;
}

function flushQueue(state) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  while (state.outboundQueue.length > 0) {
    const next = state.outboundQueue.shift();
    state.socket.send(JSON.stringify(next));
  }
}

async function buildStateSnapshot() {
  const [settings, apiKeys, chatgptSession, geminiSession, grokSession] = await Promise.all([
    getSettings(),
    getApiKeys(),
    getChatgptWebSession(),
    getGeminiWebSession(),
    getGrokWebSession(),
  ]);

  return {
    type: "state.sync.snapshot",
    payload: {
      issuedAt: new Date().toISOString(),
      settings: {
        requireApiKey: settings.requireApiKey === true,
      },
      apiKeys: apiKeys
        .filter((entry) => entry?.key && entry.isActive !== false)
        .map((entry) => ({
          id: entry.id,
          key: entry.key,
          name: entry.name || "",
        })),
      sessions: {
        "chatgpt-web": chatgptSession || null,
        "gemini-web": geminiSession || null,
        "grok-web": grokSession || null,
      },
    },
  };
}

function queueMessage(message) {
  const state = getRuntimeState();
  state.outboundQueue.push(message);
  flushQueue(state);
}

async function handleControlMessage(message) {
  const state = getRuntimeState();
  switch (message?.type) {
    case "state.sync.request":
      queueMessage(await buildStateSnapshot());
      return;
    case "health.ping":
      queueMessage({
        type: "health.pong",
        payload: { timestamp: new Date().toISOString() },
      });
      return;
    case "runtime.metrics":
      state.lastMetrics = message.payload || null;
      return;
    default:
      return;
  }
}

function scheduleReconnect() {
  const state = getRuntimeState();
  if (state.reconnectTimer) {
    return;
  }

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void ensureWebBridgeControlPlane().catch(() => {});
  }, RECONNECT_DELAY_MS);
}

async function openControlSocket() {
  await ensureWebBridgeSidecarReady();

  const state = getRuntimeState();
  const socket = new WebSocket(getWebBridgeControlWsUrl(), WEB_BRIDGE_CONTROL_PROTOCOL);
  state.socket = socket;

  socket.addEventListener("open", () => {
    state.connected = true;
    state.lastConnectedAt = new Date().toISOString();
    state.lastError = null;
    flushQueue(state);
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(String(event.data || ""));
      void handleControlMessage(parsed);
    } catch (error) {
      state.lastError = error.message || String(error);
    }
  });

  socket.addEventListener("close", () => {
    state.connected = false;
    state.socket = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", (event) => {
    state.lastError = event?.message || "Rust control websocket error";
  });

  await new Promise((resolve, reject) => {
    const onOpen = () => {
      socket.removeEventListener("error", onError);
      resolve();
    };
    const onError = (error) => {
      socket.removeEventListener("open", onOpen);
      reject(error);
    };
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
  });
}

export async function ensureWebBridgeControlPlane() {
  const state = getRuntimeState();
  if (state.connected && state.socket?.readyState === WebSocket.OPEN) {
    return;
  }

  if (state.connectPromise) {
    return state.connectPromise;
  }

  state.connectPromise = openControlSocket()
    .finally(() => {
      state.connectPromise = null;
    });

  return state.connectPromise;
}

export async function syncWebBridgeFullState() {
  await ensureWebBridgeControlPlane();
  queueMessage(await buildStateSnapshot());
}

export async function emitWebBridgeSessionUpsert(provider, session) {
  try {
    await ensureWebBridgeControlPlane();
    queueMessage({
      type: "session.upsert",
      payload: {
        provider,
        session,
      },
    });
  } catch {
  }
}

export async function emitWebBridgeSessionRemove(provider) {
  try {
    await ensureWebBridgeControlPlane();
    queueMessage({
      type: "session.remove",
      payload: { provider },
    });
  } catch {
  }
}

export async function emitWebBridgeConfigUpdate() {
  try {
    const settings = await getSettings();
    await ensureWebBridgeControlPlane();
    queueMessage({
      type: "config.update",
      payload: {
        requireApiKey: settings.requireApiKey === true,
      },
    });
  } catch {
  }
}

export async function emitWebBridgeApiKeysUpdate() {
  try {
    const apiKeys = await getApiKeys();
    await ensureWebBridgeControlPlane();
    queueMessage({
      type: "api_keys.update",
      payload: {
        apiKeys: apiKeys
          .filter((entry) => entry?.key && entry.isActive !== false)
          .map((entry) => ({
            id: entry.id,
            key: entry.key,
            name: entry.name || "",
          })),
      },
    });
  } catch {
  }
}

export async function issueWebBridgeBrowserTicket({ ttlMs = 2 * 60_000, label = "dashboard" } = {}) {
  await ensureWebBridgeControlPlane();

  const token = `wbt_${crypto.randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  queueMessage({
    type: "ticket.issue",
    payload: {
      token,
      label,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export function getWebBridgeControlPlaneStatus() {
  const state = getRuntimeState();
  return {
    connected: state.connected,
    lastConnectedAt: state.lastConnectedAt,
    lastError: state.lastError,
    lastMetrics: state.lastMetrics,
    sidecar: getWebBridgeSidecarStatus(),
  };
}
