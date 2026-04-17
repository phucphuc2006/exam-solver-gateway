// ── Chat Handler — Web Bridge message sanitizer ──
// Normalizes, strips metadata, compacts messages for web bridge providers

import * as log from "../../utils/logger.js";
import {
  WEB_BRIDGE_TEXT_PART_TYPES,
  WEB_BRIDGE_SUPPORTED_PART_TYPES,
  WEB_BRIDGE_MAX_SYSTEM_MESSAGES,
  WEB_BRIDGE_MAX_NON_SYSTEM_MESSAGES,
  WEB_BRIDGE_MAX_TOTAL_TEXT_CHARS,
  WEB_BRIDGE_MAX_SYSTEM_MESSAGE_CHARS,
  WEB_BRIDGE_MAX_MESSAGE_CHARS,
  WEB_BRIDGE_TRUNCATION_SUFFIX,
  UNSUPPORTED_WEB_BRIDGE_FIELDS,
  UNTRUSTED_METADATA_PREFIXES,
  UNTRUSTED_METADATA_JSON_KEYS,
  OPENCLAW_SCAFFOLD_MARKERS,
  shouldUseRawWebBridgePassthrough,
} from "./constants.js";

// ── Text normalization helpers ──

export function normalizeBridgeTextValue(value) {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n")
    : "";
}

export function extractTextFromNormalizedWebBridgePart(part) {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object" || Array.isArray(part)) {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  if (typeof part.value === "string") {
    return part.value;
  }

  if (typeof part.content === "string") {
    return part.content;
  }

  return "";
}

export function getWebBridgeTextView(content) {
  if (typeof content === "string") {
    return normalizeBridgeTextValue(content).trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return normalizeBridgeTextValue(
    content
      .map((part) => extractTextFromNormalizedWebBridgePart(part))
      .filter((value) => typeof value === "string" && value.trim())
      .join("\n\n"),
  ).trim();
}

// ── Metadata detection ──

export function isUntrustedMetadataPrefixText(text) {
  const normalized = normalizeBridgeTextValue(text).trim().toLowerCase();
  return UNTRUSTED_METADATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function isStandaloneJsonMetadataLabel(text) {
  return normalizeBridgeTextValue(text).trim().toLowerCase() === "json";
}

export function looksLikeUntrustedMetadataJson(text) {
  const normalized = normalizeBridgeTextValue(text).trim();
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  return UNTRUSTED_METADATA_JSON_KEYS.some((key) => lowered.includes(key));
}

export function hasWebBridgeMessageContent(content) {
  if (typeof content === "string") {
    return Boolean(content.trim());
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (typeof part === "string") {
      return Boolean(part.trim());
    }

    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return false;
    }

    if (typeof part.text === "string") {
      return Boolean(part.text.trim());
    }

    return true;
  });
}

export function isOpenClawScaffoldingText(text) {
  const normalized = normalizeBridgeTextValue(text).trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized.includes(OPENCLAW_SCAFFOLD_MARKERS[0])) {
    return true;
  }

  let matchedMarkers = 0;
  for (const marker of OPENCLAW_SCAFFOLD_MARKERS.slice(1)) {
    if (normalized.includes(marker)) {
      matchedMarkers += 1;
    }
  }

  return matchedMarkers >= 3;
}

// ── Trimming ──

export function trimWebBridgeText(text, maxChars) {
  const normalized = typeof text === "string" ? text : "";
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= WEB_BRIDGE_TRUNCATION_SUFFIX.length) {
    return normalized.slice(0, Math.max(0, maxChars)).trimEnd();
  }

  return `${normalized.slice(0, maxChars - WEB_BRIDGE_TRUNCATION_SUFFIX.length).trimEnd()}${WEB_BRIDGE_TRUNCATION_SUFFIX}`;
}

export function trimWebBridgeContent(content, maxChars) {
  if (typeof content === "string") {
    return trimWebBridgeText(content, maxChars);
  }

  return content;
}

export function getWebBridgeMessageTextLength(message) {
  return getWebBridgeTextView(message?.content).length;
}

// ── Metadata stripping ──

export function stripUntrustedMetadataPreamble(content, provider, index, rawMessagePassthrough = false) {
  const text = typeof content === "string" ? content : "";
  if (rawMessagePassthrough) {
    return text;
  }

  let normalized = normalizeBridgeTextValue(text);
  let strippedBlocks = 0;

  while (true) {
    const lines = normalized.split("\n");
    let cursor = 0;

    while (cursor < lines.length && !lines[cursor].trim()) {
      cursor += 1;
    }

    if (!isUntrustedMetadataPrefixText(lines[cursor] || "")) {
      break;
    }

    cursor += 1;
    while (cursor < lines.length && !lines[cursor].trim()) {
      cursor += 1;
    }

    if (cursor < lines.length && isStandaloneJsonMetadataLabel(lines[cursor])) {
      cursor += 1;
    }

    while (cursor < lines.length && !lines[cursor].trim()) {
      cursor += 1;
    }

    if (cursor >= lines.length || !lines[cursor].trim().startsWith("{")) {
      break;
    }

    let braceDepth = 0;
    let foundJsonStart = false;
    let jsonClosedAt = -1;

    for (let lineIndex = cursor; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      for (const char of line) {
        if (char === "{") {
          braceDepth += 1;
          foundJsonStart = true;
        } else if (char === "}") {
          braceDepth -= 1;
        }
      }

      if (foundJsonStart && braceDepth <= 0) {
        jsonClosedAt = lineIndex;
        break;
      }
    }

    if (jsonClosedAt === -1) {
      break;
    }

    normalized = lines.slice(jsonClosedAt + 1).join("\n");
    strippedBlocks += 1;
  }

  if (!strippedBlocks) {
    return text;
  }

  const remaining = normalized.trim();
  log.info("ROUTING", `Web Bridge sanitize ${provider}: stripped ${strippedBlocks} metadata block(s) from message #${index + 1}`);
  return remaining;
}

// ── Role normalization ──

export function normalizeWebBridgeRole(role, provider, index) {
  const normalizedRole = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (!normalizedRole) {
    return "user";
  }

  if (normalizedRole === "developer") {
    log.info("ROUTING", `Web Bridge sanitize ${provider}: converted message #${index + 1} role developer -> system`);
    return "system";
  }

  if (normalizedRole === "tool" || normalizedRole === "function") {
    log.info("ROUTING", `Web Bridge sanitize ${provider}: converted message #${index + 1} role ${normalizedRole} -> user`);
    return "user";
  }

  return normalizedRole;
}

// ── Part normalization ──

export function normalizeWebBridgePart(part) {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object" || Array.isArray(part)) {
    return null;
  }

  const partType = typeof part.type === "string" ? part.type.trim().toLowerCase() : "";

  if (WEB_BRIDGE_TEXT_PART_TYPES.has(partType)) {
    return {
      type: "text",
      text: typeof part.text === "string"
        ? part.text
        : typeof part.value === "string"
          ? part.value
          : "",
    };
  }

  if (WEB_BRIDGE_SUPPORTED_PART_TYPES.has(partType)) {
    return part;
  }

  if (typeof part.text === "string") {
    return {
      type: "text",
      text: part.text,
    };
  }

  if (typeof part.content === "string") {
    return {
      type: "text",
      text: part.content,
    };
  }

  return null;
}

export function normalizeWebBridgePartsValue(parts, provider, index, rawMessagePassthrough = false) {
  const normalizedParts = (Array.isArray(parts) ? parts : [])
    .map((part) => normalizeWebBridgePart(part))
    .filter(Boolean);

  if (normalizedParts.length === 0) {
    return "";
  }

  const hasNonTextParts = normalizedParts.some((part) => {
    if (typeof part === "string") {
      return false;
    }

    return part?.type !== "text";
  });

  if (!hasNonTextParts) {
    return stripUntrustedMetadataPreamble(
      normalizedParts
        .map((part) => extractTextFromNormalizedWebBridgePart(part))
        .filter((value) => typeof value === "string" && value.trim())
        .join("\n\n"),
      provider,
      index,
      rawMessagePassthrough,
    );
  }

  return normalizedParts;
}

// ── Content normalization ──

export function normalizeWebBridgeContentValue(content, provider, index, rawMessagePassthrough = false) {
  if (typeof content === "string" || Array.isArray(content)) {
    if (!Array.isArray(content)) {
      return stripUntrustedMetadataPreamble(content, provider, index, rawMessagePassthrough);
    }

    return normalizeWebBridgePartsValue(content, provider, index, rawMessagePassthrough);
  }

  if (!content || typeof content !== "object") {
    return "";
  }

  if (typeof content.text === "string") {
    return stripUntrustedMetadataPreamble(content.text, provider, index, rawMessagePassthrough);
  }

  if (typeof content.value === "string") {
    return stripUntrustedMetadataPreamble(content.value, provider, index, rawMessagePassthrough);
  }

  if (typeof content.content === "string") {
    return stripUntrustedMetadataPreamble(content.content, provider, index, rawMessagePassthrough);
  }

  if (typeof content.message === "string") {
    return stripUntrustedMetadataPreamble(content.message, provider, index, rawMessagePassthrough);
  }

  if (Array.isArray(content.parts)) {
    return normalizeWebBridgePartsValue(content.parts, provider, index, rawMessagePassthrough);
  }

  if (Array.isArray(content.content)) {
    return normalizeWebBridgePartsValue(content.content, provider, index, rawMessagePassthrough);
  }

  if (Array.isArray(content.items)) {
    return normalizeWebBridgePartsValue(content.items, provider, index, rawMessagePassthrough);
  }

  const fallback = JSON.stringify(content);
  log.info("ROUTING", `Web Bridge sanitize ${provider}: coerced message #${index + 1} content object -> JSON string`);
  return fallback;
}

// ── Tool call fallback ──

export function buildWebBridgeToolCallFallback(message = {}) {
  const entries = [];

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      if (!toolCall || typeof toolCall !== "object") {
        continue;
      }

      entries.push({
        id: toolCall.id ?? null,
        type: toolCall.type ?? null,
        function: toolCall.function ?? null,
      });
    }
  }

  if (message.function_call !== undefined) {
    entries.push({
      function_call: message.function_call,
    });
  }

  if (entries.length === 0) {
    return "";
  }

  return `[Tool calls]\n${entries.map((entry) => JSON.stringify(entry)).join("\n")}`;
}

// ── Single message sanitizer ──

export function sanitizeWebBridgeMessage(message, provider, index, rawMessagePassthrough = false) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {
      role: "user",
      content: typeof message === "string" ? message : JSON.stringify(message ?? ""),
    };
  }

  const normalizedRole = rawMessagePassthrough
    ? (typeof message.role === "string" && message.role.trim() ? message.role.trim() : "user")
    : normalizeWebBridgeRole(message.role, provider, index);
  const normalizedContent = normalizeWebBridgeContentValue(
    message.content,
    provider,
    index,
    rawMessagePassthrough,
  );
  const nextMessage = {
    ...message,
    role: normalizedRole,
    content: normalizedContent,
  };

  const toolCallFallback = buildWebBridgeToolCallFallback(message);
  if (!rawMessagePassthrough && toolCallFallback) {
    if (!(typeof nextMessage.content === "string" && nextMessage.content.trim())) {
      nextMessage.content = toolCallFallback;
    }
  }

  if (!rawMessagePassthrough) {
    delete nextMessage.tool_calls;
    delete nextMessage.tool_call_id;
    delete nextMessage.function_call;
    delete nextMessage.name;
  }

  if (!rawMessagePassthrough && (message.role === "tool" || message.role === "function") && typeof nextMessage.content === "string") {
    const toolName = typeof message.name === "string" && message.name.trim()
      ? `: ${message.name.trim()}`
      : "";
    nextMessage.content = `[Tool output${toolName}]\n${nextMessage.content}`;
  }

  return nextMessage;
}

// ── Message compaction ──

export function compactWebBridgeMessages(entries, provider) {
  const originalCount = entries.length;
  const originalChars = entries.reduce((total, entry) => total + getWebBridgeMessageTextLength(entry.message), 0);

  let droppedToolCount = 0;
  let working = entries.filter((entry) => {
    const originalRole = typeof entry.originalRole === "string" ? entry.originalRole : "";
    const shouldDrop = originalRole === "tool" || originalRole === "function";
    if (shouldDrop) {
      droppedToolCount += 1;
    }
    return !shouldDrop;
  });

  const systemEntries = working.filter((entry) => entry.message.role === "system");
  const nonSystemEntries = working.filter((entry) => entry.message.role !== "system");

  working = [
    ...systemEntries.slice(0, WEB_BRIDGE_MAX_SYSTEM_MESSAGES),
    ...nonSystemEntries.slice(-WEB_BRIDGE_MAX_NON_SYSTEM_MESSAGES),
  ].sort((left, right) => left.index - right.index);

  if (working.length === 0 && entries.length > 0) {
    const fallbackEntry = entries[entries.length - 1];
    working = [fallbackEntry];
  }

  working = working.map((entry, compactIndex) => {
    const maxChars = entry.message.role === "system"
      ? WEB_BRIDGE_MAX_SYSTEM_MESSAGE_CHARS
      : compactIndex === working.length - 1
        ? WEB_BRIDGE_MAX_MESSAGE_CHARS
        : Math.min(WEB_BRIDGE_MAX_MESSAGE_CHARS, 1200);

    return {
      ...entry,
      message: {
        ...entry.message,
        content: trimWebBridgeContent(entry.message.content, maxChars),
      },
    };
  });

  while (
    working.reduce((total, entry) => total + getWebBridgeMessageTextLength(entry.message), 0) > WEB_BRIDGE_MAX_TOTAL_TEXT_CHARS
    && working.length > 1
  ) {
    const removableIndex = working.findIndex((entry, index) => (
      entry.message.role !== "system" && index < working.length - 1
    ));

    if (removableIndex === -1) {
      break;
    }

    working.splice(removableIndex, 1);
  }

  const compactedChars = working.reduce((total, entry) => total + getWebBridgeMessageTextLength(entry.message), 0);
  if (droppedToolCount > 0 || working.length !== originalCount || compactedChars !== originalChars) {
    log.info(
      "ROUTING",
      `Web Bridge sanitize ${provider}: compacted messages ${originalCount} -> ${working.length}, text ${originalChars} -> ${compactedChars}, dropped tools ${droppedToolCount}`,
    );
  }

  return working.map((entry) => entry.message);
}

// ── Full body sanitizer ──

export function sanitizeWebBridgeBody(body, provider) {
  const nextBody = { ...(body || {}) };
  const removedFields = [];
  const rawMessagePassthrough = shouldUseRawWebBridgePassthrough(provider, body);
  nextBody.__webBridgeRawMessagePassthrough = rawMessagePassthrough;

  if (!rawMessagePassthrough) {
    for (const field of UNSUPPORTED_WEB_BRIDGE_FIELDS) {
      if (nextBody[field] !== undefined) {
        removedFields.push(field);
        delete nextBody[field];
      }
    }
  }

  if (removedFields.length > 0) {
    log.info("ROUTING", `Web Bridge sanitize ${provider}: dropped ${removedFields.join(", ")}`);
  }

  if (Array.isArray(nextBody.messages)) {
    const sanitizedEntries = [];
    let skippingUntrustedMetadata = false;

    for (let index = 0; index < nextBody.messages.length; index += 1) {
      const sourceMessage = nextBody.messages[index];
      const originalRole = typeof sourceMessage?.role === "string"
        ? sourceMessage.role.trim().toLowerCase()
        : "";
      const sanitizedMessage = sanitizeWebBridgeMessage(
        sourceMessage,
        provider,
        index,
        rawMessagePassthrough,
      );
      const textView = getWebBridgeTextView(sanitizedMessage.content);

      if (
        !rawMessagePassthrough
        && (
          sanitizedMessage.role === "system"
          && textView
          && isOpenClawScaffoldingText(textView)
        )
      ) {
        log.info("ROUTING", `Web Bridge sanitize ${provider}: dropped OpenClaw scaffold message #${index + 1}`);
        continue;
      }

      if (!rawMessagePassthrough && textView && isUntrustedMetadataPrefixText(textView)) {
        skippingUntrustedMetadata = true;
        log.info("ROUTING", `Web Bridge sanitize ${provider}: dropped metadata prefix message #${index + 1}`);
        continue;
      }

      if (!rawMessagePassthrough && skippingUntrustedMetadata) {
        if (!textView || isStandaloneJsonMetadataLabel(textView) || looksLikeUntrustedMetadataJson(textView)) {
          log.info("ROUTING", `Web Bridge sanitize ${provider}: dropped metadata payload message #${index + 1}`);
          continue;
        }

        skippingUntrustedMetadata = false;
      }

      if (!rawMessagePassthrough && !hasWebBridgeMessageContent(sanitizedMessage.content)) {
        log.info("ROUTING", `Web Bridge sanitize ${provider}: dropped empty message #${index + 1}`);
        continue;
      }

      sanitizedEntries.push({
        index,
        originalRole,
        message: sanitizedMessage,
      });
    }

    if (rawMessagePassthrough) {
      nextBody.messages = sanitizedEntries.map((entry) => entry.message);
      log.info(
        "ROUTING",
        `Web Bridge sanitize ${provider}: raw message passthrough enabled (${sanitizedEntries.length} msgs)`,
      );
    } else {
      nextBody.messages = compactWebBridgeMessages(sanitizedEntries, provider);
    }
  }

  return nextBody;
}
