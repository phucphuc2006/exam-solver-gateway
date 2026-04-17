const MAX_SYSTEM_MESSAGES = 2;
const MAX_NON_SYSTEM_MESSAGES = 6;
const MAX_TOTAL_TEXT_CHARS = 6000;
const MAX_SYSTEM_MESSAGE_CHARS = 1200;
const MAX_MESSAGE_CHARS = 2000;
const TRUNCATION_SUFFIX = "\n\n[... da cat gon boi Web Bridge ...]";

const UNTRUSTED_METADATA_PREFIXES = [
  "conversation info (untrusted metadata):",
  "sender (untrusted metadata):",
];

const OPENCLAW_SCAFFOLD_MARKERS = [
  "you are a personal assistant running inside openclaw",
  "## tooling",
  "tool availability (filtered by policy):",
  "call tools exactly as listed.",
  "agents_list",
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "session_status",
];

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function normalizeBridgeTextValue(value) {
  return normalizeString(value).replace(/\r\n/g, "\n");
}

function isOpenClawScaffoldingText(text) {
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

function isUntrustedMetadataPrefixText(text) {
  const normalized = normalizeBridgeTextValue(text).trim().toLowerCase();
  return UNTRUSTED_METADATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isStandaloneJsonMetadataLabel(text) {
  return normalizeBridgeTextValue(text).trim().toLowerCase() === "json";
}

function trimText(text, maxChars) {
  const normalized = normalizeString(text);
  if (!normalized || normalized.length <= maxChars) {
    return normalized;
  }

  if (maxChars <= TRUNCATION_SUFFIX.length) {
    return normalized.slice(0, Math.max(0, maxChars)).trimEnd();
  }

  return `${normalized.slice(0, maxChars - TRUNCATION_SUFFIX.length).trimEnd()}${TRUNCATION_SUFFIX}`;
}

function stripUntrustedMetadataPreamble(content) {
  let normalized = normalizeBridgeTextValue(content);

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
          braceDepth = Math.max(0, braceDepth - 1);
          if (foundJsonStart && braceDepth === 0) {
            jsonClosedAt = lineIndex;
            break;
          }
        }
      }

      if (jsonClosedAt !== -1) {
        break;
      }
    }

    if (jsonClosedAt === -1) {
      break;
    }

    normalized = lines.slice(jsonClosedAt + 1).join("\n").trimStart();
  }

  return normalized.trim();
}

function getMessageTextLength(message) {
  return normalizeBridgeTextValue(message?.content).trim().length;
}

function hasMessageContent(message) {
  const text = normalizeBridgeTextValue(message?.content).trim();
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  return Boolean(text || attachments.length > 0);
}

export function sanitizeWebBridgePromptMessages(messages = []) {
  const entries = [];

  for (let index = 0; index < messages.length; index += 1) {
    const sourceMessage = messages[index];
    const role = normalizeString(sourceMessage?.role).trim().toLowerCase();

    if (!role || role === "tool" || role === "function") {
      continue;
    }

    const content = normalizeBridgeTextValue(sourceMessage?.content);
    if (role === "system" && isOpenClawScaffoldingText(content)) {
      continue;
    }

    const nextMessage = {
      ...sourceMessage,
      role,
      content: stripUntrustedMetadataPreamble(content),
    };

    if (!hasMessageContent(nextMessage)) {
      continue;
    }

    entries.push({ index, message: nextMessage });
  }

  if (entries.length === 0) {
    return [];
  }

  const systemEntries = entries.filter((entry) => entry.message.role === "system");
  const nonSystemEntries = entries.filter((entry) => entry.message.role !== "system");
  const compacted = [
    ...systemEntries.slice(0, MAX_SYSTEM_MESSAGES),
    ...nonSystemEntries.slice(-MAX_NON_SYSTEM_MESSAGES),
  ].sort((left, right) => left.index - right.index);

  const trimmed = compacted.map((entry, compactIndex) => {
    const maxChars = entry.message.role === "system"
      ? MAX_SYSTEM_MESSAGE_CHARS
      : compactIndex === compacted.length - 1
        ? MAX_MESSAGE_CHARS
        : Math.min(MAX_MESSAGE_CHARS, 1200);

    return {
      ...entry,
      message: {
        ...entry.message,
        content: trimText(entry.message.content, maxChars),
      },
    };
  });

  while (
    trimmed.reduce((total, entry) => total + getMessageTextLength(entry.message), 0) > MAX_TOTAL_TEXT_CHARS
    && trimmed.length > 1
  ) {
    const removableIndex = trimmed.findIndex((entry, index) => (
      entry.message.role !== "system" && index < trimmed.length - 1
    ));

    if (removableIndex === -1) {
      break;
    }

    trimmed.splice(removableIndex, 1);
  }

  return trimmed.map((entry) => entry.message);
}
