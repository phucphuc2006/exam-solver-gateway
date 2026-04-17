import { desc } from "drizzle-orm";
import {
  usageHistory,
  requestDetails,
  requestLogs,
} from "./schema";
import { getStorageConnection, getStorageDb, withStorageTransaction } from "./client";
import { parseJson, toJson, toIsoTimestamp, toNullableNumber, createUsageEntryId, createRequestLogId } from "./repositoryHelpers";
import { createDefaultUsageState, createDefaultRequestDetailsState } from "@/lib/storage/defaults";
import { getCurrentSchemaRecordSync, upsertSchemaRecord, clearTable } from "./coreRepositories";

export async function getUsageStateSnapshot() {
  const defaults = createDefaultUsageState();
  const db = getStorageDb();
  const historyRows = db
    .select()
    .from(usageHistory)
    .orderBy(usageHistory.timestamp)
    .all();

  return {
    history: historyRows
      .map((row) => parseJson(row.entryJson, null))
      .filter(Boolean),
    totalRequestsLifetime: Math.max(
      defaults.totalRequestsLifetime,
      Number(getCurrentSchemaRecordSync(db)?.usageLifetimeCount || 0),
      historyRows.length,
    ),
  };
}

export async function saveUsageStateSnapshot(snapshot) {
  const defaults = createDefaultUsageState();
  const next = {
    ...defaults,
    ...(snapshot || {}),
    history: Array.isArray(snapshot?.history) ? snapshot.history : defaults.history,
  };

  withStorageTransaction((tx) => {
    upsertSchemaRecord(tx, {
      usageLifetimeCount: Math.max(next.totalRequestsLifetime || 0, next.history.length),
    });
    clearTable(tx, usageHistory);

    for (const entry of next.history) {
      const promptTokens = entry?.tokens?.prompt_tokens ?? entry?.tokens?.input_tokens ?? null;
      const completionTokens = entry?.tokens?.completion_tokens ?? entry?.tokens?.output_tokens ?? null;

      tx.insert(usageHistory)
        .values({
          id: createUsageEntryId(entry),
          provider: entry.provider || null,
          model: entry.model || null,
          connectionId: entry.connectionId || null,
          apiKey: entry.apiKey || null,
          endpoint: entry.endpoint || null,
          status: entry.status || null,
          timestamp: toIsoTimestamp(entry.timestamp),
          cost: Number(entry.cost || 0),
          promptTokens: toNullableNumber(promptTokens),
          completionTokens: toNullableNumber(completionTokens),
          entryJson: toJson(entry),
        })
        .run();
    }
  });

  return {
    history: next.history,
    totalRequestsLifetime: Math.max(next.totalRequestsLifetime || 0, next.history.length),
  };
}

export async function getRequestDetailsStateSnapshot() {
  const defaults = createDefaultRequestDetailsState();
  const db = getStorageDb();
  const rows = db
    .select()
    .from(requestDetails)
    .orderBy(desc(requestDetails.timestamp))
    .all();

  return {
    records: rows
      .map((row) => parseJson(row.detailJson, null))
      .filter(Boolean)
      .slice(0, Math.max(defaults.records.length, rows.length)),
  };
}

export async function saveRequestDetailsStateSnapshot(snapshot) {
  const defaults = createDefaultRequestDetailsState();
  const records = Array.isArray(snapshot?.records) ? snapshot.records : defaults.records;

  withStorageTransaction((tx) => {
    clearTable(tx, requestDetails);

    for (const detail of records) {
      tx.insert(requestDetails)
        .values({
          id: detail.id,
          provider: detail.provider || null,
          model: detail.model || null,
          connectionId: detail.connectionId || null,
          timestamp: toIsoTimestamp(detail.timestamp),
          status: detail.status || null,
          detailJson: toJson(detail),
        })
        .run();
    }
  });

  return { records };
}

export async function replaceRequestLogs(records = []) {
  withStorageTransaction((tx) => {
    clearTable(tx, requestLogs);

    for (const record of records) {
      tx.insert(requestLogs)
        .values({
          id: createRequestLogId(record),
          timestamp: toIsoTimestamp(record.timestamp),
          model: record.model || null,
          provider: record.provider || null,
          connectionId: record.connectionId || null,
          accountName: record.accountName || null,
          promptTokens: toNullableNumber(record.promptTokens),
          completionTokens: toNullableNumber(record.completionTokens),
          status: record.status || null,
          rawLine: record.rawLine,
        })
        .run();
    }
  });
}

function trimRequestLogs(maxRows = 200) {
  const connection = getStorageConnection();
  connection
    .prepare(`
      DELETE FROM request_logs
      WHERE id NOT IN (
        SELECT id
        FROM request_logs
        ORDER BY timestamp DESC, rowid DESC
        LIMIT ?
      )
    `)
    .run(maxRows);
}

export async function appendRequestLogRecord(record) {
  const db = getStorageDb();
  db.insert(requestLogs)
    .values({
      id: createRequestLogId(record),
      timestamp: toIsoTimestamp(record.timestamp),
      model: record.model || null,
      provider: record.provider || null,
      connectionId: record.connectionId || null,
      accountName: record.accountName || null,
      promptTokens: toNullableNumber(record.promptTokens),
      completionTokens: toNullableNumber(record.completionTokens),
      status: record.status || null,
      rawLine: record.rawLine,
    })
    .onConflictDoUpdate({
      target: requestLogs.id,
      set: {
        timestamp: toIsoTimestamp(record.timestamp),
        model: record.model || null,
        provider: record.provider || null,
        connectionId: record.connectionId || null,
        accountName: record.accountName || null,
        promptTokens: toNullableNumber(record.promptTokens),
        completionTokens: toNullableNumber(record.completionTokens),
        status: record.status || null,
        rawLine: record.rawLine,
      },
    })
    .run();

  trimRequestLogs(200);
}

export async function getRecentRequestLogLines(limit = 200) {
  const db = getStorageDb();
  return db
    .select({ rawLine: requestLogs.rawLine })
    .from(requestLogs)
    .orderBy(desc(requestLogs.timestamp))
    .limit(limit)
    .all()
    .map((row) => row.rawLine);
}
