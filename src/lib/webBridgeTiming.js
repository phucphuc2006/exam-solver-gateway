import { createLogger } from "@/lib/logger";

function getNow() {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }

  return Date.now();
}

function normalizeMs(value) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function createWebBridgeTimingTracker({
  bridge,
  mode = "json",
  requestId = "",
} = {}) {
  const logger = createLogger(`web-bridge.${bridge || "unknown"}`);
  const startedAt = getNow();
  const base = {
    bridge: normalizeOptionalString(bridge) || "unknown",
    mode: normalizeOptionalString(mode) || "json",
    requestId: normalizeOptionalString(requestId),
    startedAt: new Date().toISOString(),
    upstreamReadyMs: null,
    firstByteMs: null,
    firstDeltaMs: null,
    completedMs: null,
  };

  function snapshot(extra = {}) {
    return {
      ...base,
      ...extra,
    };
  }

  function markOnce(key, extra = {}) {
    if (base[key] !== null) {
      return base[key];
    }

    base[key] = normalizeMs(getNow() - startedAt);
    logger.debug(`timing.${key}`, snapshot(extra));
    return base[key];
  }

  return {
    markUpstreamReady(extra = {}) {
      return markOnce("upstreamReadyMs", extra);
    },
    markFirstByte(extra = {}) {
      return markOnce("firstByteMs", extra);
    },
    markFirstDelta(extra = {}) {
      return markOnce("firstDeltaMs", extra);
    },
    markCompleted(extra = {}) {
      markOnce("completedMs", extra);
      const result = snapshot(extra);
      logger.info("timing.completed", result);
      return result;
    },
    snapshot,
  };
}

export function buildWebBridgeMetricsHeaders(metrics = {}, init = undefined) {
  const headers = new Headers(init);
  const provider = normalizeOptionalString(metrics.bridge);
  const mode = normalizeOptionalString(metrics.mode);

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    [
      "X-Web-Bridge-Provider",
      "X-Web-Bridge-Mode",
      "X-Web-Bridge-Upstream-Ready-Ms",
      "X-Web-Bridge-First-Byte-Ms",
      "X-Web-Bridge-First-Delta-Ms",
      "X-Web-Bridge-Completed-Ms",
    ].join(", "),
  );

  if (provider) {
    headers.set("X-Web-Bridge-Provider", provider);
  }

  if (mode) {
    headers.set("X-Web-Bridge-Mode", mode);
  }

  if (metrics.upstreamReadyMs !== null && metrics.upstreamReadyMs !== undefined) {
    headers.set("X-Web-Bridge-Upstream-Ready-Ms", String(metrics.upstreamReadyMs));
  }

  if (metrics.firstByteMs !== null && metrics.firstByteMs !== undefined) {
    headers.set("X-Web-Bridge-First-Byte-Ms", String(metrics.firstByteMs));
  }

  if (metrics.firstDeltaMs !== null && metrics.firstDeltaMs !== undefined) {
    headers.set("X-Web-Bridge-First-Delta-Ms", String(metrics.firstDeltaMs));
  }

  if (metrics.completedMs !== null && metrics.completedMs !== undefined) {
    headers.set("X-Web-Bridge-Completed-Ms", String(metrics.completedMs));
  }

  return headers;
}

export function formatWebBridgeMetricsSseEvent(metrics = {}) {
  return `event: bridge_metrics\ndata: ${JSON.stringify(metrics)}\n\n`;
}
