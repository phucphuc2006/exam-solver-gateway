// ── ChatGPT Web Bridge — Conversation Execution Pipeline ──
// Handles: the main execution flow for sending a completion request to ChatGPT Web

import { getChatgptWebSession, upsertChatgptWebSession } from "@/lib/localDb/index.js";
import { getCachedValue, setCachedValue, deleteCachedValue } from "@/lib/serverCache.js";
import { generateFakeSentinelToken, solveSentinelChallenge } from "@/lib/chatgptWebSentinel";
import {
  normalizeString,
  isPlainObject,
  safeParseJson,
  nowIso,
  buildValidationError,
  isChatgptWebDebugEnabled,
  CHATGPT_WEB_CHAT_REQUIREMENTS_URL,
  CHATGPT_WEB_CONVERSATION_HANDSHAKE_CACHE_TTL_MS,
  CHATGPT_WEB_RETRYABLE_HANDSHAKE_STATUSES,
} from "./constants.js";
import {
  extractCapturedTargetPath,
  getChatgptWebCaptureMode,
  getChatgptWebAuthorizationError,
  getChatgptWebRequestTemplateError,
  getStoredChatgptWebRequestTemplate,
  isChatgptWebHistorySyncEnabled,
  isChatgptWebSessionModeEnabled,
  getChatgptWebConversationRotationInterval,
  getChatgptWebConversationTurnCount,
  getChatgptWebSyncedConversationState,
  appendCookieFromResponse,
  mergeCookieHeaders,
  getChatgptWebCaptureTargetError,
} from "./session.js";
import {
  fetchChatgptWeb,
  createChatgptReplayContext,
  resolveChatgptWebConversationPath,
  buildChatgptWebUrl,
  logChatgptConversationDebug,
  uploadChatgptWebMessageAttachments,
} from "./replay.js";
import {
  validateChatgptWebRequest,
  buildConversationReplayPayload,
  buildConversationRequestBody,
  buildConversationPrepareBody,
  buildConversationHandshakeCacheKey,
  buildCapturedConversationHandshakeHeaders,
  canAttemptPrepareWithoutRefreshingRequirements,
  extractConversationHandshakeCachePayload,
  buildContinuationRequestTemplate,
  applyConversationPreparePayloadToHeaders,
} from "./conversationBuilder.js";
import {
  extractConversationContinuationState,
} from "./responseParser.js";

// ── Helpers ──

function shouldRetryConversationHandshakeStatus(status) {
  return CHATGPT_WEB_RETRYABLE_HANDSHAKE_STATUSES.has(Number(status));
}

async function persistConversationSession({
  session,
  requestTemplate,
  requestBody,
  response,
  historySyncEnabled = false,
  continuationEnabled = false,
  previousTurnCount = 0,
}) {
  const rawText = await response.text().catch(() => "");
  const continuationState = extractConversationContinuationState(rawText);
  const resolvedConversationId = normalizeString(
    continuationState.conversationId || requestBody?.conversation_id,
  );
  const resolvedParentMessageId = normalizeString(
    continuationState.parentMessageId || requestBody?.parent_message_id,
  );
  if (isChatgptWebDebugEnabled()) {
    console.error("====== CHATGPT WEB HISTORY SYNC ======");
    console.error("request:", JSON.stringify({
      conversation_id: normalizeString(requestBody?.conversation_id) || null,
      parent_message_id: normalizeString(requestBody?.parent_message_id) || null,
    }, null, 2));
    console.error("continuation:", JSON.stringify(continuationState, null, 2));
    console.error("======================================");
  }
  if (!resolvedConversationId && !resolvedParentMessageId) {
    return;
  }
  const nextRequestTemplate = buildContinuationRequestTemplate(
    requestTemplate,
    requestBody,
    {
      conversationId: resolvedConversationId,
      parentMessageId: resolvedParentMessageId,
    },
    { historySyncEnabled },
  );
  const successTimestamp = nowIso();
  const nextTurnCount = continuationEnabled
    ? Math.max(1, Number(previousTurnCount || 0) + 1)
    : 0;

  await upsertChatgptWebSession({
    ...session,
    status: "active",
    requestTemplateJson: JSON.stringify(nextRequestTemplate),
    lastError: null,
    lastErrorAt: null,
    lastValidatedAt: session.lastValidatedAt || successTimestamp,
    historySyncEnabled,
    sessionModeEnabled: continuationEnabled,
    conversationTurnCount: nextTurnCount,
    syncedConversationId: continuationEnabled ? resolvedConversationId || null : null,
    syncedParentMessageId: continuationEnabled ? resolvedParentMessageId || null : null,
  });
}

// ── Main execution pipeline ──

async function executeChatgptConversationCompletion({ session, normalized, capturedHeaders }) {
  const replayContext = createChatgptReplayContext(session, capturedHeaders);
  const requestTemplate = getStoredChatgptWebRequestTemplate(session);
  const historySyncEnabled = isChatgptWebHistorySyncEnabled(session);
  const sessionModeEnabled = isChatgptWebSessionModeEnabled(session);
  const storedConversationState = getChatgptWebSyncedConversationState(session);
  const conversationRotationInterval = getChatgptWebConversationRotationInterval(session);
  const previousTurnCount = getChatgptWebConversationTurnCount(session);
  const shouldRotateConversation = sessionModeEnabled
    && conversationRotationInterval > 0
    && previousTurnCount >= conversationRotationInterval;
  const syncedConversationState = sessionModeEnabled && !shouldRotateConversation
    ? storedConversationState
    : { conversationId: "", parentMessageId: "", ready: false };
  const shouldContinueConversation = sessionModeEnabled && syncedConversationState.ready;
  const conversationPath = resolveChatgptWebConversationPath(session, capturedHeaders);
  const conversationPrepareUrl = buildChatgptWebUrl(`${conversationPath}/prepare`);
  const conversationUrl = buildChatgptWebUrl(conversationPath);
  const handshakeCacheKey = buildConversationHandshakeCacheKey(session, {
    conversationPath,
    historySyncEnabled,
    continuationEnabled: shouldContinueConversation,
    syncedConversationState,
  });
  const cachedHandshake = getCachedValue(handshakeCacheKey);
  let conversationHeaders = {
    ...buildCapturedConversationHandshakeHeaders(capturedHeaders),
    ...(isPlainObject(cachedHandshake?.headers) ? cachedHandshake.headers : {}),
  };
  let runtimeCookieHeader = normalizeString(cachedHandshake?.runtimeCookieHeader);
  let activeConversationRequestBody = null;

  await uploadChatgptWebMessageAttachments(
    session,
    normalized.body.messages,
    replayContext,
  );

  const buildConversationAttempt = (templateOverride = requestTemplate) => {
    const replayPayload = buildConversationReplayPayload(normalized, templateOverride, {
      continuationEnabled: shouldContinueConversation,
      syncedConversationState,
    });
    return {
      prepareBody: buildConversationPrepareBody(normalized, replayPayload, templateOverride, {
        historySyncEnabled,
        continuationEnabled: shouldContinueConversation,
      }),
      requestBody: buildConversationRequestBody(normalized, replayPayload, templateOverride, {
        historySyncEnabled,
        continuationEnabled: shouldContinueConversation,
      }),
    };
  };

  const clearConversationHandshakeCache = () => {
    deleteCachedValue(handshakeCacheKey);
  };

  const storeConversationHandshakeCache = () => {
    setCachedValue(
      handshakeCacheKey,
      extractConversationHandshakeCachePayload(conversationHeaders, runtimeCookieHeader),
      CHATGPT_WEB_CONVERSATION_HANDSHAKE_CACHE_TTL_MS,
    );
  };

  const refreshConversationRequirements = async () => {
    let requirementsPayload = null;
    try {
      const requirementsResponse = await fetchChatgptWeb(session, CHATGPT_WEB_CHAT_REQUIREMENTS_URL, {
        method: "POST",
        body: {
          p: generateFakeSentinelToken(),
          conversation_mode_kind: "primary_assistant",
        },
        stream: false,
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
        replayContext,
      });

      if (requirementsResponse.ok) {
        requirementsPayload = await requirementsResponse.json().catch(() => null);
        runtimeCookieHeader = appendCookieFromResponse(requirementsResponse, runtimeCookieHeader, "oai-sc");
      } else {
        let errorBody = "";
        try { errorBody = await requirementsResponse.text(); } catch {}
        console.warn("[ChatGPT Web] conversation chat-requirements returned non-ok:", requirementsResponse.status, errorBody.slice(0, 200));
      }

      if (requirementsPayload) {
        if (requirementsPayload.token) {
          conversationHeaders["openai-sentinel-chat-requirements-token"] = requirementsPayload.token;
        }
        if (requirementsPayload.proofofwork?.seed && requirementsPayload.proofofwork?.difficulty) {
          conversationHeaders["openai-sentinel-proof-token"] = solveSentinelChallenge(
            requirementsPayload.proofofwork.seed,
            requirementsPayload.proofofwork.difficulty,
          );
        }
        if (requirementsPayload.turnstile?.required) {
          const runtimeTurnstileToken = normalizeString(
            requirementsPayload.turnstile.token || requirementsPayload.turnstile.value || requirementsPayload.turnstile.dx,
          );
          const capturedTurnstileToken = normalizeString(capturedHeaders["openai-sentinel-turnstile-token"]);
          const resolvedTurnstileToken = runtimeTurnstileToken || capturedTurnstileToken;
          if (resolvedTurnstileToken) {
            conversationHeaders["openai-sentinel-turnstile-token"] = resolvedTurnstileToken;
          } else {
            console.warn("[ChatGPT Web] conversation turnstile is required but no runtime/captured token is available.");
          }
        }
      }
      return requirementsPayload;
    } catch (error) {
      console.warn("[ChatGPT Web] conversation chat-requirements failed:", error?.message || error);
      return null;
    }
  };

  const executePrepareAttempt = (prepareBody) => fetchChatgptWeb(session, conversationPrepareUrl, {
    method: "POST",
    body: prepareBody,
    stream: false,
    headers: {
      accept: "application/json",
      ...conversationHeaders,
      ...(runtimeCookieHeader ? { cookie: runtimeCookieHeader } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    replayContext,
  });

  const executeConversationAttempt = (requestBody) => fetchChatgptWeb(session, conversationUrl, {
    method: "POST",
    body: requestBody,
    stream: true,
    headers: {
      ...conversationHeaders,
      ...(runtimeCookieHeader ? { cookie: runtimeCookieHeader } : {}),
    },
    signal: AbortSignal.timeout(90_000),
    replayContext,
  });

  const runPreparePipeline = async (attempt) => {
    let didRefreshRequirements = false;

    if (!canAttemptPrepareWithoutRefreshingRequirements(conversationHeaders, runtimeCookieHeader)) {
      await refreshConversationRequirements();
      didRefreshRequirements = true;
    }

    let prepareResponse = await executePrepareAttempt(attempt.prepareBody);

    if (!prepareResponse.ok && !didRefreshRequirements && shouldRetryConversationHandshakeStatus(prepareResponse.status)) {
      clearConversationHandshakeCache();
      delete conversationHeaders["x-conduit-token"];
      await refreshConversationRequirements();
      didRefreshRequirements = true;
      prepareResponse = await executePrepareAttempt(attempt.prepareBody);
    }

    return prepareResponse;
  };

  const initialAttempt = buildConversationAttempt(requestTemplate);
  activeConversationRequestBody = initialAttempt.requestBody;
  let response = null;

  if (normalizeString(conversationHeaders["x-conduit-token"])) {
    const fastPathResponse = await executeConversationAttempt(activeConversationRequestBody);
    if (fastPathResponse.ok) {
      response = fastPathResponse;
      storeConversationHandshakeCache();
    } else if (shouldRetryConversationHandshakeStatus(fastPathResponse.status)) {
      clearConversationHandshakeCache();
      delete conversationHeaders["x-conduit-token"];
    } else {
      response = fastPathResponse;
    }
  }

  if (!response) {
    let prepareResponse = await runPreparePipeline(initialAttempt);

    if (!prepareResponse.ok && requestTemplate && prepareResponse.status >= 500) {
      let errorBody = "";
      try { errorBody = await prepareResponse.text(); } catch {}
      console.warn(
        `[ChatGPT Web] Conversation prepare failed with captured template (HTTP ${prepareResponse.status}). Retrying with sanitized default payload.`,
        errorBody.slice(0, 200),
      );

      const fallbackAttempt = buildConversationAttempt(null);
      activeConversationRequestBody = fallbackAttempt.requestBody;
      prepareResponse = await runPreparePipeline(fallbackAttempt);
    }

    if (!prepareResponse.ok) {
      let errorBody = "";
      try { errorBody = await prepareResponse.text(); } catch {}
      throw buildValidationError(
        502,
        `Conversation prepare failed with HTTP ${prepareResponse.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ""}`,
      );
    }

    const preparePayload = await prepareResponse.json().catch(() => null);
    runtimeCookieHeader = appendCookieFromResponse(prepareResponse, runtimeCookieHeader, "oai-sc");
    conversationHeaders = applyConversationPreparePayloadToHeaders(conversationHeaders, preparePayload, prepareResponse);
    logChatgptConversationDebug(activeConversationRequestBody, conversationHeaders, {
      history_sync_enabled: historySyncEnabled,
      session_mode_enabled: sessionModeEnabled,
      conversation_turn_count: previousTurnCount,
      conversation_rotation_interval: conversationRotationInterval,
      conversation_rotated_before_request: shouldRotateConversation,
      synced_conversation_ready: syncedConversationState.ready,
      synced_conversation_id: syncedConversationState.conversationId || null,
      conversation_path: conversationPath,
    });

    response = await executeConversationAttempt(activeConversationRequestBody);
    if (response.ok) {
      storeConversationHandshakeCache();
    }
  }

  if (response.ok) {
    if (sessionModeEnabled) {
      void persistConversationSession({
        session,
        requestTemplate,
        requestBody: activeConversationRequestBody,
        response: response.clone(),
        historySyncEnabled,
        continuationEnabled: sessionModeEnabled,
        previousTurnCount: shouldRotateConversation ? 0 : previousTurnCount,
      }).catch((error) => {
        console.warn("[ChatGPT Web] failed to persist conversation state:", error?.message || error);
      });
    } else if (
      session.status !== "active"
      || session.lastError
      || session.syncedConversationId
      || session.syncedParentMessageId
      || getChatgptWebConversationTurnCount(session) !== 0
    ) {
      const successTimestamp = nowIso();
      await upsertChatgptWebSession({
        ...session,
        status: "active",
        lastError: null,
        lastErrorAt: null,
        lastValidatedAt: session.lastValidatedAt || successTimestamp,
        conversationTurnCount: 0,
        syncedConversationId: null,
        syncedParentMessageId: null,
      });
    }
  }

  if (response.status === 401 || response.status === 403) {
    clearConversationHandshakeCache();
    let errorBody = "";
    try { errorBody = await response.clone().text(); } catch {}
    const errorTimestamp = nowIso();
    if (response.status === 401) {
      await upsertChatgptWebSession({
        ...session,
        status: "expired",
        lastError: `Upstream ${response.status}: ${errorBody.slice(0, 200) || "No body"}`,
        lastErrorAt: errorTimestamp,
        lastValidatedAt: session.lastValidatedAt || errorTimestamp,
      });
    } else {
      await upsertChatgptWebSession({
        ...session,
        status: "active",
        lastError: `Upstream ${response.status}: ${errorBody.slice(0, 200) || "No body"}`,
        lastErrorAt: errorTimestamp,
        lastValidatedAt: session.lastValidatedAt || errorTimestamp,
      });
    }
  }

  return {
    session,
    normalized,
    upstreamBody: activeConversationRequestBody,
    response,
    mode: "conversation",
  };
}

// ── Public entry point ──

export async function executeChatgptWebCompletion(requestBody) {
  const session = await getChatgptWebSession();
  if (!session) {
    throw buildValidationError(503, "ChatGPT Web bridge is not connected.");
  }

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
    const timestamp = nowIso();
    await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: session.lastValidatedAt || timestamp,
      lastError: captureTargetError,
      lastErrorAt: timestamp,
    });
    throw buildValidationError(400, captureTargetError);
  }

  const authCaptureError = getChatgptWebAuthorizationError(capturedHeaders);
  if (authCaptureError) {
    const timestamp = nowIso();
    await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: session.lastValidatedAt || timestamp,
      lastError: authCaptureError,
      lastErrorAt: timestamp,
    });
    throw buildValidationError(401, authCaptureError);
  }

  const requestTemplateError = getChatgptWebRequestTemplateError(session, capturedTargetPath);
  if (requestTemplateError) {
    const timestamp = nowIso();
    await upsertChatgptWebSession({
      ...session,
      capturedTargetPath,
      status: "error",
      lastValidatedAt: session.lastValidatedAt || timestamp,
      lastError: requestTemplateError,
      lastErrorAt: timestamp,
    });
    throw buildValidationError(409, requestTemplateError);
  }

  if (session.status === "expired") {
    throw buildValidationError(401, "ChatGPT Web session has expired. Reconnect and validate again.");
  }

  if (session.status === "captured") {
    throw buildValidationError(503, "ChatGPT Web session has not been validated yet. Run validation before sending requests.");
  }

  if (session.status === "error") {
    throw buildValidationError(
      503,
      session.lastError || "ChatGPT Web session is in an error state. Validate again or reconnect the capture.",
    );
  }

  if (session.status !== "active") {
    throw buildValidationError(503, `ChatGPT Web session is not ready (status: ${session.status || "unknown"}).`);
  }

  const normalized = validateChatgptWebRequest(requestBody, session);
  const captureMode = getChatgptWebCaptureMode(capturedTargetPath);
  if (captureMode !== "conversation") {
    throw buildValidationError(
      400,
      "Bridge hiện chỉ hỗ trợ capture từ route conversation của chat thường ChatGPT.",
    );
  }

  return executeChatgptConversationCompletion({
    session,
    normalized,
    capturedHeaders,
  });
}

