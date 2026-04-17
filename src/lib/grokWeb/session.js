// ── Grok Web Bridge — Session & Cookie Management ──

import { getGrokWebSession, upsertGrokWebSession } from "@/lib/localDb";
import {
  GROK_WEB_BASE_URL,
  GROK_WEB_APP_URL,
  GROK_WEB_HEADERS,
  GROK_WEB_DEFAULT_MODELS,
  GROK_FORBIDDEN_CAPTURE_HEADERS,
  normalizeString,
  isPlainObject,
  safeParseJson,
  nowIso,
  cloneJsonValue,
  createGrokError,
  readResponseTextSnippet,
} from "./constants.js";

// ── Cookie utilities ──

export function parseCookieHeaderString(cookieHeader = "") {
  const result = {};

  for (const part of String(cookieHeader || "").split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const name = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (!name || !value) continue;
    result[name] = value;
  }

  return result;
}

export function buildCookieHeader(cookies = {}) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function serializeCookies(cookies = {}) {
  return JSON.stringify(
    Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
      domain: "grok.com",
      path: "/",
      secure: true,
      httpOnly: true,
    })),
  );
}

export function normalizeGrokCookies(rawCookies = {}) {
  const cookies = rawCookies && typeof rawCookies === "object" ? rawCookies : {};
  if (Object.keys(cookies).length === 0) {
    throw new Error("Grok Web cần cookie header hợp lệ từ grok.com.");
  }
  return cookies;
}

// ── Header normalization ──

export function normalizeGrokCapturedHeaders(headers = {}) {
  const result = {};

  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = normalizeString(rawKey).toLowerCase();
    if (!key || GROK_FORBIDDEN_CAPTURE_HEADERS.has(key)) {
      continue;
    }

    const value = Array.isArray(rawValue)
      ? rawValue.join(", ")
      : normalizeString(rawValue);
    if (!value) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

// ── Provider data helpers ──

export function normalizeGrokRequestTemplate(template) {
  return isPlainObject(template) ? cloneJsonValue(template, null) : null;
}

export function readGrokProviderData(session) {
  return safeParseJson(session?.providerDataJson, null);
}

export function buildGrokProviderData(session, overrides = {}) {
  const existing = readGrokProviderData(session);
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing
    : {};
  return {
    ...base,
    ...overrides,
  };
}

export function isGrokSessionModeEnabled(session) {
  return session?.sessionModeEnabled === true;
}

export function getGrokConversationRotationInterval(session) {
  const value = Number(session?.conversationRotationInterval ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function getGrokConversationTurnCount(session) {
  const value = Number(session?.conversationTurnCount ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function getSessionCookies(session) {
  const cookies = safeParseJson(session?.cookiesJson, []);
  if (!Array.isArray(cookies)) {
    return {};
  }

  return Object.fromEntries(
    cookies
      .filter((entry) => entry?.name && entry?.value)
      .map((entry) => [String(entry.name), String(entry.value)]),
  );
}

export function getSessionHeaders(session) {
  return normalizeGrokCapturedHeaders(
    safeParseJson(session?.headersJson, {}),
  );
}

export function getStoredGrokRequestTemplate(session) {
  return normalizeGrokRequestTemplate(
    safeParseJson(session?.requestTemplateJson, null),
  );
}

export function getStoredGrokModels(session) {
  const models = safeParseJson(session?.availableModelsJson, []);
  return Array.isArray(models) && models.length > 0 ? models : GROK_WEB_DEFAULT_MODELS;
}

// ── Replay headers ──

export function buildGrokReplayHeaders({ cookies = {}, sessionHeaders = {}, headers = {} } = {}) {
  const capturedHeaders = normalizeGrokCapturedHeaders(sessionHeaders);
  const mergedHeaders = {
    ...GROK_WEB_HEADERS,
    ...capturedHeaders,
    ...Object.fromEntries(
      Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]),
    ),
  };

  const userAgent = normalizeString(
    mergedHeaders["user-agent"]
    || capturedHeaders["user-agent"]
    || GROK_WEB_HEADERS["user-agent"],
  );
  mergedHeaders["user-agent"] = userAgent || GROK_WEB_HEADERS["user-agent"];

  const cookieHeader = buildCookieHeader(cookies);
  if (cookieHeader) {
    mergedHeaders.cookie = cookieHeader;
  } else {
    delete mergedHeaders.cookie;
  }

  return mergedHeaders;
}

// ── Session redaction ──

export function redactGrokWebSession(session) {
  if (!session) return null;

  const cookies = getSessionCookies(session);
  const historySyncEnabled = session.historySyncEnabled === true;
  const sessionModeEnabled = isGrokSessionModeEnabled(session);
  const headers = getSessionHeaders(session);
  const requestTemplate = getStoredGrokRequestTemplate(session);

  return {
    id: session.id,
    provider: session.provider,
    status: session.status || "missing",
    cookieCount: Object.keys(cookies).length,
    capturedAt: session.capturedAt || null,
    updatedAt: session.updatedAt || null,
    lastValidatedAt: session.lastValidatedAt || null,
    lastError: session.lastError || null,
    lastErrorAt: session.lastErrorAt || null,
    availableModels: getStoredGrokModels(session),
    captureUrl: session.captureUrl || null,
    capturedTargetPath: session.capturedTargetPath || null,
    headerKeys: Object.keys(headers).sort(),
    hasCapturedRequestTemplate: Boolean(requestTemplate),
    historySyncEnabled,
    sessionModeEnabled,
    conversationRotationInterval: getGrokConversationRotationInterval(session),
    conversationTurnCount: getGrokConversationTurnCount(session),
    historySyncConversationReady: historySyncEnabled && Boolean(session.syncedConversationId),
    sessionConversationReady: sessionModeEnabled && Boolean(session.syncedConversationId),
  };
}

// ── Connect & Validate ──

export function normalizeGrokWebConnectPayload(payload = {}) {
  const cookies = normalizeGrokCookies(
    payload.cookies && typeof payload.cookies === "object"
      ? payload.cookies
      : parseCookieHeaderString(payload.cookieHeader || ""),
  );
  const headers = normalizeGrokCapturedHeaders(
    payload.headers && typeof payload.headers === "object" ? payload.headers : {},
  );
  const requestTemplate = normalizeGrokRequestTemplate(payload.requestTemplate);

  return {
    status: "captured",
    cookiesJson: serializeCookies(cookies),
    headersJson: JSON.stringify(headers),
    requestTemplateJson: JSON.stringify(requestTemplate),
    providerDataJson: JSON.stringify({ cookies }),
    userAgent: normalizeString(payload.userAgent)
      || normalizeString(headers["user-agent"])
      || GROK_WEB_HEADERS["user-agent"],
    capturedAt: normalizeString(payload.capturedAt) || nowIso(),
    captureUrl: normalizeString(payload.captureUrl) || null,
    capturedTargetPath: normalizeString(payload.capturedTargetPath) || null,
    captureSource: payload.captureSource || "manual",
    availableModelsJson: JSON.stringify(GROK_WEB_DEFAULT_MODELS),
    lastError: null,
    lastErrorAt: null,
  };
}

// ── Session validation ──

async function listGrokConversations(cookies, sessionHeaders = {}) {
  const response = await fetch(`${GROK_WEB_BASE_URL}/conversations?pageSize=1&useNewImplementation=true`, {
    method: "GET",
    headers: buildGrokReplayHeaders({
      cookies,
      sessionHeaders,
      headers: {
        accept: "*/*",
      },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Grok Web từ chối session hiện tại. Hãy auto-connect lại từ request chat thật trên grok.com.");
  }

  if (!response.ok) {
    throw new Error(`Grok Web trả về HTTP ${response.status} khi kiểm tra session.`);
  }

  return response.json().catch(() => null);
}

async function fetchGrokHomePage(cookies, sessionHeaders = {}) {
  const response = await fetch(GROK_WEB_APP_URL, {
    method: "GET",
    headers: buildGrokReplayHeaders({
      cookies,
      sessionHeaders,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    }),
    redirect: "follow",
  });

  const finalUrl = normalizeString(response.url);
  if (
    response.status === 401
    || response.status === 403
    || /\/login(?:\/|$|\?)/i.test(finalUrl)
  ) {
    throw new Error("Grok Web từ chối session hiện tại. Hãy auto-connect lại từ request chat thật trên grok.com.");
  }

  if (!response.ok) {
    const errorDetail = await readResponseTextSnippet(response);
    throw new Error(
      errorDetail
        ? `Grok Web trả về HTTP ${response.status} khi đọc trang chủ. ${errorDetail}`
        : `Grok Web trả về HTTP ${response.status} khi đọc trang chủ.`,
    );
  }

  const html = await response.text().catch(() => "");
  if (!html.trim()) {
    throw new Error("Grok Web trả về trang rỗng khi kiểm tra session.");
  }

  return {
    finalUrl,
  };
}

export async function validateGrokSessionCookies(cookies, sessionHeaders = {}) {
  try {
    await listGrokConversations(cookies, sessionHeaders);
    return { validationMethod: "list-conversations" };
  } catch (error) {
    await fetchGrokHomePage(cookies, sessionHeaders);
    return {
      validationMethod: "page-fallback",
      validationWarning: error.message || null,
    };
  }
}

export async function validateAndStoreGrokWebSession() {
  const session = await getGrokWebSession();
  if (!session) {
    throw createGrokError("Chưa có session Grok Web để validate.", 404);
  }

  const cookies = getSessionCookies(session);
  const sessionHeaders = getSessionHeaders(session);

  try {
    const validation = await validateGrokSessionCookies(cookies, sessionHeaders);
    return await upsertGrokWebSession({
      ...session,
      status: "validated",
      lastValidatedAt: nowIso(),
      lastError: null,
      lastErrorAt: null,
      providerDataJson: JSON.stringify(buildGrokProviderData(session, {
        cookies,
        validationMethod: validation.validationMethod,
        validationWarning: validation.validationWarning || null,
      })),
      availableModelsJson: JSON.stringify(GROK_WEB_DEFAULT_MODELS),
    });
  } catch (error) {
    const failedSession = await upsertGrokWebSession({
      ...session,
      status: "error",
      lastError: error.message || "Grok Web validate failed.",
      lastErrorAt: nowIso(),
    });
    throw createGrokError(error.message || "Grok Web validate failed.", 401, failedSession);
  }
}
