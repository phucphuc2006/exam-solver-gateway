// ── Local DB — Web Bridge Sessions (ChatGPT, Gemini, Grok) ──

import { getDb, safeWrite } from "./core.js";

const CHATGPT_WEB_SESSION_ID = "chatgpt-web";
const GEMINI_WEB_SESSION_ID = "gemini-web";
const GROK_WEB_SESSION_ID = "grok-web";

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ensureWebBridgeSessions(db) {
  if (!Array.isArray(db.data.webBridgeSessions)) {
    db.data.webBridgeSessions = [];
  }
}

function buildWebBridgeSession({
  existingSession = null,
  sessionId,
  provider,
  data = {},
  preserveConversationState = false,
}) {
  const now = new Date().toISOString();
  const readProvidedField = (key, fallback) => (
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback
  );
  const hasSessionModeEnabled = Object.prototype.hasOwnProperty.call(data, "sessionModeEnabled");
  const hasConversationRotationInterval = Object.prototype.hasOwnProperty.call(data, "conversationRotationInterval");
  const hasConversationTurnCount = Object.prototype.hasOwnProperty.call(data, "conversationTurnCount");
  const hasSyncedConversationId = Object.prototype.hasOwnProperty.call(data, "syncedConversationId");
  const hasSyncedParentMessageId = Object.prototype.hasOwnProperty.call(data, "syncedParentMessageId");
  const captureSessionFieldsWereUpdated = (
    Object.prototype.hasOwnProperty.call(data, "cookiesJson")
    || Object.prototype.hasOwnProperty.call(data, "headersJson")
    || Object.prototype.hasOwnProperty.call(data, "captureUrl")
    || Object.prototype.hasOwnProperty.call(data, "capturedTargetPath")
    || Object.prototype.hasOwnProperty.call(data, "captureSource")
    || Object.prototype.hasOwnProperty.call(data, "providerDataJson")
  );
  const shouldResetSyncedConversationState = (
    !preserveConversationState
    && captureSessionFieldsWereUpdated
    && !hasSyncedConversationId
    && !hasSyncedParentMessageId
  );
  const historySyncEnabled = data.historySyncEnabled === true
    ? true
    : data.historySyncEnabled === false
      ? false
      : existingSession?.historySyncEnabled === true;
  const sessionModeEnabled = hasSessionModeEnabled
    ? data.sessionModeEnabled === true
    : existingSession?.sessionModeEnabled === true;
  const rawConversationRotationInterval = hasConversationRotationInterval
    ? Number(data.conversationRotationInterval)
    : Number(existingSession?.conversationRotationInterval ?? 0);
  const conversationRotationInterval = Number.isFinite(rawConversationRotationInterval)
    ? Math.max(0, Math.trunc(rawConversationRotationInterval))
    : 0;
  const rawConversationTurnCount = hasConversationTurnCount
    ? Number(data.conversationTurnCount)
    : Number(existingSession?.conversationTurnCount ?? 0);
  const conversationTurnCount = sessionModeEnabled && Number.isFinite(rawConversationTurnCount)
    ? Math.max(0, Math.trunc(rawConversationTurnCount))
    : 0;
  const syncedConversationId = hasSyncedConversationId
    ? normalizeOptionalString(data.syncedConversationId)
    : shouldResetSyncedConversationState || !sessionModeEnabled
      ? null
      : normalizeOptionalString(existingSession?.syncedConversationId);
  const syncedParentMessageId = hasSyncedParentMessageId
    ? normalizeOptionalString(data.syncedParentMessageId)
    : shouldResetSyncedConversationState || !sessionModeEnabled
      ? null
      : normalizeOptionalString(existingSession?.syncedParentMessageId);

  return {
    id: sessionId,
    provider,
    status: data.status || existingSession?.status || "captured",
    cookiesJson: data.cookiesJson ?? existingSession?.cookiesJson ?? "[]",
    headersJson: data.headersJson ?? existingSession?.headersJson ?? "{}",
    requestTemplateJson: data.requestTemplateJson ?? existingSession?.requestTemplateJson ?? "null",
    providerDataJson: data.providerDataJson ?? existingSession?.providerDataJson ?? "null",
    userAgent: data.userAgent ?? existingSession?.userAgent ?? "",
    captureUrl: readProvidedField("captureUrl", existingSession?.captureUrl ?? null),
    capturedTargetPath: readProvidedField("capturedTargetPath", existingSession?.capturedTargetPath ?? null),
    captureSource: readProvidedField("captureSource", existingSession?.captureSource ?? null),
    lastValidatedAt: readProvidedField("lastValidatedAt", existingSession?.lastValidatedAt ?? null),
    lastError: readProvidedField("lastError", existingSession?.lastError ?? null),
    lastErrorAt: readProvidedField("lastErrorAt", existingSession?.lastErrorAt ?? null),
    availableModelsJson: data.availableModelsJson ?? existingSession?.availableModelsJson ?? "[]",
    historySyncEnabled,
    sessionModeEnabled,
    conversationRotationInterval,
    conversationTurnCount,
    syncedConversationId,
    syncedParentMessageId,
    capturedAt: data.capturedAt || existingSession?.capturedAt || now,
    updatedAt: now,
  };
}

async function getWebBridgeSessionById(sessionId) {
  const db = await getDb();
  ensureWebBridgeSessions(db);
  return db.data.webBridgeSessions.find((session) => session.id === sessionId) || null;
}

async function upsertWebBridgeSessionById({
  sessionId,
  provider,
  data,
  preserveConversationState = false,
}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Invalid ${provider} session payload`);
  }

  const db = await getDb();
  ensureWebBridgeSessions(db);

  const existingIndex = db.data.webBridgeSessions.findIndex(
    (entry) => entry.id === sessionId,
  );
  const existingSession = existingIndex >= 0 ? db.data.webBridgeSessions[existingIndex] : null;
  const session = buildWebBridgeSession({
    existingSession,
    sessionId,
    provider,
    data,
    preserveConversationState,
  });

  if (existingIndex >= 0) {
    db.data.webBridgeSessions[existingIndex] = {
      ...db.data.webBridgeSessions[existingIndex],
      ...session,
    };
  } else {
    db.data.webBridgeSessions.push(session);
  }

  await safeWrite(db);
  return db.data.webBridgeSessions.find((entry) => entry.id === sessionId) || session;
}

async function deleteWebBridgeSessionById(sessionId) {
  const db = await getDb();
  ensureWebBridgeSessions(db);

  const beforeCount = db.data.webBridgeSessions.length;
  db.data.webBridgeSessions = db.data.webBridgeSessions.filter(
    (session) => session.id !== sessionId,
  );

  if (beforeCount !== db.data.webBridgeSessions.length) {
    await safeWrite(db);
  }

  return beforeCount !== db.data.webBridgeSessions.length;
}

// ── ChatGPT Web ──

/**
 * Get the active ChatGPT Web bridge session
 */
export async function getChatgptWebSession() {
  return getWebBridgeSessionById(CHATGPT_WEB_SESSION_ID);
}

/**
 * Upsert the active ChatGPT Web bridge session
 */
export async function upsertChatgptWebSession(data) {
  return upsertWebBridgeSessionById({
    sessionId: CHATGPT_WEB_SESSION_ID,
    provider: "chatgpt-web",
    data,
    preserveConversationState: false,
  });
}

/**
 * Delete the active ChatGPT Web bridge session
 */
export async function deleteChatgptWebSession() {
  return deleteWebBridgeSessionById(CHATGPT_WEB_SESSION_ID);
}

// ── Gemini Web ──

export async function getGeminiWebSession() {
  return getWebBridgeSessionById(GEMINI_WEB_SESSION_ID);
}

export async function upsertGeminiWebSession(data) {
  return upsertWebBridgeSessionById({
    sessionId: GEMINI_WEB_SESSION_ID,
    provider: "gemini-web",
    data,
    preserveConversationState: true,
  });
}

export async function deleteGeminiWebSession() {
  return deleteWebBridgeSessionById(GEMINI_WEB_SESSION_ID);
}

// ── Grok Web ──

export async function getGrokWebSession() {
  return getWebBridgeSessionById(GROK_WEB_SESSION_ID);
}

export async function upsertGrokWebSession(data) {
  return upsertWebBridgeSessionById({
    sessionId: GROK_WEB_SESSION_ID,
    provider: "grok-web",
    data,
    preserveConversationState: true,
  });
}

export async function deleteGrokWebSession() {
  return deleteWebBridgeSessionById(GROK_WEB_SESSION_ID);
}
