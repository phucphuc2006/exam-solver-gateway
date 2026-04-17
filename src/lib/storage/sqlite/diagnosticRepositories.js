import { desc } from "drizzle-orm";
import { diagnosticResults } from "./schema";
import { getStorageDb } from "./client";
import { parseJson, toJson, toIsoTimestamp, toNullableNumber, createDiagnosticResultId } from "./repositoryHelpers";

export async function upsertDiagnosticResult(result) {
  const normalized = {
    id: createDiagnosticResultId(result),
    provider: result.provider || null,
    connectionId: result.connectionId || null,
    model: result.model || null,
    modality: result.modality,
    source: result.source || "manual",
    supported: result.supported ? 1 : 0,
    lastTestedAt: toIsoTimestamp(result.lastTestedAt),
    latencyMs: toNullableNumber(result.latencyMs),
    summary: result.summary || null,
    requestJson: result.requestPayload ? toJson(result.requestPayload) : null,
    responseJson: result.responsePayload ? toJson(result.responsePayload) : null,
    metadataJson: toJson(result.metadata || {}),
  };

  const db = getStorageDb();
  db.insert(diagnosticResults)
    .values(normalized)
    .onConflictDoUpdate({
      target: diagnosticResults.id,
      set: {
        provider: normalized.provider,
        connectionId: normalized.connectionId,
        model: normalized.model,
        modality: normalized.modality,
        source: normalized.source,
        supported: normalized.supported,
        lastTestedAt: normalized.lastTestedAt,
        latencyMs: normalized.latencyMs,
        summary: normalized.summary,
        requestJson: normalized.requestJson,
        responseJson: normalized.responseJson,
        metadataJson: normalized.metadataJson,
      },
    })
    .run();

  return {
    ...result,
    id: normalized.id,
    supported: Boolean(normalized.supported),
    lastTestedAt: normalized.lastTestedAt,
  };
}

export async function getDiagnosticResults(filter = {}) {
  const db = getStorageDb();
  let rows = db.select().from(diagnosticResults).orderBy(desc(diagnosticResults.lastTestedAt)).all();

  if (filter.connectionId) {
    rows = rows.filter((row) => row.connectionId === filter.connectionId);
  }
  if (filter.model) {
    rows = rows.filter((row) => row.model === filter.model);
  }
  if (filter.modality) {
    rows = rows.filter((row) => row.modality === filter.modality);
  }
  if (filter.source) {
    rows = rows.filter((row) => row.source === filter.source);
  }

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    connectionId: row.connectionId,
    model: row.model,
    modality: row.modality,
    source: row.source,
    supported: Boolean(row.supported),
    lastTestedAt: row.lastTestedAt,
    latencyMs: row.latencyMs,
    summary: row.summary,
    requestPayload: parseJson(row.requestJson, null),
    responsePayload: parseJson(row.responseJson, null),
    metadata: parseJson(row.metadataJson, {}),
  }));
}
