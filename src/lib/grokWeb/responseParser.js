// ── Grok Web Bridge — Response Parser ──
// Handles: NDJSON stream parsing, delta extraction

import { normalizeString } from "./constants.js";

// ── Stream line parsing ──

export function parseGrokStreamLines(text = "") {
  const lines = String(text || "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  let finalText = "";
  let conversationId = "";
  let responseId = "";

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const result = parsed?.result || {};
      const conversation = result?.conversation || {};
      const response = result?.response || {};
      const modelResponse = result?.modelResponse || response?.modelResponse || {};

      conversationId = conversation.conversationId || conversationId;
      responseId = result.responseId || response.responseId || responseId;

      const token = normalizeString(result.token || response.token);
      if (token) {
        finalText += token;
        continue;
      }

      const finalMessage = normalizeString(modelResponse.message);
      if (finalMessage) {
        finalText = finalMessage;
      }
    } catch {
    }
  }

  return {
    text: finalText.trim(),
    conversationId,
    responseId,
  };
}

// ── Delta calculation ──

function getAppendedText(previousText = "", nextText = "") {
  const previous = String(previousText || "");
  const next = String(nextText || "");
  if (!next || next === previous) {
    return "";
  }

  if (!previous) {
    return next;
  }

  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }

  return next;
}

// ── Stream response parser ──

export async function parseGrokCompletionResponse(response, { onDelta, onFirstByte } = {}) {
  if (!response?.body || typeof onDelta !== "function") {
    return parseGrokStreamLines(await response.text());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let emittedText = "";
  let markedFirstByte = false;

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      if (!markedFirstByte) {
        markedFirstByte = true;
        await onFirstByte?.();
      }
      raw += decoder.decode(value, { stream: !done });
      const parsed = parseGrokStreamLines(raw);
      const nextText = normalizeString(parsed?.text);
      const delta = getAppendedText(emittedText, nextText);
      if (delta) {
        emittedText = nextText;
        await onDelta(delta, parsed);
      }
    }

    if (done) {
      raw += decoder.decode();
      break;
    }
  }

  const finalParsed = parseGrokStreamLines(raw);
  const finalText = normalizeString(finalParsed?.text);
  const tailDelta = getAppendedText(emittedText, finalText);
  if (tailDelta) {
    emittedText = finalText;
    await onDelta(tailDelta, finalParsed);
  }

  return finalParsed;
}
