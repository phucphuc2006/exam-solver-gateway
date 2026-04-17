import { eq, sql } from "drizzle-orm";
import {
  apiKeys,
  combos,
  diagnosticResults,
  mitmAliases,
  modelAliases,
  pricingEntries,
  providerConnections,
  providerNodes,
  proxyPools,
  requestDetails,
  requestLogs,
  schemaVersion,
  settings,
  usageHistory,
  webBridgeSessions,
} from "./schema";
import { getStorageDb, withStorageTransaction } from "./client";
import { parseJson, toJson, toIsoTimestamp, toNullableNumber } from "./repositoryHelpers";
import { SQLITE_SCHEMA_VERSION, createDefaultLocalState } from "@/lib/storage/defaults";

export function getCurrentSchemaRecordSync(db = getStorageDb()) {
  return db.select().from(schemaVersion).where(eq(schemaVersion.id, 1)).get() || null;
}

export function upsertSchemaRecord(tx, overrides = {}) {
  const current = getCurrentSchemaRecordSync(tx);
  const next = {
    id: 1,
    version: SQLITE_SCHEMA_VERSION,
    importedLegacyHash: overrides.importedLegacyHash ?? current?.importedLegacyHash ?? null,
    importedLegacyAt: overrides.importedLegacyAt ?? current?.importedLegacyAt ?? null,
    usageLifetimeCount: overrides.usageLifetimeCount ?? current?.usageLifetimeCount ?? 0,
    updatedAt: new Date().toISOString(),
  };

  tx.insert(schemaVersion)
    .values(next)
    .onConflictDoUpdate({
      target: schemaVersion.id,
      set: {
        version: next.version,
        importedLegacyHash: next.importedLegacyHash,
        importedLegacyAt: next.importedLegacyAt,
        usageLifetimeCount: next.usageLifetimeCount,
        updatedAt: next.updatedAt,
      },
    })
    .run();

  return next;
}

export function clearTable(tx, table) {
  tx.delete(table).run();
}

function buildPricingObject(rows) {
  return rows.reduce((accumulator, row) => {
    if (!accumulator[row.provider]) {
      accumulator[row.provider] = {};
    }
    accumulator[row.provider][row.model] = parseJson(row.dataJson, {});
    return accumulator;
  }, {});
}

export async function getSchemaVersionRecord() {
  return getCurrentSchemaRecordSync();
}

export async function isCanonicalStoreEmpty() {
  const db = getStorageDb();
  const counts = [
    db.select({ count: sql`count(*)` }).from(webBridgeSessions).get(),
    db.select({ count: sql`count(*)` }).from(providerConnections).get(),
    db.select({ count: sql`count(*)` }).from(providerNodes).get(),
    db.select({ count: sql`count(*)` }).from(proxyPools).get(),
    db.select({ count: sql`count(*)` }).from(combos).get(),
    db.select({ count: sql`count(*)` }).from(apiKeys).get(),
    db.select({ count: sql`count(*)` }).from(usageHistory).get(),
    db.select({ count: sql`count(*)` }).from(requestLogs).get(),
    db.select({ count: sql`count(*)` }).from(requestDetails).get(),
    db.select({ count: sql`count(*)` }).from(diagnosticResults).get(),
  ];

  return counts.every((entry) => Number(entry?.count || 0) === 0);
}

export async function getGatewayStateSnapshot() {
  const defaults = createDefaultLocalState();
  const db = getStorageDb();
  const schemaRecord = getCurrentSchemaRecordSync(db);
  const settingsRow = db.select().from(settings).where(eq(settings.id, 1)).get();
  const webBridgeSessionRows = db.select().from(webBridgeSessions).all();
  const connections = db.select().from(providerConnections).all();
  const nodes = db.select().from(providerNodes).all();
  const pools = db.select().from(proxyPools).all();
  const aliasRows = db.select().from(modelAliases).all();
  const mitmRows = db.select().from(mitmAliases).all();
  const comboRows = db.select().from(combos).all();
  const apiKeyRows = db.select().from(apiKeys).all();
  const pricingRows = db.select().from(pricingEntries).all();

  return {
    schemaVersion: schemaRecord?.version || defaults.schemaVersion,
    webBridgeSessions: webBridgeSessionRows.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    providerConnections: connections.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    providerNodes: nodes.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    proxyPools: pools.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    modelAliases: Object.fromEntries(aliasRows.map((row) => [row.alias, row.model])),
    mitmAlias: Object.fromEntries(mitmRows.map((row) => [row.toolName, parseJson(row.mappingsJson, {})])),
    combos: comboRows.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    apiKeys: apiKeyRows.map((row) => parseJson(row.dataJson, null)).filter(Boolean),
    settings: { ...defaults.settings, ...parseJson(settingsRow?.dataJson, {}) },
    pricing: buildPricingObject(pricingRows),
  };
}

export async function saveGatewayStateSnapshot(snapshot, schemaOverrides = {}) {
  const defaults = createDefaultLocalState();
  const next = {
    ...defaults,
    ...snapshot,
    settings: {
      ...defaults.settings,
      ...(snapshot?.settings || {}),
    },
    pricing: snapshot?.pricing && typeof snapshot.pricing === "object" ? snapshot.pricing : {},
  };

  withStorageTransaction((tx) => {
    upsertSchemaRecord(tx, schemaOverrides);

    tx.insert(settings)
      .values({
        id: 1,
        dataJson: toJson(next.settings),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          dataJson: toJson(next.settings),
          updatedAt: new Date().toISOString(),
        },
      })
      .run();

    clearTable(tx, webBridgeSessions);
    for (const session of next.webBridgeSessions || []) {
      tx.insert(webBridgeSessions)
        .values({
          id: session.id,
          provider: session.provider,
          status: session.status || "unknown",
          lastValidatedAt: session.lastValidatedAt || null,
          lastError: session.lastError || null,
          lastErrorAt: session.lastErrorAt || null,
          updatedAt: toIsoTimestamp(session.updatedAt),
          dataJson: toJson(session),
        })
        .run();
    }

    clearTable(tx, providerConnections);
    for (const connection of next.providerConnections || []) {
      tx.insert(providerConnections)
        .values({
          id: connection.id,
          provider: connection.provider,
          authType: connection.authType || null,
          name: connection.name || null,
          priority: connection.priority ?? null,
          weight: toNullableNumber(connection.weight),
          isActive: connection.isActive === false ? 0 : 1,
          updatedAt: toIsoTimestamp(connection.updatedAt),
          dataJson: toJson(connection),
        })
        .run();
    }

    clearTable(tx, providerNodes);
    for (const node of next.providerNodes || []) {
      tx.insert(providerNodes)
        .values({
          id: node.id,
          type: node.type || null,
          name: node.name || null,
          updatedAt: toIsoTimestamp(node.updatedAt),
          dataJson: toJson(node),
        })
        .run();
    }

    clearTable(tx, proxyPools);
    for (const pool of next.proxyPools || []) {
      tx.insert(proxyPools)
        .values({
          id: pool.id,
          name: pool.name || null,
          updatedAt: toIsoTimestamp(pool.updatedAt),
          dataJson: toJson(pool),
        })
        .run();
    }

    clearTable(tx, modelAliases);
    for (const [alias, model] of Object.entries(next.modelAliases || {})) {
      tx.insert(modelAliases)
        .values({
          alias,
          model,
          updatedAt: new Date().toISOString(),
        })
        .run();
    }

    clearTable(tx, mitmAliases);
    for (const [toolName, mappings] of Object.entries(next.mitmAlias || {})) {
      tx.insert(mitmAliases)
        .values({
          toolName,
          mappingsJson: toJson(mappings || {}),
          updatedAt: new Date().toISOString(),
        })
        .run();
    }

    clearTable(tx, combos);
    for (const combo of next.combos || []) {
      tx.insert(combos)
        .values({
          id: combo.id,
          name: combo.name || null,
          updatedAt: toIsoTimestamp(combo.updatedAt),
          dataJson: toJson(combo),
        })
        .run();
    }

    clearTable(tx, apiKeys);
    for (const apiKey of next.apiKeys || []) {
      tx.insert(apiKeys)
        .values({
          id: apiKey.id,
          name: apiKey.name || null,
          keyValue: apiKey.key || null,
          machineId: apiKey.machineId || null,
          isActive: apiKey.isActive === false ? 0 : 1,
          createdAt: apiKey.createdAt || null,
          updatedAt: toIsoTimestamp(apiKey.updatedAt || apiKey.createdAt),
          dataJson: toJson(apiKey),
        })
        .run();
    }

    clearTable(tx, pricingEntries);
    for (const [provider, models] of Object.entries(next.pricing || {})) {
      for (const [model, pricing] of Object.entries(models || {})) {
        tx.insert(pricingEntries)
          .values({
            provider,
            model,
            updatedAt: new Date().toISOString(),
            dataJson: toJson(pricing),
          })
          .run();
      }
    }
  });

  return next;
}
