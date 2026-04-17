// ── Gemini Web Bridge — Prompt Builder & Request Payload ──

import crypto from "node:crypto";
import { createAttachmentFallbackText, normalizeWebBridgeMessages } from "@/lib/webBridgeMessageParts";
import {
  GEMINI_WEB_PROVIDER,
  normalizeString,
  createGeminiError,
} from "./constants.js";
import { normalizeGeminiHistoryContextIds } from "./session.js";

// ── Model normalization ──

export function normalizeGeminiWebModel(model = "") {
  const normalized = normalizeString(model);
  if (!normalized) {
    return "";
  }

  const providerPrefix = `${GEMINI_WEB_PROVIDER}/`;
  if (normalized.startsWith(providerPrefix)) {
    return normalizeString(normalized.slice(providerPrefix.length));
  }

  return normalized;
}

// ── Message content extraction ──

function extractMessageContent(message) {
  let contentStr = "";
  if (Array.isArray(message?.content)) {
    contentStr = message.content
      .map(c => {
        if (c.type === "text") return c.text;
        if (c.type === "image_url") return "[Image...]";
        return "";
      }).join("\n");
  } else {
    contentStr = normalizeString(message?.content);
  }

  const fallbackText = Array.isArray(message?.attachments) && message.attachments.length > 0
    ? createAttachmentFallbackText(message.attachments)
    : "";
  const value = contentStr || fallbackText;

  const toolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  if (toolCalls.length > 0) {
    const callsSummary = toolCalls.map((tc) => {
      const fnName = tc.function?.name || tc.name || "unknown";
      return `[Called tool: ${fnName}]`;
    }).join(", ");
    return value ? `${value}\n${callsSummary}` : callsSummary;
  }
  return value;
}

// ── Prompt formatting ──

function safeStringifyGeminiPromptPayload(value, { pretty = true } = {}) {
  try {
    return pretty
      ? JSON.stringify(value, null, 2)
      : JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function sanitizeGeminiPromptBody(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const nextBody = { ...body };
  delete nextBody.__webBridgeRawMessagePassthrough;
  return nextBody;
}

export function formatRawGeminiPromptFromBody(body = {}) {
  const payloadText = safeStringifyGeminiPromptPayload(
    sanitizeGeminiPromptBody(body),
    { pretty: false },
  );

  return [
    "[UPSTREAM_REQUEST_JSON]",
    payloadText,
  ].join("\n\n").trim();
}

export function formatMessagesAsPrompt(messages = []) {
  const normalized = Array.isArray(messages) ? messages : [];
  const lines = [];

  // === KIẾN TRÚC GIỐNG NATIVE GEMINI PRO ===
  // Native Gemini Web UI chỉ gửi 1 tin nhắn mỗi lần, lịch sử do server quản lý qua contextIds.
  // Bridge phải làm tương tự: GIỮ System Prompt + CHỈ GỬI tin nhắn user cuối cùng.
  // Không nhồi 253 tin nhắn vào 1 chuỗi prompt → tránh form body 400-600KB bị Google reject.

  // 1) Lấy System Prompt (nếu có) — gửi nguyên vẹn, không cắt xén
  for (const msg of normalized) {
    const role = normalizeString(msg?.role || "").toLowerCase();
    if (role === "system") {
      const content = extractMessageContent(msg);
      if (content) {
        lines.push(`[SYSTEM]\n${content}`);
      }
    }
  }

  // 2) Lấy tin nhắn cuối cùng từ user (tin Telegram thực tế) — gửi nguyên vẹn
  //    Kèm thêm vài tin gần nhất để cho Gemini có ngữ cảnh tối thiểu
  const nonSystemMsgs = normalized.filter(m => normalizeString(m?.role || "").toLowerCase() !== "system");
  
  // Giữ tối đa 6 tin gần nhất (3 vòng hội thoại user↔assistant)
  const recentMsgs = nonSystemMsgs.length > 6 ? nonSystemMsgs.slice(-6) : nonSystemMsgs;
  
  for (const msg of recentMsgs) {
    const role = normalizeString(msg?.role || "user").toLowerCase();
    const content = extractMessageContent(msg);
    if (!content) continue;

    if (role === "tool") {
      lines.push(`Tool: ${content}`);
    } else if (role === "assistant") {
      lines.push(`Assistant: ${content}`);
    } else {
      lines.push(`User: ${content}`);
    }
  }

  return lines.join("\n\n").trim();
}

// ── Message validation ──

export function validateGeminiCompletionMessages(messages = []) {
  try {
    return normalizeWebBridgeMessages(messages, {
      providerLabel: "Gemini Web bridge",
      allowImages: true,
      allowFiles: true,
    });
  } catch (error) {
    throw createGeminiError(
      error.message || "Gemini Web bridge nhan message khong hop le.",
      400,
    );
  }
}

// ── Request payload builder ──

export function buildGeminiRequestPayload(prompt, {
  sid = "",
  snlm0e = "",
  language = "en",
  contextIds = ["", "", ""],
  uploads = [],
  modelConfig = {},
} = {}) {
  const uuid = crypto.randomUUID();
  const uploadedFiles = Array.isArray(uploads) && uploads.length > 0 ? uploads : null;
  const messageContent = [prompt, 0, null, uploadedFiles, null, null, 0];
  const innerRequest = Array(69).fill(null);
  const [conversationId, responseId, choiceId] = normalizeGeminiHistoryContextIds(contextIds);
  innerRequest[0] = messageContent;
  innerRequest[1] = [language];
  innerRequest[2] = [conversationId, responseId, choiceId, null, null, null, null, null, null, ""];
  innerRequest[3] = snlm0e || null;
  innerRequest[4] = modelConfig.modelId || null;
  innerRequest[6] = [1];
  innerRequest[7] = 1;
  innerRequest[10] = 1;
  innerRequest[11] = 0;
  innerRequest[17] = modelConfig.index17 || [[0]];
  innerRequest[18] = 0;
  innerRequest[27] = 1;
  innerRequest[30] = [4];
  innerRequest[41] = [1];
  innerRequest[53] = 0;
  innerRequest[59] = uuid;
  innerRequest[61] = [];
  innerRequest[68] = modelConfig.index68 ?? 2;

  return {
    uuid,
    params: {
      rt: "c",
      _reqid: String(Math.floor(Math.random() * 900000) + 10000),
      ...(sid ? { "f.sid": sid } : {}),
    },
    innerRequest,
  };
}

// ── Uploaded file list builder ──

export function buildGeminiUploadedFileList(messages = []) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const uploads = [];

  for (const message of normalizedMessages) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (const attachment of attachments) {
      const reference = normalizeString(attachment?.upload?.reference);
      if (!reference) {
        continue;
      }

      const name = normalizeString(
        attachment?.upload?.name
        || attachment?.filename
        || attachment?.name,
      ) || `file-${uploads.length + 1}`;

      uploads.push([[reference, 1], name]);
    }
  }

  return uploads;
}
