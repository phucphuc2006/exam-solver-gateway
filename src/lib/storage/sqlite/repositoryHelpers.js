import crypto from "node:crypto";

export function parseJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function toJson(value) {
  return JSON.stringify(value ?? null);
}

export function toIsoTimestamp(value, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createStableHash(parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(typeof part === "string" ? part : JSON.stringify(part ?? null));
    hash.update("|");
  }
  return hash.digest("hex");
}

export function createUsageEntryId(entry) {
  return entry?.id || createStableHash([
    entry?.timestamp,
    entry?.provider,
    entry?.model,
    entry?.connectionId,
    entry?.apiKey,
    entry?.endpoint,
    entry?.tokens,
    entry?.status,
  ]);
}

export function createRequestLogId(record) {
  return record?.id || createStableHash([
    record?.timestamp,
    record?.model,
    record?.provider,
    record?.connectionId,
    record?.accountName,
    record?.promptTokens,
    record?.completionTokens,
    record?.status,
    record?.rawLine,
  ]);
}

export function createDiagnosticResultId(result) {
  return result?.id || createStableHash([
    result?.source || "manual",
    result?.connectionId,
    result?.provider,
    result?.model,
    result?.modality,
  ]);
}
