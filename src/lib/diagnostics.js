import { getApiKeys, getProviderConnectionById } from "@/lib/localDb";
import { upsertDiagnosticResult } from "@/lib/storage/sqlite/repositories";
import { 
  DIAGNOSTIC_MODALITIES, 
  DEFAULT_PROMPTS, 
  getBaseUrl, 
  safeParseJson, 
  getAttachmentMetadata, 
  buildTargetModel, 
  buildGatewayRequestBody, 
  getToolCallCount, 
  buildSummary 
} from "./diagnosticHelpers";

export { DIAGNOSTIC_MODALITIES };

export function normalizeDiagnosticResult({
  connection,
  targetModel,
  modality,
  latencyMs,
  responseStatus = null,
  responsePayload = null,
  error = null,
  attachment = null,
}) {
  const toolCalls = modality === "tool-calling" ? getToolCallCount(responsePayload) : 0;
  const supported = modality === "audio"
    ? false
    : Boolean(!error && responseStatus && responseStatus >= 200 && responseStatus < 300 && (modality !== "tool-calling" || toolCalls > 0));

  const flagName = modality === "vision"
    ? "supports_vision"
    : modality === "audio"
      ? "supports_audio"
      : modality === "tool-calling"
        ? "supports_tools"
        : "supports_text";

  return {
    provider: connection.provider,
    connectionId: connection.id,
    model: targetModel,
    modality,
    source: "manual",
    supported,
    latencyMs,
    lastTestedAt: new Date().toISOString(),
    summary: buildSummary({ modality, supported, responseStatus, error, toolCalls, attachment }),
    requestPayload: null,
    responsePayload,
    metadata: {
      capabilityFlag: flagName,
      responseStatus,
      toolCalls,
      attachmentName: attachment?.name || null,
      attachmentMimeType: attachment?.mimeType || null,
      attachmentBytes: attachment?.approxBytes || 0,
      error,
    },
  };
}

async function getInternalApiKey() {
  const keys = await getApiKeys();
  return keys.find((key) => key.isActive !== false)?.key || null;
}

export async function runManualDiagnostic(request, payload) {
  const connection = await getProviderConnectionById(payload.connectionId);
  if (!connection) {
    throw new Error("Connection not found");
  }

  if (!DIAGNOSTIC_MODALITIES.includes(payload.modality)) {
    throw new Error("Unsupported diagnostic modality");
  }

  const targetModel = buildTargetModel(connection, String(payload.model || "").trim());
  if (!targetModel) {
    throw new Error("Model is required");
  }

  const attachment = getAttachmentMetadata(payload);

  if (payload.modality === "audio") {
    const normalized = normalizeDiagnosticResult({
      connection,
      targetModel,
      modality: payload.modality,
      latencyMs: 0,
      responsePayload: null,
      error: "Audio proxy route is not yet available in the gateway surface.",
      attachment,
    });

    normalized.requestPayload = {
      prompt: payload.prompt || DEFAULT_PROMPTS.audio,
      attachment: attachment
        ? { name: attachment.name, mimeType: attachment.mimeType, approxBytes: attachment.approxBytes }
        : null,
    };

    return upsertDiagnosticResult(normalized);
  }

  const baseUrl = getBaseUrl(request);
  const apiKey = await getInternalApiKey();
  const requestBody = buildGatewayRequestBody({
    modality: payload.modality,
    targetModel,
    prompt: payload.prompt,
    attachment,
  });

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let responseStatus = null;
  let responsePayload = null;
  let error = null;
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45_000),
    });

    responseStatus = response.status;
    const text = await response.text();
    responsePayload = safeParseJson(text) || { rawText: text.slice(0, 2_000) };

    if (!response.ok) {
      error = responsePayload?.error?.message || responsePayload?.error || `HTTP ${response.status}`;
    }
  } catch (caughtError) {
    error = caughtError?.message || "Diagnostic request failed";
  }

  const normalized = normalizeDiagnosticResult({
    connection,
    targetModel,
    modality: payload.modality,
    latencyMs: Date.now() - startedAt,
    responseStatus,
    responsePayload,
    error,
    attachment,
  });

  normalized.requestPayload = {
    prompt: payload.prompt || DEFAULT_PROMPTS[payload.modality],
    gatewayBody: requestBody,
    attachment: attachment
      ? { name: attachment.name, mimeType: attachment.mimeType, approxBytes: attachment.approxBytes }
      : null,
  };

  return upsertDiagnosticResult(normalized);
}
