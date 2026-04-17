export function parseDateMs(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function shouldShowSessionLastError(session) {
  if (!session?.lastError) {
    return false;
  }

  if (session.status === "error") {
    return true;
  }

  const lastErrorAtMs = parseDateMs(session.lastErrorAt);
  const lastValidatedAtMs = parseDateMs(session.lastValidatedAt);

  if (lastErrorAtMs !== null && lastValidatedAtMs !== null && lastValidatedAtMs >= lastErrorAtMs) {
    return false;
  }

  return session.status !== "validated";
}

export function parseTimingHeaderValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readWebBridgeMetricsFromHeaders(headers) {
  if (!headers || typeof headers.get !== "function") {
    return null;
  }

  const provider = String(headers.get("x-web-bridge-provider") || "").trim();
  const mode = String(headers.get("x-web-bridge-mode") || "").trim();
  const upstreamReadyMs = parseTimingHeaderValue(headers.get("x-web-bridge-upstream-ready-ms"));
  const firstByteMs = parseTimingHeaderValue(headers.get("x-web-bridge-first-byte-ms"));
  const firstDeltaMs = parseTimingHeaderValue(headers.get("x-web-bridge-first-delta-ms"));
  const completedMs = parseTimingHeaderValue(headers.get("x-web-bridge-completed-ms"));

  if (!provider && !mode && upstreamReadyMs === null && firstByteMs === null && firstDeltaMs === null && completedMs === null) {
    return null;
  }

  return {
    bridge: provider || "",
    mode: mode || "",
    upstreamReadyMs,
    firstByteMs,
    firstDeltaMs,
    completedMs,
  };
}

export function formatTimingMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)} ms` : "—";
}

export function statusVariant(status) {
  if (status === "validated") return "success";
  if (status === "error") return "error";
  if (status === "captured") return "warning";
  return "default";
}

export function statusLabel(status) {
  if (status === "validated") return "Sẵn sàng";
  if (status === "error") return "Lỗi";
  if (status === "captured") return "Đã nhập session";
  return "Chưa kết nối";
}

export function getAutoConnectDescription(config, browserExtensionAvailable) {
  if (browserExtensionAvailable && config.autoConnectDescription) {
    return config.autoConnectDescription;
  }

  const originLabel = config.autoConnectOriginLabel || config.providerKey;
  return browserExtensionAvailable
    ? `Extension đã sẵn sàng. Bấm nút để NexusAI tự lấy session từ ${originLabel} đang đăng nhập trên trình duyệt này.`
    : `Cài hoặc reload extension rồi mở lại dashboard để tự lấy session từ ${originLabel} mà không cần dán tay.`;
}
