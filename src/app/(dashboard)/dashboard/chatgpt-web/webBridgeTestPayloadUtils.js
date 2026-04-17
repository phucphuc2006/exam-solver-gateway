import { buildWebBridgeUserMessageContent } from "./webBridgeAttachmentUtils";

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function unwrapWebBridgeSnapshotEnvelope(payload) {
  let current = payload;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      break;
    }

    const nested = current.rawRequestBody;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      break;
    }

    current = nested;
  }

  return current;
}

export function buildPromptModeWebBridgeRequestBody({
  prompt = "",
  attachments = [],
  model = "",
  stream = false,
} = {}) {
  const body = {
    stream: stream === true,
    messages: [
      {
        role: "user",
        content: buildWebBridgeUserMessageContent(prompt, attachments),
      },
    ],
  };

  if (normalizeString(model)) {
    body.model = normalizeString(model);
  }

  return body;
}

export function parseRawWebBridgeRequestBody(rawPayload = "") {
  const raw = normalizeString(rawPayload);
  if (!raw) {
    throw new Error("Hãy dán JSON payload trước khi chạy test.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Raw payload phải là JSON hợp lệ.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Raw payload phải là object JSON.");
  }

  return unwrapWebBridgeSnapshotEnvelope(parsed);
}

export function buildWebBridgeRunTestRequestBody({
  mode = "prompt",
  rawPayload = "",
  prompt = "",
  attachments = [],
  model = "",
  stream = false,
} = {}) {
  if (mode === "raw") {
    return parseRawWebBridgeRequestBody(rawPayload);
  }

  return buildPromptModeWebBridgeRequestBody({
    prompt,
    attachments,
    model,
    stream,
  });
}

export function hasWebBridgeRunTestInput({
  mode = "prompt",
  rawPayload = "",
  prompt = "",
  attachments = [],
} = {}) {
  if (mode === "raw") {
    return Boolean(normalizeString(rawPayload));
  }

  return Boolean(normalizeString(prompt) || (Array.isArray(attachments) && attachments.length > 0));
}
