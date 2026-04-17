// ── ChatGPT Web Bridge — Conversation Body Builders ──
// Handles: building conversation message payloads, prepare body, request body,
// continuation request template, handshake cache

import crypto from "node:crypto";
import { normalizeWebBridgeMessages } from "@/lib/webBridgeMessageParts";
import {
  normalizeString,
  isPlainObject,
  cloneJsonValue,
  getCurrentTimezone,
  ALLOWED_ROLES,
  UNSUPPORTED_TOP_LEVEL_FIELDS,
  CHATGPT_WEB_CONVERSATION_HANDSHAKE_CACHE_TTL_MS,
} from "./constants.js";
import {
  getStoredChatgptWebModels,
  getStoredChatgptWebRequestTemplate,
  normalizeTargetPath,
  getChatgptWebCaptureMode,
} from "./session.js";
import {
  buildChatgptWebAttachmentMetadata,
  buildChatgptWebMessageContentParts,
} from "./replay.js";
import { resolveChatgptWebModel } from "./modelDiscovery.js";

// ── Validate incoming request ──

export function validateChatgptWebRequest(body, session) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  for (const field of UNSUPPORTED_TOP_LEVEL_FIELDS) {
    if (body[field] !== undefined) {
      throw new Error(`Field \`${field}\` is not supported by the ChatGPT Web bridge.`);
    }
  }

  const messages = normalizeWebBridgeMessages(body.messages, {
    providerLabel: "ChatGPT Web bridge",
    allowImages: true,
    allowFiles: true,
    allowedRoles: ALLOWED_ROLES,
  });

  const availableModels = getStoredChatgptWebModels(session);
  const rawModel = normalizeString(body.model) || availableModels[0]?.id || "auto";
  const validUpstreamSlugs = new Set([
    "auto",
    "gpt-4",
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o1-preview",
    "o1-mini",
    "o3-mini",
    "text-davinci-002-render-sha",
    ...availableModels.map((entry) => normalizeString(entry?.id)).filter(Boolean),
  ]);

  let resolvedModel = resolveChatgptWebModel(rawModel, availableModels);

  if (!validUpstreamSlugs.has(resolvedModel)) {
    console.warn(`[ChatGPT Web] Received unrecognized model slug "${rawModel}". Falling back to "auto" to prevent upstream 500. `);
    resolvedModel = "auto";
  }

  return {
    body: {
      ...body,
      model: resolvedModel,
      messages,
      stream: body.stream === true,
    },
    model: resolvedModel,
    stream: body.stream === true,
  };
}

// ── Conversation client context ──

function buildConversationClientContext() {
  return {
    is_dark_mode: true,
    time_since_loaded: 5,
    page_height: 1219,
    page_width: 3440,
    pixel_ratio: 1,
    screen_height: 1440,
    screen_width: 3440,
    app_name: "chatgpt.com",
  };
}

function buildConversationDefaultMessageMetadata() {
  return {
    selected_github_repos: [],
    selected_all_github_repos: false,
    dictation: false,
    serialization_metadata: {
      custom_symbol_offsets: [],
    },
  };
}

// ── Build single conversation message ──

function buildConversationMessage(message, index, createdAtMs = Date.now(), templateMessage = null) {
  const normalizedRole = message.role === "system" ? "user" : message.role;
  const normalizedContent = message.role === "system"
    ? `[System]\n${message.content}`
    : message.content;
  const template = isPlainObject(templateMessage) ? cloneJsonValue(templateMessage, {}) : {};
  const templateAuthor = isPlainObject(template.author) ? template.author : {};
  const templateContent = isPlainObject(template.content) ? template.content : {};
  const nextMetadata = isPlainObject(template.metadata)
    ? cloneJsonValue(template.metadata, {})
    : buildConversationDefaultMessageMetadata();
  const attachmentMetadata = (Array.isArray(message.attachments) ? message.attachments : [])
    .map((attachment) => buildChatgptWebAttachmentMetadata(attachment))
    .filter((attachment) => normalizeString(attachment.id));
  const contentParts = buildChatgptWebMessageContentParts(message, normalizedContent);
  const hasImageAttachment = contentParts.some(
    (part) => isPlainObject(part) && part.content_type === "image_asset_pointer",
  );

  if (attachmentMetadata.length > 0) {
    nextMetadata.attachments = attachmentMetadata;
  } else {
    delete nextMetadata.attachments;
  }

  return {
    ...template,
    id: crypto.randomUUID(),
    author: {
      ...templateAuthor,
      role: normalizedRole,
    },
    content: {
      ...templateContent,
      content_type: hasImageAttachment
        ? "multimodal_text"
        : normalizeString(templateContent.content_type) || "text",
      parts: contentParts,
    },
    metadata: nextMetadata,
    create_time: Number((createdAtMs / 1000 + index / 1000).toFixed(3)),
  };
}

// ── Build replay payload ──

function resolveConversationReplayParentMessageId(templateBody = null) {
  return normalizeString(
    templateBody?.current_node
    || templateBody?.current_leaf_message_id
    || templateBody?.parent_message_id,
  );
}

export function buildConversationReplayPayload(
  normalized,
  requestTemplate = null,
  { continuationEnabled = false, syncedConversationState = null } = {},
) {
  const createdAtMs = Date.now();
  const templateMessages = Array.isArray(requestTemplate?.messages)
    ? requestTemplate.messages.filter((message) => isPlainObject(message))
    : [];
  const syncedConversationId = normalizeString(syncedConversationState?.conversationId);
  const syncedParentMessageId = normalizeString(syncedConversationState?.parentMessageId);
  const syncedState = continuationEnabled
    ? {
        conversationId: syncedConversationId,
        parentMessageId: syncedParentMessageId,
        ready: Boolean(syncedConversationId && syncedParentMessageId),
      }
    : { conversationId: "", parentMessageId: "", ready: false };
  const conversationId = syncedState.ready ? syncedState.conversationId : "";
  const parentMessageId = syncedState.ready ? syncedState.parentMessageId : crypto.randomUUID();
  return {
    requestId: crypto.randomUUID(),
    parentMessageId,
    conversationId,
    messages: normalized.body.messages.map((message, index) => buildConversationMessage(
      message,
      index,
      createdAtMs,
      templateMessages[index] || templateMessages[templateMessages.length - 1] || null,
    )),
  };
}

// ── Build base body ──

function buildDefaultConversationBaseBody(
  normalized,
  replayPayload = {},
  { historySyncEnabled = false, continuationEnabled = false } = {},
) {
  const timezone = getCurrentTimezone();
  const timezoneOffsetMin = new Date().getTimezoneOffset();
  const requestId = normalizeString(replayPayload.requestId) || crypto.randomUUID();
  const parentMessageId = normalizeString(replayPayload.parentMessageId) || crypto.randomUUID();
  const conversationId = normalizeString(replayPayload.conversationId);
  const nextBody = {
    action: "next",
    fork_from_shared_post: false,
    parent_message_id: parentMessageId,
    model: normalized.model || "auto",
    timezone_offset_min: timezoneOffsetMin,
    timezone,
    suggestions: [],
    history_and_training_disabled: !historySyncEnabled,
    conversation_mode: {
      kind: "primary_assistant",
    },
    enable_message_followups: true,
    system_hints: [],
    supports_buffering: true,
    supported_encodings: ["v1"],
    client_contextual_info: buildConversationClientContext(),
    paragen_cot_summary_display_override: "allow",
    force_parallel_switch: "auto",
    force_paragen: false,
    force_paragen_model_slug: "",
    force_rate_limit: false,
    force_use_sse: true,
    reset_rate_limits: false,
    websocket_request_id: requestId,
  };

  if (continuationEnabled && conversationId) {
    nextBody.conversation_id = conversationId;
    nextBody.current_node = parentMessageId;
    nextBody.current_leaf_message_id = parentMessageId;
  }

  return nextBody;
}

function normalizeCapturedRequestTemplate(template) {
  return isPlainObject(template) ? cloneJsonValue(template, null) : null;
}

function buildConversationBaseBody(
  normalized,
  replayPayload = {},
  requestTemplate = null,
  { historySyncEnabled = false, continuationEnabled = false } = {},
) {
  const templateBody = normalizeCapturedRequestTemplate(requestTemplate);
  if (!templateBody) {
    return buildDefaultConversationBaseBody(normalized, replayPayload, {
      historySyncEnabled,
      continuationEnabled,
    });
  }

  const requestId = normalizeString(replayPayload.requestId) || crypto.randomUUID();
  const parentMessageId = normalizeString(replayPayload.parentMessageId)
    || (!continuationEnabled ? resolveConversationReplayParentMessageId(templateBody) : "")
    || crypto.randomUUID();
  const conversationId = continuationEnabled
    ? normalizeString(replayPayload.conversationId)
    : "";
  const nextBody = cloneJsonValue(templateBody, {});
  const timezoneOffsetCandidate = Number(nextBody.timezone_offset_min);

  if (!continuationEnabled) {
    delete nextBody.conversation_id;
    delete nextBody.conversation_origin;
    delete nextBody.current_leaf_message_id;
    delete nextBody.current_node;
  }

  nextBody.action = normalizeString(nextBody.action) || "next";
  nextBody.fork_from_shared_post = nextBody.fork_from_shared_post === true;
  nextBody.parent_message_id = parentMessageId;
  nextBody.model = normalized.model || normalizeString(nextBody.model) || "auto";
  nextBody.timezone = normalizeString(nextBody.timezone) || getCurrentTimezone();
  nextBody.timezone_offset_min = Number.isFinite(timezoneOffsetCandidate)
    ? timezoneOffsetCandidate
    : new Date().getTimezoneOffset();
  nextBody.suggestions = Array.isArray(nextBody.suggestions) ? nextBody.suggestions : [];
  delete nextBody.conversation_origin;
  nextBody.history_and_training_disabled = !historySyncEnabled;

  if (continuationEnabled) {
    if (conversationId) {
      nextBody.conversation_id = conversationId;
      nextBody.current_node = parentMessageId;
      nextBody.current_leaf_message_id = parentMessageId;
    } else {
      delete nextBody.conversation_id;
      delete nextBody.current_node;
      delete nextBody.current_leaf_message_id;
    }
  }

  nextBody.conversation_mode = isPlainObject(nextBody.conversation_mode)
    ? nextBody.conversation_mode
    : { kind: "primary_assistant" };
  if (typeof nextBody.enable_message_followups !== "boolean") {
    nextBody.enable_message_followups = true;
  }
  nextBody.system_hints = Array.isArray(nextBody.system_hints) ? nextBody.system_hints : [];
  if (typeof nextBody.supports_buffering !== "boolean") {
    nextBody.supports_buffering = true;
  }
  nextBody.supported_encodings = Array.isArray(nextBody.supported_encodings) && nextBody.supported_encodings.length
    ? nextBody.supported_encodings
    : ["v1"];
  nextBody.client_contextual_info = isPlainObject(nextBody.client_contextual_info)
    ? nextBody.client_contextual_info
    : buildConversationClientContext();
  nextBody.paragen_cot_summary_display_override = normalizeString(nextBody.paragen_cot_summary_display_override) || "allow";
  nextBody.force_parallel_switch = normalizeString(nextBody.force_parallel_switch) || "auto";
  if (typeof nextBody.force_paragen !== "boolean") {
    nextBody.force_paragen = false;
  }
  if (typeof nextBody.force_paragen_model_slug !== "string") {
    nextBody.force_paragen_model_slug = "";
  }
  if (typeof nextBody.force_rate_limit !== "boolean") {
    nextBody.force_rate_limit = false;
  }
  if (typeof nextBody.force_use_sse !== "boolean") {
    nextBody.force_use_sse = true;
  }
  if (typeof nextBody.reset_rate_limits !== "boolean") {
    nextBody.reset_rate_limits = false;
  }
  nextBody.websocket_request_id = requestId;

  return nextBody;
}

export function buildConversationRequestBody(
  normalized,
  replayPayload = {},
  requestTemplate = null,
  { historySyncEnabled = false, continuationEnabled = false } = {},
) {
  return {
    ...buildConversationBaseBody(normalized, replayPayload, requestTemplate, {
      historySyncEnabled,
      continuationEnabled,
    }),
    messages: Array.isArray(replayPayload.messages) && replayPayload.messages.length
      ? replayPayload.messages
      : buildConversationReplayPayload(normalized, requestTemplate, {
        continuationEnabled,
      }).messages,
  };
}

export function buildConversationPrepareBody(
  normalized,
  replayPayload = {},
  requestTemplate = null,
  { historySyncEnabled = false, continuationEnabled = false } = {},
) {
  return {
    ...buildConversationBaseBody(normalized, replayPayload, requestTemplate, {
      historySyncEnabled,
      continuationEnabled,
    }),
    messages: Array.isArray(replayPayload.messages) && replayPayload.messages.length
      ? replayPayload.messages
      : buildConversationReplayPayload(normalized, requestTemplate, {
        continuationEnabled,
      }).messages,
  };
}

// ── Handshake cache helpers ──

export function buildConversationHandshakeCacheKey(
  session,
  {
    conversationPath = "",
    historySyncEnabled = false,
    continuationEnabled = false,
    syncedConversationState = null,
  } = {},
) {
  const captureStamp = normalizeString(session?.capturedAt) || "nocapture";
  const normalizedConversationPath = normalizeTargetPath(conversationPath || session?.capturedTargetPath || session?.captureUrl)
    || "conversation";
  const conversationId = continuationEnabled
    ? normalizeString(syncedConversationState?.conversationId) || "new"
    : "stateless";

  return [
    "chatgpt-web",
    "conversation-handshake",
    normalizeString(session?.id) || "chatgpt-web",
    captureStamp,
    normalizedConversationPath,
    historySyncEnabled ? "history" : "temporary",
    continuationEnabled ? "continued" : "fresh",
    conversationId,
  ].join("::");
}

export function buildCapturedConversationHandshakeHeaders(capturedHeaders = {}) {
  const { generateConversationEchoLogs } = require("./constants.js");
  const nextHeaders = {
    "oai-echo-logs": normalizeString(capturedHeaders["oai-echo-logs"]) || generateConversationEchoLogs(),
  };

  const requirementsToken = normalizeString(capturedHeaders["openai-sentinel-chat-requirements-token"]);
  const proofToken = normalizeString(capturedHeaders["openai-sentinel-proof-token"]);
  const turnstileToken = normalizeString(capturedHeaders["openai-sentinel-turnstile-token"]);
  const conduitToken = normalizeString(capturedHeaders["x-conduit-token"]);

  if (requirementsToken) {
    nextHeaders["openai-sentinel-chat-requirements-token"] = requirementsToken;
  }
  if (proofToken) {
    nextHeaders["openai-sentinel-proof-token"] = proofToken;
  }
  if (turnstileToken) {
    nextHeaders["openai-sentinel-turnstile-token"] = turnstileToken;
  }
  if (conduitToken) {
    nextHeaders["x-conduit-token"] = conduitToken;
  }

  return nextHeaders;
}

export function canAttemptPrepareWithoutRefreshingRequirements(headers = {}, runtimeCookieHeader = "") {
  return Boolean(
    normalizeString(headers["x-conduit-token"])
    || normalizeString(headers["openai-sentinel-chat-requirements-token"])
    || normalizeString(headers["openai-sentinel-proof-token"])
    || normalizeString(headers["openai-sentinel-turnstile-token"])
    || normalizeString(runtimeCookieHeader),
  );
}

export function extractConversationHandshakeCachePayload(headers = {}, runtimeCookieHeader = "") {
  const nextHeaders = {};

  for (const headerName of [
    "oai-echo-logs",
    "openai-sentinel-chat-requirements-token",
    "openai-sentinel-proof-token",
    "openai-sentinel-turnstile-token",
    "x-conduit-token",
  ]) {
    const value = normalizeString(headers?.[headerName]);
    if (value) {
      nextHeaders[headerName] = value;
    }
  }

  return {
    headers: nextHeaders,
    runtimeCookieHeader: normalizeString(runtimeCookieHeader) || "",
  };
}

// ── Continuation template ──

export function buildContinuationRequestTemplate(
  requestTemplate = null,
  requestBody = {},
  continuationState = {},
  { historySyncEnabled = false } = {},
) {
  const nextTemplate = normalizeCapturedRequestTemplate(requestTemplate) || {};
  const conversationId = normalizeString(
    continuationState?.conversationId || requestBody?.conversation_id,
  );
  const parentMessageId = normalizeString(
    continuationState?.parentMessageId || requestBody?.parent_message_id,
  );

  nextTemplate.history_and_training_disabled = !historySyncEnabled;
  nextTemplate.fork_from_shared_post = false;

  if (conversationId) {
    nextTemplate.conversation_id = conversationId;
  } else {
    delete nextTemplate.conversation_id;
  }

  if (parentMessageId) {
    nextTemplate.parent_message_id = parentMessageId;
    nextTemplate.current_node = parentMessageId;
    nextTemplate.current_leaf_message_id = parentMessageId;
  }

  return nextTemplate;
}

// ── Prepare payload headers ──

export function applyConversationPreparePayloadToHeaders(headers = {}, preparePayload = null, prepareResponse = null) {
  const conduitToken = normalizeString(
    preparePayload?.conduit_token
    || preparePayload?.token
    || preparePayload?.conduitToken,
  ) || normalizeString(
    prepareResponse?.headers?.get?.("x-conduit-token")
    || prepareResponse?.headers?.get?.("conduit-token"),
  );

  if (!conduitToken) {
    const { buildValidationError } = require("./constants.js");
    throw buildValidationError(502, "Conversation prepare did not return a conduit token.");
  }

  return {
    ...headers,
    "x-conduit-token": conduitToken,
  };
}
