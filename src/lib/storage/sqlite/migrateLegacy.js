import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getRuntimeDataDir } from "@/lib/serverRuntimeConfig";
import {
  createDefaultLocalState,
  createDefaultRequestDetailsState,
  createDefaultUsageState,
} from "@/lib/storage/defaults";
import {
  getSchemaVersionRecord,
  isCanonicalStoreEmpty,
  replaceRequestLogs,
  saveGatewayStateSnapshot,
  saveRequestDetailsStateSnapshot,
  saveUsageStateSnapshot,
} from "./repositories";
import { getStorageDb } from "./client";
import {
  apiKeys,
  combos,
  diagnosticResults,
  providerConnections,
  providerNodes,
  proxyPools,
  requestDetails,
  usageHistory,
} from "./schema";

const AUTO_IMPORT_KEY = "__nexusStorageReady";

function getLegacyFilePath(fileName) {
  return path.join(path.resolve(getRuntimeDataDir()), fileName);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readTextFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseLogTimestamp(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return new Date().toISOString();

  const [, day, month, year, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`).toISOString();
}

function parseLegacyLogLines(rawText) {
  if (!rawText.trim()) return [];

  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length < 7) {
        return {
          timestamp: new Date().toISOString(),
          model: null,
          provider: null,
          connectionId: null,
          accountName: null,
          promptTokens: null,
          completionTokens: null,
          status: null,
          rawLine: line,
        };
      }

      const [timestamp, model, provider, accountName, promptTokens, completionTokens, status] = parts;
      return {
        timestamp: parseLogTimestamp(timestamp),
        model: model === "-" ? null : model,
        provider: provider === "-" ? null : provider.toLowerCase(),
        connectionId: null,
        accountName: accountName === "-" ? null : accountName,
        promptTokens: promptTokens === "-" ? null : Number(promptTokens),
        completionTokens: completionTokens === "-" ? null : Number(completionTokens),
        status: status === "-" ? null : status,
        rawLine: line,
      };
    });
}

function createLegacyFingerprint(legacyFiles) {
  const hash = crypto.createHash("sha256");

  for (const file of legacyFiles) {
    hash.update(file.name);
    hash.update(":");
    hash.update(file.content || "");
    hash.update("|");
  }

  return hash.digest("hex");
}

function normalizeLocalState(data) {
  const defaults = createDefaultLocalState();
  const payload = data && typeof data === "object" ? data : {};

  return {
    ...defaults,
    ...payload,
    providerConnections: Array.isArray(payload.providerConnections) ? payload.providerConnections : defaults.providerConnections,
    providerNodes: Array.isArray(payload.providerNodes) ? payload.providerNodes : defaults.providerNodes,
    proxyPools: Array.isArray(payload.proxyPools) ? payload.proxyPools : defaults.proxyPools,
    modelAliases: payload.modelAliases && typeof payload.modelAliases === "object" ? payload.modelAliases : defaults.modelAliases,
    mitmAlias: payload.mitmAlias && typeof payload.mitmAlias === "object" ? payload.mitmAlias : defaults.mitmAlias,
    combos: Array.isArray(payload.combos) ? payload.combos : defaults.combos,
    apiKeys: Array.isArray(payload.apiKeys) ? payload.apiKeys : defaults.apiKeys,
    settings: {
      ...defaults.settings,
      ...(payload.settings && typeof payload.settings === "object" ? payload.settings : {}),
    },
    pricing: payload.pricing && typeof payload.pricing === "object" ? payload.pricing : defaults.pricing,
  };
}

function normalizeUsageState(data) {
  const defaults = createDefaultUsageState();
  const payload = data && typeof data === "object" ? data : {};
  return {
    history: Array.isArray(payload.history) ? payload.history : defaults.history,
    totalRequestsLifetime: Number.isFinite(Number(payload.totalRequestsLifetime))
      ? Number(payload.totalRequestsLifetime)
      : (Array.isArray(payload.history) ? payload.history.length : defaults.totalRequestsLifetime),
  };
}

function normalizeRequestDetailsState(data) {
  const defaults = createDefaultRequestDetailsState();
  const payload = data && typeof data === "object" ? data : {};
  return {
    records: Array.isArray(payload.records) ? payload.records : defaults.records,
  };
}

export async function runLegacyMigration({ force = false } = {}) {
  const legacyFiles = [
    { name: "db.json", content: readTextFile(getLegacyFilePath("db.json")) },
    { name: "usage.json", content: readTextFile(getLegacyFilePath("usage.json")) },
    { name: "request-details.json", content: readTextFile(getLegacyFilePath("request-details.json")) },
    { name: "log.txt", content: readTextFile(getLegacyFilePath("log.txt")) },
  ].filter((file) => file.content);

  if (legacyFiles.length === 0) {
    return { status: "skipped", reason: "no-legacy-data" };
  }

  const fingerprint = createLegacyFingerprint(legacyFiles);
  const schemaRecord = await getSchemaVersionRecord();
  const storeEmpty = await isCanonicalStoreEmpty();

  if (!force && schemaRecord?.importedLegacyHash === fingerprint) {
    return { status: "skipped", reason: "already-imported", fingerprint };
  }

  if (!force && !storeEmpty) {
    return { status: "skipped", reason: "canonical-store-not-empty", fingerprint };
  }

  const localState = normalizeLocalState(readJsonFile(getLegacyFilePath("db.json"), null));
  const usageState = normalizeUsageState(readJsonFile(getLegacyFilePath("usage.json"), null));
  const requestDetailsState = normalizeRequestDetailsState(
    readJsonFile(getLegacyFilePath("request-details.json"), null),
  );
  const requestLogRecords = parseLegacyLogLines(readTextFile(getLegacyFilePath("log.txt")));
  const importedAt = new Date().toISOString();

  await saveGatewayStateSnapshot(localState, {
    importedLegacyHash: fingerprint,
    importedLegacyAt: importedAt,
    usageLifetimeCount: usageState.totalRequestsLifetime,
  });
  await saveUsageStateSnapshot(usageState);
  await saveRequestDetailsStateSnapshot(requestDetailsState);
  await replaceRequestLogs(requestLogRecords);

  return {
    status: "imported",
    fingerprint,
    importedAt,
    counts: {
      providerConnections: localState.providerConnections.length,
      apiKeys: localState.apiKeys.length,
      usageHistory: usageState.history.length,
      requestLogs: requestLogRecords.length,
      requestDetails: requestDetailsState.records.length,
    },
  };
}

export async function ensureStorageReady() {
  if (!globalThis[AUTO_IMPORT_KEY]) {
    globalThis[AUTO_IMPORT_KEY] = runLegacyMigration().catch((error) => {
      delete globalThis[AUTO_IMPORT_KEY];
      throw error;
    });
  }

  return globalThis[AUTO_IMPORT_KEY];
}

export function resetStorageBootstrapForTests() {
  delete globalThis[AUTO_IMPORT_KEY];
}

export async function getStorageMigrationStatus() {
  await ensureStorageReady();
  const schemaRecord = await getSchemaVersionRecord();
  const db = getStorageDb();
  const [
    webBridgeSessionsCount,
    providerConnectionsCount,
    providerNodesCount,
    proxyPoolsCount,
    combosCount,
    apiKeysCount,
    usageHistoryCount,
    requestDetailsCount,
    diagnosticsCount,
  ] = [
    db.select({ count: sql`count(*)` }).from(webBridgeSessions).get(),
    db.select({ count: sql`count(*)` }).from(providerConnections).get(),
    db.select({ count: sql`count(*)` }).from(providerNodes).get(),
    db.select({ count: sql`count(*)` }).from(proxyPools).get(),
    db.select({ count: sql`count(*)` }).from(combos).get(),
    db.select({ count: sql`count(*)` }).from(apiKeys).get(),
    db.select({ count: sql`count(*)` }).from(usageHistory).get(),
    db.select({ count: sql`count(*)` }).from(requestDetails).get(),
    db.select({ count: sql`count(*)` }).from(diagnosticResults).get(),
  ];

  return {
    schemaVersion: schemaRecord?.version || null,
    importedLegacyAt: schemaRecord?.importedLegacyAt || null,
    importedLegacyHash: schemaRecord?.importedLegacyHash || null,
    counts: {
      webBridgeSessions: Number(webBridgeSessionsCount?.count || 0),
      providerConnections: Number(providerConnectionsCount?.count || 0),
      providerNodes: Number(providerNodesCount?.count || 0),
      proxyPools: Number(proxyPoolsCount?.count || 0),
      combos: Number(combosCount?.count || 0),
      apiKeys: Number(apiKeysCount?.count || 0),
      usageHistory: Number(usageHistoryCount?.count || 0),
      usageLifetime: Number(schemaRecord?.usageLifetimeCount || usageHistoryCount?.count || 0),
      requestDetails: Number(requestDetailsCount?.count || 0),
      diagnostics: Number(diagnosticsCount?.count || 0),
    },
  };
}
