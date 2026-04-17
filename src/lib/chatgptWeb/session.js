// ── ChatGPT Web Bridge — Session Management ──
// Handles: capture bundle normalization, session redaction, cookie/header operations,
// authorization checks, capture target validation, session persistence

import crypto from "node:crypto";
import { getChatgptWebSession, upsertChatgptWebSession } from "@/lib/localDb";
import {
  CHATGPT_WEB_SESSION_ID,
  CHATGPT_WEB_PROVIDER,
  CHATGPT_WEB_MODELS_URL,
  FORBIDDEN_CAPTURE_HEADERS,
  normalizeString,
  isPlainObject,
  safeParseJson,
  nowIso,
  cloneJsonValue,
  buildValidationError,
} from "./constants.js";
import { normalizeChatgptWebModels } from "./modelDiscovery.js";

// ── Cookie utilities ──

export function buildCookieHeader(cookies = []) {
  return cookies
    .filter((cookie) => normalizeString(cookie?.name) && normalizeString(cookie?.value))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function parseCookieHeader(cookieHeader = "") {
  const parsed = new Map();

  for (const rawPart of String(cookieHeader || "").split(";")) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }

    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name || !value) {
      continue;
    }

    parsed.set(name, value);
  }

  return parsed;
}

export function mergeCookieHeaders(...cookieHeaders) {
  const merged = new Map();

  for (const cookieHeader of cookieHeaders) {
    const entries = parseCookieHeader(cookieHeader);
    for (const [name, value] of entries.entries()) {
      merged.set(name, value);
    }
  }

  return Array.from(merged.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function getResponseSetCookieHeaders(response) {
  if (!response?.headers) {
    return [];
  }

  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie().filter(Boolean);
  }

  const single = normalizeString(response.headers.get("set-cookie"));
  return single ? [single] : [];
}

export function appendCookieFromResponse(response, runtimeCookieHeader, cookieName) {
  const { extractCookieValueFromSetCookie } = require("@/lib/chatgptWebSentinel");
  const nextValue = extractCookieValueFromSetCookie(getResponseSetCookieHeaders(response), cookieName);
  if (!nextValue) {
    return runtimeCookieHeader;
  }

  return mergeCookieHeaders(runtimeCookieHeader, `${cookieName}=${nextValue}`);
}

// ── Header utilities ──

export function normalizeCapturedHeaders(headers = {}) {
  const result = {};

  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = normalizeString(rawKey).toLowerCase();
    if (!key || FORBIDDEN_CAPTURE_HEADERS.has(key)) {
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

export function normalizeCapturedCookies(cookies = []) {
  if (!Array.isArray(cookies)) {
    return [];
  }

  return cookies
    .map((cookie) => {
      const name = normalizeString(cookie?.name);
      const value = normalizeString(cookie?.value);
      if (!name || !value) {
        return null;
      }

      return {
        name,
        value,
        domain: normalizeString(cookie?.domain),
        path: normalizeString(cookie?.path) || "/",
        secure: cookie?.secure === true,
        httpOnly: cookie?.httpOnly === true,
        expirationDate: cookie?.expirationDate ?? null,
      };
    })
    .filter(Boolean);
}

export function removeAuthHeaders(headers = {}) {
  const nextHeaders = { ...headers };
  delete nextHeaders.authorization;
  delete nextHeaders["chatgpt-account-id"];
  delete nextHeaders["x-chatgpt-account-id"];
  return nextHeaders;
}

// ── JWT / Authorization ──

export function decodeJwtPayload(token) {
  const raw = normalizeString(token);
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function getBearerTokenFromHeaders(headers = {}) {
  const authorization = normalizeString(headers.authorization);
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return normalizeString(authorization.slice(7));
}

export function hasBearerAuthorization(headers = {}) {
  return Boolean(getBearerTokenFromHeaders(headers));
}

export function getChatgptWebAuthorizationError(headers = {}) {
  const token = getBearerTokenFromHeaders(headers);
  if (!token) {
    return "Capture phải chứa Authorization Bearer từ request backend-api thật của ChatGPT Web.";
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return "Authorization đã capture không phải JWT hợp lệ. Hãy capture lại request conversation thật rồi import lại.";
  }

  const expiresAt = Number(payload?.exp || 0);
  if (expiresAt > 0 && Date.now() >= expiresAt * 1000) {
    return "Authorization token đã hết hạn. Hãy reconnect bằng request backend-api mới từ ChatGPT Web.";
  }

  return "";
}

// ── Capture target path ──

export function getTargetPathFromUrl(url) {
  const raw = normalizeString(url);
  if (!raw) {
    return "";
  }

  try {
    return normalizeString(new URL(raw).pathname);
  } catch {
    return raw.startsWith("/") ? raw : "";
  }
}

export function normalizeTargetPath(value) {
  const raw = normalizeString(value);
  if (!raw) {
    return "";
  }

  if (raw.startsWith("/")) {
    const questionIndex = raw.indexOf("?");
    return questionIndex >= 0 ? raw.slice(0, questionIndex) : raw;
  }

  return getTargetPathFromUrl(raw);
}

export function extractCapturedTargetPath({ captureUrl = "", capturedTargetPath = "", headers = {} } = {}) {
  const explicitTargetPath = normalizeTargetPath(capturedTargetPath);
  if (explicitTargetPath) {
    return explicitTargetPath;
  }

  const urlTargetPath = normalizeTargetPath(captureUrl);
  if (urlTargetPath) {
    return urlTargetPath;
  }

  return normalizeTargetPath(
    headers?.["x-openai-target-path"]
    || headers?.["x-openai-target-route"],
  );
}

export function isConversationTargetPath(path) {
  const normalized = normalizeTargetPath(path);
  return normalized === "/backend-api/f/conversation" || normalized === "/backend-api/conversation";
}

export function shouldPreserveAuthForTargetPath(path) {
  const normalized = normalizeTargetPath(path);
  return (
    isConversationTargetPath(normalized)
    || normalized === "/backend-api/f/conversation/prepare"
    || normalized === "/backend-api/conversation/prepare"
    || normalized === "/backend-api/sentinel/chat-requirements"
    || normalized === "/backend-api/files"
    || normalized.startsWith("/backend-api/files/")
  );
}

export function getChatgptWebCaptureMode(path) {
  if (isConversationTargetPath(path)) {
    return "conversation";
  }
  return "unknown";
}

export function getChatgptWebCaptureTargetError({ captureUrl = "", capturedTargetPath = "", headers = {} } = {}) {
  const resolvedTargetPath = extractCapturedTargetPath({ captureUrl, capturedTargetPath, headers });
  if (!resolvedTargetPath) {
    return "Capture phải đến từ request conversation thật của chat thường trên ChatGPT Web.";
  }

  if (getChatgptWebCaptureMode(resolvedTargetPath) === "unknown") {
    return `Capture hiện tại đến từ \`${resolvedTargetPath}\`, không phải route conversation của chat thường. Hãy capture lại đúng request backend-api của ChatGPT Web.`;
  }

  return "";
}

// ── Capture bundle normalization ──

export function normalizeChatgptWebCaptureBundle(bundle = {}) {
  const rawHeaders = bundle?.headers && typeof bundle.headers === "object" && !Array.isArray(bundle.headers)
    ? bundle.headers
    : {};
  const cookies = normalizeCapturedCookies(bundle.cookies);
  const headers = normalizeCapturedHeaders(rawHeaders);
  const userAgent = normalizeString(bundle.userAgent || headers["user-agent"]);
  const capturedAt = normalizeString(bundle.capturedAt) || nowIso();
  const captureUrl = normalizeString(bundle.captureUrl || bundle.capturedUrl || bundle.url || bundle.u || bundle.requestUrl);
  const captureSource = normalizeString(bundle.captureSource);
  const normalizeCapturedRequestTemplate = (template) => isPlainObject(template) ? cloneJsonValue(template, null) : null;
  const requestTemplate = normalizeCapturedRequestTemplate(
    bundle.requestTemplate
    || bundle.requestBody
    || bundle.bodyTemplate
    || bundle.payloadTemplate
    || null,
  );
  const capturedTargetPath = extractCapturedTargetPath({
    captureUrl,
    capturedTargetPath: bundle.capturedTargetPath,
    headers: rawHeaders,
  });

  if (cookies.length === 0 && !headers.authorization) {
    throw new Error("Capture bundle is missing ChatGPT cookies or authorization header.");
  }

  const authCaptureError = getChatgptWebAuthorizationError(headers);
  if (authCaptureError) {
    throw new Error(authCaptureError);
  }

  const captureTargetError = getChatgptWebCaptureTargetError({
    captureUrl,
    capturedTargetPath,
    headers: rawHeaders,
  });
  if (captureTargetError) {
    throw new Error(captureTargetError);
  }

  if (!userAgent) {
    throw new Error("Capture bundle is missing a user-agent.");
  }

  return {
    id: CHATGPT_WEB_SESSION_ID,
    provider: CHATGPT_WEB_PROVIDER,
    status: "captured",
    cookiesJson: JSON.stringify(cookies),
    headersJson: JSON.stringify(headers),
    requestTemplateJson: JSON.stringify(requestTemplate),
    userAgent,
    capturedAt,
    captureUrl: captureUrl || null,
    capturedTargetPath: capturedTargetPath || null,
    captureSource: captureSource || null,
    lastValidatedAt: null,
    lastError: null,
    lastErrorAt: null,
    availableModelsJson: JSON.stringify([]),
  };
}

// ── Session helpers ──

export function getStoredChatgptWebModels(session) {
  return safeParseJson(session?.availableModelsJson, []).filter(Boolean);
}

export function getStoredChatgptWebRequestTemplate(session) {
  const normalizeCapturedRequestTemplate = (template) => isPlainObject(template) ? cloneJsonValue(template, null) : null;
  return normalizeCapturedRequestTemplate(
    safeParseJson(session?.requestTemplateJson, null),
  );
}

export function isChatgptWebHistorySyncEnabled(session) {
  return session?.historySyncEnabled === true;
}

export function isChatgptWebSessionModeEnabled(session) {
  return session?.sessionModeEnabled === true;
}

export function getChatgptWebConversationRotationInterval(session) {
  const value = Number(session?.conversationRotationInterval ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function getChatgptWebConversationTurnCount(session) {
  const value = Number(session?.conversationTurnCount ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function getChatgptWebSyncedConversationState(session) {
  const conversationId = normalizeString(session?.syncedConversationId);
  const parentMessageId = normalizeString(session?.syncedParentMessageId);
  return {
    conversationId,
    parentMessageId,
    ready: Boolean(conversationId && parentMessageId),
  };
}

export function getChatgptWebRequestTemplateError(session, capturedTargetPath = "") {
  if (getChatgptWebCaptureMode(capturedTargetPath) !== "conversation") {
    return "";
  }

  if (getStoredChatgptWebRequestTemplate(session)) {
    return "";
  }

  return "Session chat thường hiện chưa có request template từ web thật. Hãy disconnect rồi auto-connect lại bằng extension mới, hoặc import cURL đầy đủ có body JSON của request conversation.";
}

// ── Session redaction (public-safe view) ──

export function redactChatgptWebSession(session) {
  if (!session) {
    return null;
  }

  const cookies = safeParseJson(session.cookiesJson, []);
  const headers = safeParseJson(session.headersJson, {});
  const requestTemplate = getStoredChatgptWebRequestTemplate(session);
  const availableModels = getStoredChatgptWebModels(session);
  const capturedTargetPath = extractCapturedTargetPath({
    captureUrl: session.captureUrl,
    capturedTargetPath: session.capturedTargetPath,
    headers,
  });
  const captureMode = getChatgptWebCaptureMode(capturedTargetPath);
  const cookieHeader = buildCookieHeader(cookies);
  const cookieMap = parseCookieHeader(cookieHeader);
  const syncedConversationState = getChatgptWebSyncedConversationState(session);
  const sessionModeEnabled = isChatgptWebSessionModeEnabled(session);
  const conversationRotationInterval = getChatgptWebConversationRotationInterval(session);
  const conversationTurnCount = getChatgptWebConversationTurnCount(session);

  return {
    id: session.id,
    provider: session.provider,
    status: session.status,
    capturedAt: session.capturedAt || null,
    updatedAt: session.updatedAt || null,
    lastValidatedAt: session.lastValidatedAt || null,
    lastError: session.lastError || null,
    lastErrorAt: session.lastErrorAt || null,
    userAgent: session.userAgent || "",
    captureUrl: session.captureUrl || null,
    capturedTargetPath: capturedTargetPath || null,
    captureSource: session.captureSource || null,
    historySyncEnabled: isChatgptWebHistorySyncEnabled(session),
    sessionModeEnabled,
    conversationRotationInterval,
    conversationTurnCount,
    historySyncConversationReady: syncedConversationState.ready,
    sessionConversationReady: sessionModeEnabled && syncedConversationState.ready,
    captureMode,
    cookieCount: cookies.length,
    headerKeys: Object.keys(headers).sort(),
    hasCapturedRequestTemplate: Boolean(requestTemplate),
    challengeState: {
      directBridgePreferred: captureMode === "conversation",
      hasProofToken: Boolean(normalizeString(headers["openai-sentinel-proof-token"])),
      hasTurnstileToken: Boolean(normalizeString(headers["openai-sentinel-turnstile-token"])),
      hasRequirementsToken: Boolean(normalizeString(headers["openai-sentinel-chat-requirements-token"])),
      hasOaiScCookie: cookieMap.has("oai-sc"),
      hasRequestTemplate: Boolean(requestTemplate),
    },
    availableModels,
    availableModelCount: availableModels.length,
  };
}

// ── Session validation ──

export async function validateAndStoreChatgptWebSession() {
  const session = await getChatgptWebSession();
  if (!session) {
    throw new Error("ChatGPT Web session not found.");
  }

  const timestamp = nowIso();
  let models = getStoredChatgptWebModels(session);
  const capturedHeaders = safeParseJson(session?.headersJson, {});
  const capturedTargetPath = extractCapturedTargetPath({
    captureUrl: session?.captureUrl,
    capturedTargetPath: session?.capturedTargetPath,
    headers: capturedHeaders,
  });
  const captureTargetError = getChatgptWebCaptureTargetError({
    captureUrl: session?.captureUrl,
    capturedTargetPath,
    headers: capturedHeaders,
  });
  if (captureTargetError) {
    const updated = await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: timestamp,
      lastError: captureTargetError,
      lastErrorAt: timestamp,
      availableModelsJson: JSON.stringify(models),
    });

    const error = buildValidationError(400, captureTargetError);
    error.session = updated;
    throw error;
  }

  const authCaptureError = getChatgptWebAuthorizationError(capturedHeaders);
  if (authCaptureError) {
    const updated = await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: timestamp,
      lastError: authCaptureError,
      lastErrorAt: timestamp,
      availableModelsJson: JSON.stringify(models),
    });

    const error = buildValidationError(400, authCaptureError);
    error.session = updated;
    throw error;
  }

  const requestTemplateError = getChatgptWebRequestTemplateError(session, capturedTargetPath);
  if (requestTemplateError) {
    const updated = await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: timestamp,
      lastError: requestTemplateError,
      lastErrorAt: timestamp,
      availableModelsJson: JSON.stringify(models),
    });

    const error = buildValidationError(409, requestTemplateError);
    error.session = updated;
    throw error;
  }

  let status = "active";
  let lastError = null;

  // Lazy import to avoid circular dependency
  const { fetchChatgptWeb } = await import("./replay.js");

  try {
    const response = await fetchChatgptWeb(session, CHATGPT_WEB_MODELS_URL, {
      method: "GET",
      stream: false,
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      models = normalizeChatgptWebModels(await response.json().catch(() => []));
    } else if (response.status === 401 || response.status === 403) {
      throw buildValidationError(response.status, "ChatGPT Web session expired or no longer authorized.");
    } else {
      const { CHATGPT_WEB_USAGE_URL } = await import("./constants.js");
      const fallbackWarning = `Model discovery failed with HTTP ${response.status}. Continuing with limited validation.`;
      try {
        const usageResponse = await fetchChatgptWeb(session, CHATGPT_WEB_USAGE_URL, {
          method: "GET",
          stream: false,
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!usageResponse.ok) {
          throw buildValidationError(usageResponse.status, `Usage probe failed with HTTP ${usageResponse.status}.`);
        }
        lastError = fallbackWarning;
      } catch (error) {
        const httpStatus = Number(error?.status || 0);
        if (httpStatus === 401 || httpStatus === 403) {
          throw buildValidationError(httpStatus, "ChatGPT Web session expired or no longer authorized.");
        }
        lastError = error?.message || fallbackWarning;
      }
    }
  } catch (error) {
    const httpStatus = Number(error?.status || 0);
    if (httpStatus === 401 || httpStatus === 403) {
      status = "expired";
      lastError = error?.message || "ChatGPT Web validation failed.";
    } else {
      status = "active";
      lastError = error?.message || "ChatGPT Web validation was inconclusive. Continuing with existing session.";
    }
  }

  const updated = await upsertChatgptWebSession({
    ...session,
    status,
    lastValidatedAt: timestamp,
    lastError,
    lastErrorAt: lastError ? timestamp : null,
    availableModelsJson: JSON.stringify(models),
  });

  if (status !== "active") {
    const error = buildValidationError(
      status === "expired" ? 401 : 503,
      lastError || "ChatGPT Web validation failed.",
    );
    error.session = updated;
    throw error;
  }

  return updated;
}
