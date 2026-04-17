/**
 * Inject Relay API Routes
 *
 * GET  /api/inject-relay?action=poll&provider=X   — Extension long-poll cho pending tasks
 * POST /api/inject-relay (action=delta|done|error|config|status|set-mode)
 */

import {
  getPendingTask,
  submitDelta,
  submitDone,
  submitError,
  setInjectModeEnabled,
  isInjectModeEnabled,
  setBridgeMode,
  getBridgeMode,
  getRelayStatus,
  taskNotifier,
} from "@/lib/injectRelay";

const LONG_POLL_TIMEOUT_MS = 25_000; // 25s long-poll
const POLL_INTERVAL_MS = 500;

/**
 * GET — Extension long-poll cho pending inject tasks
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "poll";
  const provider = searchParams.get("provider") || "";

  if (action === "status") {
    return Response.json({ ok: true, ...getRelayStatus() }, { headers: corsHeaders() });
  }

  if (action !== "poll" || !provider) {
    return Response.json(
      { ok: false, error: "Missing provider param" },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Long-polling: chờ task mới hoặc timeout sau 25s (EVENT-DRIVEN)
  // Check ngay lập tức trước
  const immediateTask = getPendingTask(provider);
  if (immediateTask) {
    return Response.json(
      {
        ok: true,
        task: {
          taskId: immediateTask.taskId,
          prompt: immediateTask.prompt,
          model: immediateTask.model,
          provider: immediateTask.provider,
        },
      },
      { headers: corsHeaders() },
    );
  }

  // Nếu không có task, chờ event hoặc timeout
  const task = await new Promise((resolve) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      taskNotifier.off("newTask", onNewTask);
      resolve(null);
    }, LONG_POLL_TIMEOUT_MS);

    function onNewTask({ provider: taskProvider }) {
      if (settled) return;
      // Chỉ respond khi provider match
      if (taskProvider === provider) {
        settled = true;
        clearTimeout(timeoutId);
        taskNotifier.off("newTask", onNewTask);
        resolve(getPendingTask(provider));
      }
    }

    taskNotifier.on("newTask", onNewTask);

    // Abort handling
    if (request.signal) {
      request.signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        taskNotifier.off("newTask", onNewTask);
        resolve(null);
      }, { once: true });
    }
  });

  if (task) {
    return Response.json(
      {
        ok: true,
        task: {
          taskId: task.taskId,
          prompt: task.prompt,
          model: task.model,
          provider: task.provider,
        },
      },
      { headers: corsHeaders() },
    );
  }

  // Timeout — trả 204 No Content
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * POST — Extension gửi delta/done/error, hoặc frontend config
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const action = String(body.action || "").trim();

  // ── Delta: extension gửi text chunk ──
  if (action === "delta") {
    const { taskId, delta, fullText } = body;
    if (!taskId) {
      return Response.json({ ok: false, error: "Missing taskId" }, { status: 400, headers: corsHeaders() });
    }

    const success = submitDelta(taskId, delta || "", fullText || "");
    return Response.json({ ok: success }, { headers: corsHeaders() });
  }

  // ── Done: extension gửi text hoàn chỉnh ──
  if (action === "done") {
    const { taskId, text } = body;
    if (!taskId) {
      return Response.json({ ok: false, error: "Missing taskId" }, { status: 400, headers: corsHeaders() });
    }

    const success = submitDone(taskId, text || "");
    return Response.json({ ok: success }, { headers: corsHeaders() });
  }

  // ── Error: extension báo lỗi ──
  if (action === "error") {
    const { taskId, error } = body;
    if (!taskId) {
      return Response.json({ ok: false, error: "Missing taskId" }, { status: 400, headers: corsHeaders() });
    }

    const success = submitError(taskId, error || "Inject failed");
    return Response.json({ ok: success }, { headers: corsHeaders() });
  }

  // ── Config: frontend bật/tắt inject mode per provider ──
  if (action === "config") {
    const { provider, enabled } = body;
    if (!provider) {
      return Response.json({ ok: false, error: "Missing provider" }, { status: 400, headers: corsHeaders() });
    }

    setInjectModeEnabled(provider, enabled);
    return Response.json({ ok: true, provider, enabled: !!enabled }, { headers: corsHeaders() });
  }

  // ── Set Bridge Mode: frontend chọn direct/inject ──
  if (action === "set-mode") {
    const { provider, mode } = body;
    if (!provider) {
      return Response.json({ ok: false, error: "Missing provider" }, { status: 400, headers: corsHeaders() });
    }

    const validMode = mode === "inject" ? "inject" : "direct";
    setBridgeMode(provider, validMode);
    return Response.json({ ok: true, provider, bridgeMode: validMode }, { headers: corsHeaders() });
  }

  // ── Get Bridge Mode ──
  if (action === "get-mode") {
    const { provider } = body;
    if (!provider) {
      return Response.json({ ok: false, error: "Missing provider" }, { status: 400, headers: corsHeaders() });
    }

    const bridgeMode = getBridgeMode(provider);
    return Response.json({ ok: true, provider, bridgeMode }, { headers: corsHeaders() });
  }

  // ── Status: kiểm tra relay state ──
  if (action === "status") {
    return Response.json({ ok: true, ...getRelayStatus() }, { headers: corsHeaders() });
  }

  return Response.json(
    { ok: false, error: `Unknown action: ${action}` },
    { status: 400, headers: corsHeaders() },
  );
}

/**
 * OPTIONS — CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
