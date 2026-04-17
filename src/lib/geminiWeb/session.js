// ── Gemini Web Bridge — Session & Cookie Management ──

import { getGeminiWebSession, upsertGeminiWebSession } from "@/lib/localDb";
import {
  GEMINI_WEB_PROVIDER,
  GEMINI_WEB_SESSION_ID,
  GEMINI_WEB_BASE_HEADERS,
  GEMINI_WEB_DEFAULT_MODELS,
  normalizeString,
  safeParseJson,
  createGeminiError,
} from "./constants.js";
import { parseGeminiTokensFromPage } from "./responseParser.js";

// ── Cookie utilities ──

export function buildCookieHeader(cookies = {}) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

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

export function normalizeGeminiCookies(raw = {}) {
  const candidate = Array.isArray(raw)
    ? Object.fromEntries(raw.map((entry) => [entry?.name, entry?.value]))
    : raw;
  const cookies = candidate && typeof candidate === "object" ? candidate : {};
  const psid = normalizeString(
    cookies.__Secure_1PSID
    || cookies["__Secure-1PSID"]
    || cookies.psid,
  );
  const psidts = normalizeString(
    cookies.__Secure_1PSIDTS
    || cookies["__Secure-1PSIDTS"]
    || cookies.psidts,
  );

  if (!psid || !psidts) {
    throw new Error("Gemini Web cần đủ 2 cookie __Secure-1PSID và __Secure-1PSIDTS.");
  }

  return {
    "__Secure-1PSID": psid,
    "__Secure-1PSIDTS": psidts,
  };
}

export function serializeCookies(cookies = {}) {
  return JSON.stringify(
    Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
      domain: ".google.com",
      path: "/",
      secure: true,
      httpOnly: true,
    })),
  );
}

// ── Provider data helpers ──

export function readGeminiProviderData(session) {
  return safeParseJson(session?.providerDataJson, null);
}

export function normalizeGeminiHistoryContextIds(value = []) {
  const list = Array.isArray(value) ? value : [];
  return [
    normalizeString(list[0]),
    normalizeString(list[1]),
    normalizeString(list[2]),
  ];
}

export function getGeminiHistoryContextIds(session) {
  const providerData = readGeminiProviderData(session);
  if (Array.isArray(providerData?.historyContextIds)) {
    return normalizeGeminiHistoryContextIds(providerData.historyContextIds);
  }

  return normalizeGeminiHistoryContextIds([
    session?.syncedConversationId,
    session?.syncedParentMessageId,
    "",
  ]);
}

export function isGeminiSessionModeEnabled(session) {
  return session?.sessionModeEnabled === true;
}

export function getGeminiConversationRotationInterval(session) {
  const value = Number(session?.conversationRotationInterval ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function getGeminiConversationTurnCount(session) {
  const value = Number(session?.conversationTurnCount ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function buildGeminiProviderData(session, overrides = {}) {
  const existing = readGeminiProviderData(session);
  const base = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing
    : {};
  const next = {
    ...base,
    ...overrides,
  };

  next.historyContextIds = normalizeGeminiHistoryContextIds(next.historyContextIds);
  return next;
}

export function getSessionCookies(session) {
  const providerData = readGeminiProviderData(session);
  if (providerData?.cookies && typeof providerData.cookies === "object") {
    return providerData.cookies;
  }

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

export function getStoredGeminiModels(session) {
  const models = safeParseJson(session?.availableModelsJson, []);
  return Array.isArray(models) && models.length > 0 ? models : GEMINI_WEB_DEFAULT_MODELS;
}

// ── Session redaction ──

export function redactGeminiWebSession(session) {
  if (!session) return null;

  const cookies = getSessionCookies(session);
  const historyContextIds = getGeminiHistoryContextIds(session);
  const historySyncEnabled = session.historySyncEnabled === true;
  const sessionModeEnabled = isGeminiSessionModeEnabled(session);

  return {
    id: session.id,
    provider: session.provider,
    status: session.status || "missing",
    cookieCount: Object.keys(cookies).length,
    hasPsid: Boolean(cookies["__Secure-1PSID"]),
    hasPsidts: Boolean(cookies["__Secure-1PSIDTS"]),
    capturedAt: session.capturedAt || null,
    updatedAt: session.updatedAt || null,
    lastValidatedAt: session.lastValidatedAt || null,
    lastError: session.lastError || null,
    lastErrorAt: session.lastErrorAt || null,
    availableModels: getStoredGeminiModels(session),
    historySyncEnabled,
    sessionModeEnabled,
    conversationRotationInterval: getGeminiConversationRotationInterval(session),
    conversationTurnCount: getGeminiConversationTurnCount(session),
    historySyncConversationReady: historySyncEnabled && Boolean(historyContextIds[0]),
    sessionConversationReady: sessionModeEnabled && Boolean(historyContextIds[0]),
  };
}

// ── Connect & Validate ──

export function normalizeGeminiWebConnectPayload(payload = {}) {
  const rawCookies = payload.cookies && typeof payload.cookies === "object"
    ? payload.cookies
    : parseCookieHeaderString(payload.cookieHeader || "");
  const cookies = normalizeGeminiCookies({
    ...rawCookies,
    "__Secure-1PSID": payload.psid || rawCookies["__Secure-1PSID"],
    "__Secure-1PSIDTS": payload.psidts || rawCookies["__Secure-1PSIDTS"],
  });

  let status = "captured";
  let tokens = null;
  let lastValidatedAt = null;

  if (payload.pageHtml) {
    try {
      if (typeof window === "undefined") {
        require("fs").writeFileSync(
          "C:/Users/phucv/Downloads/autoloadanh/9router_temp/gemini_full_html.html",
          payload.pageHtml,
          "utf-8"
        );
      }
    } catch {}

    try {
      tokens = parseGeminiTokensFromPage(payload.pageHtml);
      status = "validated";
      lastValidatedAt = new Date().toISOString();
    } catch (err) {
      console.warn("[Gemini Web] Có pageHtml từ extension nhưng parse token lỗi:", err.message);
    }
  }

  return {
    status,
    lastValidatedAt,
    cookiesJson: serializeCookies(cookies),
    providerDataJson: JSON.stringify({
      cookies,
      tokens,
      historyContextIds: ["", "", ""],
    }),
    userAgent: normalizeString(payload.userAgent) || GEMINI_WEB_BASE_HEADERS["User-Agent"],
    captureSource: payload.captureSource || "manual",
    availableModelsJson: JSON.stringify(GEMINI_WEB_DEFAULT_MODELS),
    lastError: null,
    lastErrorAt: null,
  };
}

export async function validateAndStoreGeminiWebSession() {
  const session = await getGeminiWebSession();
  if (!session) {
    throw createGeminiError("Chưa có session Gemini Web để validate.", 404);
  }

  const cookies = getSessionCookies(session);
  const existingProviderData = readGeminiProviderData(session) || {};

  try {
    const hasValidTokens = existingProviderData.tokens && existingProviderData.tokens.snlm0e && existingProviderData.tokens.bl;
    const tokens = hasValidTokens ? existingProviderData.tokens : await fetchGeminiPageTokens(cookies);

    const providerData = buildGeminiProviderData(session, {
      cookies,
      tokens,
    });
    return await upsertGeminiWebSession({
      ...session,
      status: "validated",
      lastValidatedAt: new Date().toISOString(),
      lastError: null,
      lastErrorAt: null,
      availableModelsJson: JSON.stringify(GEMINI_WEB_DEFAULT_MODELS),
      providerDataJson: JSON.stringify(providerData),
    });
  } catch (error) {
    const failedSession = await upsertGeminiWebSession({
      ...session,
      status: "error",
      lastError: error.message || "Gemini Web validate failed.",
      lastErrorAt: new Date().toISOString(),
    });
    throw createGeminiError(error.message || "Gemini Web validate failed.", 401, failedSession);
  }
}

// ── Token fetch ──

export async function fetchGeminiPageTokens(cookies) {
  const { GEMINI_WEB_APP_URL } = await import("./constants.js");

  const response = await fetch(GEMINI_WEB_APP_URL, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": GEMINI_WEB_BASE_HEADERS["User-Agent"],
      Cookie: buildCookieHeader(cookies),
    },
    redirect: "follow",
  });

  const finalUrl = response.url || "";
  if (
    response.status === 401
    || finalUrl.includes("accounts.google.com")
    || finalUrl.includes("consent.google.com")
  ) {
    throw new Error("Cookie Gemini Web đã bị Google từ chối. Hãy lấy lại cookie mới từ trình duyệt.");
  }

  if (!response.ok) {
    throw new Error(`Gemini Web trả về HTTP ${response.status} khi đọc trang /app.`);
  }

  return parseGeminiTokensFromPage(await response.text());
}
