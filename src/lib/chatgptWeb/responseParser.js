// ── ChatGPT Web Bridge — Response Parsing & Stream Transform ──
// Handles: SSE event parsing, text extraction, stream-to-OpenAI-compatible conversion,
// conversation continuation state extraction

import crypto from "node:crypto";
import { normalizeString, buildValidationError } from "./constants.js";

// ── SSE parsing ──

export function parseConversationEvent(rawMessage) {
  const parsedEvents = [];
  const lines = String(rawMessage || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"));

  for (const line of lines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      parsedEvents.push(JSON.parse(payload));
    } catch {
    }
  }

  return parsedEvents;
}

// ── Error extraction ──

export function extractConversationEventError(event) {
  if (typeof event?.error === "string" && normalizeString(event.error)) {
    return normalizeString(event.error);
  }

  if (typeof event?.message === "string" && normalizeString(event.message)) {
    return normalizeString(event.message);
  }

  const nestedError = normalizeString(
    event?.v?.error
    || event?.data?.error
    || event?.message?.error,
  );
  if (nestedError) {
    return nestedError;
  }

  return "";
}

export function extractConversationErrorMessage(rawText) {
  const events = parseConversationEvent(rawText);
  for (const event of events) {
    const errorMessage = extractConversationEventError(event);
    if (errorMessage) {
      return errorMessage;
    }
  }

  for (const rawLine of String(rawText || "").split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine === "[DONE]" || trimmedLine.startsWith("event:")) {
      continue;
    }

    const candidate = trimmedLine.startsWith("data:")
      ? trimmedLine.slice(5).trim()
      : trimmedLine;
    if (!candidate || candidate === "[DONE]") {
      continue;
    }

    try {
      const parsedLine = JSON.parse(candidate);
      const errorMessage = extractConversationEventError(parsedLine);
      if (errorMessage) {
        return errorMessage;
      }
    } catch {
    }
  }

  return "";
}

// ── Continuation state extraction ──

export function extractConversationContinuationState(rawText = "") {
  const events = parseConversationEvent(rawText);
  let conversationId = "";
  let parentMessageId = "";

  for (const event of events) {
    const nextConversationId = normalizeString(
      event?.conversation_id
      || event?.v?.conversation_id
      || event?.message?.conversation_id
      || event?.v?.message?.conversation_id
      || event?.conversation?.id
      || event?.v?.conversation?.id,
    );
    if (nextConversationId) {
      conversationId = nextConversationId;
    }

    const role = getConversationRoleFromValue(event);
    const messageId = normalizeString(
      event?.message?.id
      || event?.v?.message?.id
      || event?.v?.id
      || event?.id,
    );
    if (role === "assistant" && messageId) {
      parentMessageId = messageId;
    }
  }

  return {
    conversationId,
    parentMessageId,
  };
}

// ── Text extraction helpers ──

function buildConversationMessageTextFilter(messages = []) {
  return new Set(
    (Array.isArray(messages) ? messages : [])
      .map((message) => normalizeString(message?.content))
      .filter(Boolean),
  );
}

function getConversationRoleFromValue(value, fallbackRole = "") {
  const role = normalizeString(
    value?.author?.role
    || value?.message?.author?.role
    || value?.v?.author?.role
    || value?.v?.message?.author?.role
    || fallbackRole,
  ).toLowerCase();

  return role;
}

function shouldKeepConversationText(text, { role = "", filteredMessageTexts = null, allowRoleless = false } = {}) {
  const normalizedText = normalizeString(text);
  if (!normalizedText) {
    return false;
  }

  if (role && role !== "assistant") {
    return false;
  }

  if (!role && !allowRoleless) {
    return false;
  }

  if (filteredMessageTexts?.has(normalizedText)) {
    return false;
  }

  return true;
}

function extractConversationEventText(event, options = {}) {
  const role = getConversationRoleFromValue(event, options.roleHint);
  const isContentPath = (value) => /\/message\/content\/parts\/0$/.test(String(value || ""));

  if (
    event?.o === "append"
    && isContentPath(event?.p)
    && typeof event?.v === "string"
    && shouldKeepConversationText(event.v, {
      role,
      filteredMessageTexts: options.filteredMessageTexts,
      allowRoleless: true,
    })
  ) {
    return event.v;
  }

  if (event?.o === "patch" && Array.isArray(event?.v)) {
    const patchedText = event.v
      .filter((operation) => (
        ["append", "replace", "add"].includes(normalizeString(operation?.o).toLowerCase())
        && isContentPath(operation?.p)
        && typeof operation?.v === "string"
      ))
      .map((operation) => operation.v)
      .join("");
    if (shouldKeepConversationText(patchedText, {
      role,
      filteredMessageTexts: options.filteredMessageTexts,
      allowRoleless: true,
    })) {
      return patchedText;
    }
    return "";
  }

  const fullMessageText = event?.v?.message?.content?.parts?.find?.((part) => typeof part === "string");
  if (
    typeof fullMessageText === "string"
    && shouldKeepConversationText(fullMessageText, { role, filteredMessageTexts: options.filteredMessageTexts })
  ) {
    return fullMessageText;
  }

  const directMessageText = event?.message?.content?.parts?.find?.((part) => typeof part === "string");
  if (
    typeof directMessageText === "string"
    && shouldKeepConversationText(directMessageText, { role, filteredMessageTexts: options.filteredMessageTexts })
  ) {
    return directMessageText;
  }

  return "";
}

function collectConversationTextsFromValue(value, collected = [], options = {}) {
  if (typeof value === "string") {
    const text = normalizeString(value);
    if (shouldKeepConversationText(text, {
      role: options.roleHint,
      filteredMessageTexts: options.filteredMessageTexts,
      allowRoleless: false,
    })) {
      collected.push(text);
    }
    return collected;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectConversationTextsFromValue(item, collected, options);
    }
    return collected;
  }

  if (!value || typeof value !== "object") {
    return collected;
  }

  const role = getConversationRoleFromValue(value, options.roleHint);
  const eventText = extractConversationEventText(value, {
    filteredMessageTexts: options.filteredMessageTexts,
    roleHint: role,
  });
  if (eventText) {
    collected.push(eventText);
  }

  const parts = value?.content?.parts
    || value?.message?.content?.parts
    || value?.v?.message?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (shouldKeepConversationText(part, {
        role,
        filteredMessageTexts: options.filteredMessageTexts,
        allowRoleless: false,
      })) {
        collected.push(part);
      }
    }
  }

  if (typeof value.text === "string" && shouldKeepConversationText(value.text, {
    role,
    filteredMessageTexts: options.filteredMessageTexts,
    allowRoleless: false,
  })) {
    collected.push(value.text);
  }

  if (typeof value.content === "string" && shouldKeepConversationText(value.content, {
    role,
    filteredMessageTexts: options.filteredMessageTexts,
    allowRoleless: false,
  })) {
    collected.push(value.content);
  }

  if (typeof value.value === "string" && shouldKeepConversationText(value.value, {
    role,
    filteredMessageTexts: options.filteredMessageTexts,
    allowRoleless: false,
  })) {
    collected.push(value.value);
  }

  if (value.v && typeof value.v === "object") {
    collectConversationTextsFromValue(value.v, collected, {
      ...options,
      roleHint: role,
    });
  }

  if (value.message && typeof value.message === "object") {
    collectConversationTextsFromValue(value.message, collected, {
      ...options,
      roleHint: role,
    });
  }

  if (value.data && typeof value.data === "object") {
    collectConversationTextsFromValue(value.data, collected, {
      ...options,
      roleHint: role,
    });
  }

  if (Array.isArray(value.operations)) {
    collectConversationTextsFromValue(value.operations, collected, {
      ...options,
      roleHint: role,
    });
  }

  return collected;
}

function extractConversationTextSegments(rawText, requestMessages = []) {
  const normalizedRaw = normalizeString(rawText);
  if (!normalizedRaw) {
    return [];
  }

  const filteredMessageTexts = buildConversationMessageTextFilter(requestMessages);
  const collectedTexts = [];

  const sseTexts = [];
  const sseEvents = parseConversationEvent(rawText);
  for (const event of sseEvents) {
    const text = extractConversationEventText(event, { filteredMessageTexts });
    if (text) {
      sseTexts.push(text);
    }
  }
  collectedTexts.push(...sseTexts);

  const lineTexts = [];
  for (const rawLine of String(rawText || "").split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine === "[DONE]" || trimmedLine.startsWith("event:")) {
      continue;
    }

    const candidate = trimmedLine.startsWith("data:")
      ? trimmedLine.slice(5).trim()
      : trimmedLine;
    if (!candidate || candidate === "[DONE]") {
      continue;
    }

    try {
      const parsedLine = JSON.parse(candidate);
      collectConversationTextsFromValue(parsedLine, lineTexts, { filteredMessageTexts });
    } catch {
    }
  }
  collectedTexts.push(...lineTexts);

  try {
    const parsed = JSON.parse(rawText);
    const jsonTexts = collectConversationTextsFromValue(parsed, [], { filteredMessageTexts });
    if (jsonTexts.length) {
      collectedTexts.push(...jsonTexts);
    }
  } catch {
  }

  if (collectedTexts.length) {
    return collectedTexts;
  }

  if (/^[\[{<]/.test(normalizedRaw)) {
    throw buildValidationError(502, "Conversation upstream returned an unsupported body format.");
  }

  return [normalizedRaw];
}

function stitchConversationTextSegments(segments = []) {
  let output = "";

  for (const segment of segments) {
    const text = normalizeString(segment);
    if (!text) {
      continue;
    }

    if (!output) {
      output = text;
      continue;
    }

    if (text === output) {
      continue;
    }

    if (text.startsWith(output)) {
      output = text;
      continue;
    }

    output += text;
  }

  return output;
}

// ── SSE formatter ──

function formatSSE(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// ── Stream transform ──

export function createOpenAiCompatibleConversationStreamResponse(upstreamStream, model, requestMessages = []) {
  if (!upstreamStream || typeof upstreamStream.pipeThrough !== "function") {
    throw buildValidationError(502, "Conversation upstream returned no readable stream body.");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const completionId = `chatcmpl_${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let sentRole = false;
  let sentTerminalError = false;
  let buffer = "";
  const filteredMessageTexts = buildConversationMessageTextFilter(requestMessages);

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const rawMessage of messages) {
        const errorMessage = extractConversationErrorMessage(rawMessage);
        if (errorMessage && !sentTerminalError) {
          sentTerminalError = true;
          const payload = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: sentRole
                  ? { content: `[ChatGPT Web] ${errorMessage}` }
                  : { role: "assistant", content: `[ChatGPT Web] ${errorMessage}` },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          controller.enqueue(encoder.encode(formatSSE(payload)));
          continue;
        }

        const events = parseConversationEvent(rawMessage);
        for (const event of events) {
          const text = extractConversationEventText(event, { filteredMessageTexts });
          if (!text) {
            continue;
          }

          const payload = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: sentRole
                  ? { content: text }
                  : { role: "assistant", content: text },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          controller.enqueue(encoder.encode(formatSSE(payload)));
        }
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        const errorMessage = extractConversationErrorMessage(buffer);
        if (errorMessage && !sentTerminalError) {
          sentTerminalError = true;
          const payload = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: sentRole
                  ? { content: `[ChatGPT Web] ${errorMessage}` }
                  : { role: "assistant", content: `[ChatGPT Web] ${errorMessage}` },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          controller.enqueue(encoder.encode(formatSSE(payload)));
        }

        const events = parseConversationEvent(buffer);
        for (const event of events) {
          const text = extractConversationEventText(event, { filteredMessageTexts });
          if (!text) {
            continue;
          }
          const payload = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: sentRole
                  ? { content: text }
                  : { role: "assistant", content: text },
                finish_reason: null,
              },
            ],
          };
          sentRole = true;
          controller.enqueue(encoder.encode(formatSSE(payload)));
        }
      }

      controller.enqueue(encoder.encode(formatSSE({
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      })));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  });

  return upstreamStream.pipeThrough(transformStream);
}

// ── Non-streaming conversion ──

export async function convertChatgptConversationStreamToJson(stream, model, requestMessages = []) {
  if (!stream || typeof stream.getReader !== "function") {
    throw buildValidationError(502, "Conversation upstream returned no readable response body.");
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let rawText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    rawText += decoder.decode(value, { stream: true });
  }

  rawText += decoder.decode();
  const segments = extractConversationTextSegments(rawText, requestMessages);
  const output = stitchConversationTextSegments(segments);
  const errorMessage = extractConversationErrorMessage(rawText);
  const finalOutput = output || (errorMessage ? `[ChatGPT Web] ${errorMessage}` : "");
  if (!output && !normalizeString(rawText)) {
    throw buildValidationError(502, "Conversation upstream returned an empty body.");
  }

  return {
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: finalOutput,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export async function convertChatgptConversationResponseToJson(response, model, requestMessages = []) {
  const rawText = await response.text();
  const segments = extractConversationTextSegments(rawText, requestMessages);
  const output = stitchConversationTextSegments(segments);
  const errorMessage = extractConversationErrorMessage(rawText);
  const finalOutput = output || (errorMessage ? `[ChatGPT Web] ${errorMessage}` : "");
  if (!output && !normalizeString(rawText)) {
    throw buildValidationError(502, "Conversation upstream returned an empty body.");
  }

  return {
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: finalOutput,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
