/**
 * Inject Relay WebSocket Server
 *
 * WS server riêng cho inject relay — persistent connection giữa backend ↔ extension.
 * Extension kết nối 1 lần, giữ mở vĩnh viễn, nhận task real-time.
 *
 * Port: INJECT_RELAY_WS_PORT (default 21099)
 */

import { WebSocketServer } from "ws";
import {
  getPendingTask,
  taskNotifier,
} from "@/lib/injectRelay";

const DEFAULT_PORT = 21099;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s ping

// ── Singleton guard ──
if (!globalThis.__injectRelayWs) {
  globalThis.__injectRelayWs = {
    wss: null,
    started: false,
    clients: new Map(), // provider → Set<ws>
  };
}

const state = globalThis.__injectRelayWs;

/**
 * Lấy port cho WS server
 */
export function getInjectRelayWsPort() {
  const parsed = Number(process.env.INJECT_RELAY_WS_PORT || DEFAULT_PORT);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

/**
 * Lấy WS URL cho extension kết nối
 */
export function getInjectRelayWsUrl() {
  return `ws://127.0.0.1:${getInjectRelayWsPort()}/inject-relay`;
}

/**
 * Gửi task tới extension qua WS
 */
function pushTaskToProvider(provider, task) {
  const clients = state.clients.get(provider);
  if (!clients || clients.size === 0) {
    console.warn(`[InjectRelayWS] No WS client for provider ${provider}`);
    return false;
  }

  const payload = JSON.stringify({
    type: "task",
    task: {
      taskId: task.taskId,
      prompt: task.prompt,
      model: task.model,
      provider: task.provider,
    },
  });

  let sent = false;
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(payload);
      sent = true;
      break; // Chỉ gửi cho 1 client (tránh duplicate)
    }
  }

  return sent;
}

/**
 * Start the WebSocket server for inject relay
 */
export function startInjectRelayWsServer() {
  if (state.started) {
    console.log("[InjectRelayWS] Already started, skipping.");
    return state.wss;
  }

  const port = getInjectRelayWsPort();

  const wss = new WebSocketServer({
    port,
    path: "/inject-relay",
  });

  state.wss = wss;
  state.started = true;

  console.log(`[InjectRelayWS] ✅ WebSocket server started on ws://127.0.0.1:${port}/inject-relay`);

  // ── Handle connections ──
  wss.on("connection", (ws, req) => {
    // Parse provider từ query string: ws://host/inject-relay?provider=gemini-web
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const provider = url.searchParams.get("provider") || "";

    if (!provider) {
      ws.close(4001, "Missing provider param");
      return;
    }

    // Register client
    if (!state.clients.has(provider)) {
      state.clients.set(provider, new Set());
    }
    state.clients.get(provider).add(ws);
    ws.isAlive = true;
    ws.provider = provider;

    console.log(`[InjectRelayWS] Client connected: ${provider} (total: ${state.clients.get(provider).size})`);

    // Gửi ack
    ws.send(JSON.stringify({ type: "connected", provider }));

    // Kiểm tra ngay xem có pending task không
    const pendingTask = getPendingTask(provider);
    if (pendingTask) {
      console.log(`[InjectRelayWS] Found pending task ${pendingTask.taskId} for ${provider}, pushing immediately`);
      ws.send(JSON.stringify({
        type: "task",
        task: {
          taskId: pendingTask.taskId,
          prompt: pendingTask.prompt,
          model: pendingTask.model,
          provider: pendingTask.provider,
        },
      }));
    }

    // Handle incoming messages (delta/done/error từ extension)
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Extension có thể gửi delta/done/error qua WS thay vì HTTP POST
        // Nhưng hiện tại vẫn dùng HTTP POST cho kết quả (đã ổn định)
        if (msg.type === "pong") {
          ws.isAlive = true;
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      const providerClients = state.clients.get(provider);
      if (providerClients) {
        providerClients.delete(ws);
        if (providerClients.size === 0) {
          state.clients.delete(provider);
        }
      }
      console.log(`[InjectRelayWS] Client disconnected: ${provider} (remaining: ${state.clients.get(provider)?.size || 0})`);
    });

    ws.on("error", (err) => {
      console.warn(`[InjectRelayWS] Client error (${provider}):`, err.message);
    });
  });

  // ── Heartbeat: ping tất cả clients mỗi 30s ──
  const heartbeatTimer = setInterval(() => {
    for (const [provider, clients] of state.clients.entries()) {
      for (const ws of clients) {
        if (!ws.isAlive) {
          ws.terminate();
          clients.delete(ws);
          continue;
        }
        ws.isAlive = false;
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  // ── Listen taskNotifier: khi có task mới → push qua WS ──
  taskNotifier.on("newTask", ({ provider, taskId }) => {
    const task = getPendingTask(provider);
    if (task) {
      const pushed = pushTaskToProvider(provider, task);
      if (pushed) {
        console.log(`[InjectRelayWS] Pushed task ${task.taskId} to ${provider} via WS`);
      } else {
        console.warn(`[InjectRelayWS] Failed to push task ${task.taskId} — no active WS client for ${provider}`);
      }
    }
  });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[InjectRelayWS] Port ${port} already in use — likely another instance running.`);
      state.started = false;
    } else {
      console.error("[InjectRelayWS] Server error:", err.message);
    }
  });

  return wss;
}

/**
 * Kiểm tra có WS client nào đang kết nối cho provider không
 */
export function hasActiveWsClient(provider) {
  const clients = state.clients.get(provider);
  if (!clients) return false;
  for (const ws of clients) {
    if (ws.readyState === 1) return true;
  }
  return false;
}
