import { sql } from "drizzle-orm";
import { getProviderConnections } from "@/lib/localDb";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { getDiagnosticResults, getSchemaVersionRecord } from "@/lib/storage/sqlite/repositories";
import { ensureStorageReady } from "@/lib/storage/sqlite/migrateLegacy";
import { getStorageDb } from "@/lib/storage/sqlite/client";
import { diagnosticResults } from "@/lib/storage/sqlite/schema";
import { getTunnelStatus } from "@/lib/tunnel/tunnelManager";
import { getUsageStats } from "@/lib/usageDb";
import { getVersionStatus } from "@/lib/versionStatus";

const OVERVIEW_CACHE_TTL_MS = 15 * 1000;
const SIDEBAR_CACHE_TTL_MS = 30 * 1000;

function buildLatestFlags(results) {
  const latestFlags = [];
  const seen = new Set();

  for (const result of results) {
    const capabilityFlag = result.metadata?.capabilityFlag || result.modality;
    const key = `${result.connectionId}:${result.model}:${capabilityFlag}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    latestFlags.push({
      supported: result.supported,
    });
  }

  return latestFlags;
}

async function getStorageOverviewStatus() {
  await ensureStorageReady();

  const db = getStorageDb();
  const [schemaRecord, diagnosticsCountRecord] = await Promise.all([
    getSchemaVersionRecord(),
    db.select({ count: sql`count(*)` }).from(diagnosticResults).get(),
  ]);

  return {
    schemaVersion: schemaRecord?.version || null,
    importedLegacyAt: schemaRecord?.importedLegacyAt || null,
    counts: {
      diagnostics: Number(diagnosticsCountRecord?.count || 0),
    },
  };
}

function createSidebarPayload(versionInfo) {
  return {
    enableTranslator: process.env.ENABLE_TRANSLATOR === "true",
    updateInfo: versionInfo?.hasUpdate ? versionInfo : null,
  };
}

export async function getSidebarBootstrapData() {
  return getOrSetCachedValue("dashboard:sidebar-bootstrap", SIDEBAR_CACHE_TTL_MS, async () => {
    const versionInfo = await getVersionStatus();
    return createSidebarPayload(versionInfo);
  });
}

export async function getDashboardOverviewData() {
  return getOrSetCachedValue("dashboard:overview-bootstrap", OVERVIEW_CACHE_TTL_MS, async () => {
    const [usageStats, providers, diagnostics, storageStatus, tunnelStatus, versionInfo] = await Promise.all([
      getUsageStats("7d"),
      getProviderConnections(),
      getDiagnosticResults(),
      getStorageOverviewStatus(),
      getTunnelStatus(),
      getVersionStatus(),
    ]);

    const latestFlags = buildLatestFlags(diagnostics);

    return {
      usageStats,
      summary: {
        activeProviderCount: providers.filter((item) => item.isActive !== false).length,
        supportedFlagsCount: latestFlags.filter((item) => item.supported).length,
      },
      storageStatus,
      tunnelStatus: {
        enabled: tunnelStatus?.enabled === true,
        tunnelUrl: tunnelStatus?.tunnelUrl || "",
        publicUrl: tunnelStatus?.publicUrl || "",
        running: tunnelStatus?.running === true,
      },
      versionInfo,
    };
  });
}
