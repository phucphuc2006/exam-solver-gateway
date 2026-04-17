import { PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";

export const DIAGNOSTIC_MODALITIES = ["text", "vision", "audio", "tool-calling"];

export const DEFAULT_PROMPTS = {
  text: 'Reply with exactly "diagnostic-ok".',
  vision: 'Describe the attached image in one short sentence.',
  audio: "Audio diagnostics require a transcription-capable gateway surface.",
  "tool-calling": 'Call the `diagnostic_echo` function with value `"diagnostic-ok"`.',
};

export function getBaseUrl(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function getAttachmentMetadata(payload = {}) {
  const attachmentDataUrl = typeof payload.attachmentDataUrl === "string" ? payload.attachmentDataUrl.trim() : "";
  if (!attachmentDataUrl) return null;

  const [meta = "", body = ""] = attachmentDataUrl.split(",", 2);
  const mimeMatch = /data:(.*?)(;base64)?$/i.exec(meta);
  const mimeType = payload.attachmentMimeType || mimeMatch?.[1] || "application/octet-stream";
  return {
    dataUrl: attachmentDataUrl,
    mimeType,
    name: payload.attachmentName || "upload",
    approxBytes: body ? Math.floor((body.length * 3) / 4) : 0,
  };
}

export function buildTargetModel(connection, model) {
  if (!model) return "";
  if (model.includes("/")) return model;

  const alias = PROVIDER_ID_TO_ALIAS[connection.provider] || connection.provider;
  return `${alias}/${model}`;
}

export function buildGatewayRequestBody({ modality, targetModel, prompt, attachment }) {
  if (modality === "text") {
    return {
      model: targetModel,
      stream: false,
      max_tokens: 64,
      messages: [{ role: "user", content: prompt || DEFAULT_PROMPTS.text }],
    };
  }

  if (modality === "vision") {
    if (!attachment?.dataUrl) {
      throw new Error("Vision diagnostics require an image attachment.");
    }

    return {
      model: targetModel,
      stream: false,
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || DEFAULT_PROMPTS.vision },
            { type: "image_url", image_url: { url: attachment.dataUrl } },
          ],
        },
      ],
    };
  }

  if (modality === "tool-calling") {
    return {
      model: targetModel,
      stream: false,
      max_tokens: 128,
      tool_choice: "auto",
      tools: [
        {
          type: "function",
          function: {
            name: "diagnostic_echo",
            description: "Echoes a short value for gateway capability diagnostics.",
            parameters: {
              type: "object",
              properties: {
                value: { type: "string" },
              },
              required: ["value"],
            },
          },
        },
      ],
      messages: [{ role: "user", content: prompt || DEFAULT_PROMPTS["tool-calling"] }],
    };
  }

  throw new Error("Audio diagnostics are not yet exposed through the gateway request surface.");
}

export function getToolCallCount(responsePayload) {
  const choices = Array.isArray(responsePayload?.choices) ? responsePayload.choices : [];
  for (const choice of choices) {
    if (Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0) {
      return choice.message.tool_calls.length;
    }
  }

  const output = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
  for (const item of output) {
    if (item?.type === "function_call" || item?.type === "tool_call") {
      return 1;
    }
  }

  return 0;
}

export function buildSummary({ modality, supported, responseStatus, error, toolCalls, attachment }) {
  if (modality === "text") {
    return supported
      ? "Text completion request completed successfully."
      : error || `Text diagnostic failed with HTTP ${responseStatus || 500}.`;
  }

  if (modality === "vision") {
    return supported
      ? `Vision request completed successfully${attachment?.name ? ` with \`${attachment.name}\`` : ""}.`
      : error || `Vision diagnostic failed with HTTP ${responseStatus || 500}.`;
  }

  if (modality === "tool-calling") {
    if (supported) {
      return `Tool-calling request emitted ${toolCalls} tool call${toolCalls === 1 ? "" : "s"}.`;
    }

    return error || "Model responded without emitting a tool call.";
  }

  return "Audio diagnostics require a future audio proxy surface; result stored as manual follow-up.";
}
