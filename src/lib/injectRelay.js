/**
 * Inject Relay — In-memory task queue + result streaming
 *
 * Cho phép backend gửi inject tasks tới extension (qua HTTP long-polling)
 * và nhận kết quả (delta/done) realtime.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

// ── Config ──
const TASK_TTL_MS = 180_000; // 3 phút TTL per task
const CLEANUP_INTERVAL_MS = 60_000;
const CONFIG_PATH = path.join(process.cwd(), "data", "inject_config.json");

// ── In-memory stores (dùng globalThis để đảm bảo singleton giữa Next.js routes) ──
if (!globalThis.__injectRelay) {
  globalThis.__injectRelay = {
    pendingTasks: new Map(),     // taskId → { provider, prompt, model, createdAt, status }
    taskEmitters: new Map(),     // taskId → EventEmitter (delta, done, error)
    injectConfig: new Map(),     // provider → { enabled }
    taskNotifier: new EventEmitter(),
  };
  globalThis.__injectRelay.taskNotifier.setMaxListeners(50);
}

const pendingTasks = globalThis.__injectRelay.pendingTasks;
const taskEmitters = globalThis.__injectRelay.taskEmitters;
const injectConfig = globalThis.__injectRelay.injectConfig;

// ── Task Notifier: cho phép poll endpoint nhận notify khi có task mới ──
export const taskNotifier = globalThis.__injectRelay.taskNotifier;

// Khởi tạo đọc từ file nếu có
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    for (const key of Object.keys(data)) {
      injectConfig.set(key, data[key]);
    }
  }
} catch (e) {
  // Bỏ qua lỗi đọc file
}

// ── Cleanup expired tasks ──
setInterval(() => {
  const now = Date.now();
  for (const [taskId, task] of pendingTasks.entries()) {
    if (now - task.createdAt > TASK_TTL_MS) {
      const emitter = taskEmitters.get(taskId);
      if (emitter) {
        emitter.emit("error", { error: "Task expired (timeout)" });
        taskEmitters.delete(taskId);
      }
      pendingTasks.delete(taskId);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Tạo inject task mới
 */
export function createInjectTask(provider, prompt, model = "") {
  const taskId = `inject-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);

  const task = {
    taskId,
    provider,
    prompt,
    model,
    createdAt: Date.now(),
    status: "pending", // pending → assigned → streaming → done | error
  };

  pendingTasks.set(taskId, task);
  taskEmitters.set(taskId, emitter);

  // Notify poll endpoint ngay lập tức
  taskNotifier.emit("newTask", { provider, taskId });

  return { taskId, emitter };
}

/**
 * Lấy pending task cho provider (extension polling gọi hàm này)
 */
export function getPendingTask(provider) {
  for (const [taskId, task] of pendingTasks.entries()) {
    if (task.provider === provider && task.status === "pending") {
      task.status = "assigned";
      return { ...task };
    }
  }
  return null;
}

/**
 * Chờ kết quả hoàn chỉnh (cho non-stream mode)
 */
export function waitForResult(taskId, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const emitter = taskEmitters.get(taskId);
    if (!emitter) {
      reject(new Error("Task not found"));
      return;
    }

    let fullText = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Inject task timeout"));
    }, timeoutMs);

    function onDelta({ delta, fullText: ft }) {
      if (ft) fullText = ft;
      else fullText += delta || "";
    }

    function onDone({ text }) {
      cleanup();
      resolve(text || fullText);
    }

    function onError({ error }) {
      cleanup();
      reject(new Error(error || "Inject task failed"));
    }

    function cleanup() {
      clearTimeout(timer);
      emitter.off("delta", onDelta);
      emitter.off("done", onDone);
      emitter.off("error", onError);
      pendingTasks.delete(taskId);
      taskEmitters.delete(taskId);
    }

    emitter.on("delta", onDelta);
    emitter.on("done", onDone);
    emitter.on("error", onError);
  });
}

/**
 * Lấy emitter cho stream mode (backend listen trực tiếp)
 */
export function getTaskEmitter(taskId) {
  return taskEmitters.get(taskId) || null;
}

/**
 * Extension gửi delta
 */
export function submitDelta(taskId, delta, fullText = "") {
  const emitter = taskEmitters.get(taskId);
  const task = pendingTasks.get(taskId);
  if (!emitter || !task) return false;

  task.status = "streaming";
  emitter.emit("delta", { delta, fullText });
  return true;
}

/**
 * Extension gửi done
 */
export function submitDone(taskId, text) {
  const emitter = taskEmitters.get(taskId);
  const task = pendingTasks.get(taskId);
  if (!emitter) return false;

  if (task) task.status = "done";
  emitter.emit("done", { text });

  // Cleanup sau 5s (cho stream mode kịp đọc)
  setTimeout(() => {
    pendingTasks.delete(taskId);
    taskEmitters.delete(taskId);
  }, 5000);

  return true;
}

/**
 * Extension gửi error
 */
export function submitError(taskId, error) {
  const emitter = taskEmitters.get(taskId);
  const task = pendingTasks.get(taskId);
  if (!emitter) return false;

  if (task) task.status = "error";
  emitter.emit("error", { error });

  setTimeout(() => {
    pendingTasks.delete(taskId);
    taskEmitters.delete(taskId);
  }, 5000);

  return true;
}

/**
 * Config inject mode per provider
 */
export function setInjectModeEnabled(provider, enabled) {
  const existing = injectConfig.get(provider) || {};
  injectConfig.set(provider, { ...existing, enabled: !!enabled });
  _persistConfig();
}

export function isInjectModeEnabled(provider) {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    // Ưu tiên bridgeMode nếu có, fallback sang enabled cũ
    if (data[provider]?.bridgeMode) {
      return data[provider].bridgeMode === "inject";
    }
    return data[provider]?.enabled === true;
  } catch (e) {
    const cfg = injectConfig.get(provider);
    if (cfg?.bridgeMode) {
      return cfg.bridgeMode === "inject";
    }
    return cfg?.enabled === true;
  }
}

/**
 * Bridge Mode per provider: "direct" | "inject"
 * - "direct": API bên ngoài gọi → dùng session cookie trực tiếp
 * - "inject": API bên ngoài gọi → route qua inject relay (extension inject vào tab AI)
 */
export function setBridgeMode(provider, mode) {
  const validMode = mode === "inject" ? "inject" : "direct";
  const existing = injectConfig.get(provider) || {};

  // Sync enabled flag theo bridgeMode → single source of truth
  const enabled = validMode === "inject";
  injectConfig.set(provider, { ...existing, bridgeMode: validMode, enabled });

  _persistConfig();
}

export function getBridgeMode(provider) {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    const mode = data[provider]?.bridgeMode;
    return mode === "inject" ? "inject" : "direct";
  } catch (e) {
    const cfg = injectConfig.get(provider);
    return cfg?.bridgeMode === "inject" ? "inject" : "direct";
  }
}

function _persistConfig() {
  try {
    const data = {};
    for (const [k, v] of injectConfig.entries()) {
      data[k] = v;
    }
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    // Bỏ qua lỗi ghi file
  }
}

/**
 * Debug: trả trạng thái relay
 */
export function getRelayStatus() {
  const tasks = [];
  for (const [taskId, task] of pendingTasks.entries()) {
    tasks.push({ taskId, provider: task.provider, status: task.status, age: Date.now() - task.createdAt });
  }
  const config = {};
  for (const [provider, cfg] of injectConfig.entries()) {
    config[provider] = cfg;
  }
  return { tasks, config, taskCount: pendingTasks.size };
}
