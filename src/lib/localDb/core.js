// ── Local DB — Core: Singleton, shape validation, read/write ──

import { createDefaultLocalState } from "@/lib/storage/defaults";
import { ensureStorageReady } from "@/lib/storage/sqlite/migrateLegacy";
import {
  getGatewayStateSnapshot,
  saveGatewayStateSnapshot,
} from "@/lib/storage/sqlite/repositories";

const isCloud = typeof caches !== 'undefined' || typeof caches === 'object';

function cloneDefaultData() {
  return createDefaultLocalState();
}

function ensureDbShape(data) {
  const defaults = cloneDefaultData();
  const next = data && typeof data === "object" ? data : {};
  let changed = false;

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (next[key] === undefined || next[key] === null) {
      next[key] = defaultValue;
      changed = true;
      continue;
    }

    if (
      key === "settings" &&
      (typeof next.settings !== "object" || Array.isArray(next.settings))
    ) {
      next.settings = { ...defaultValue };
      changed = true;
      continue;
    }

    if (
      key === "settings" &&
      typeof next.settings === "object" &&
      !Array.isArray(next.settings)
    ) {
      for (const [settingKey, settingDefault] of Object.entries(defaultValue)) {
        if (next.settings[settingKey] === undefined) {
          // Backward-compat: if users previously saved a proxy URL,
          // default to enabled so behavior doesn't silently change.
          if (
            settingKey === "outboundProxyEnabled" &&
            typeof next.settings.outboundProxyUrl === "string" &&
            next.settings.outboundProxyUrl.trim()
          ) {
            next.settings.outboundProxyEnabled = true;
          } else {
            next.settings[settingKey] = settingDefault;
          }
          changed = true;
        }
      }
    }

    if (key === "webBridgeSessions" && !Array.isArray(next.webBridgeSessions)) {
      next.webBridgeSessions = [];
      changed = true;
    }

    // Migrate existing API keys to have isActive
    if (key === "apiKeys" && Array.isArray(next.apiKeys)) {
      for (const apiKey of next.apiKeys) {
        if (apiKey.isActive === undefined || apiKey.isActive === null) {
          apiKey.isActive = true;
          changed = true;
        }
      }
    }

    if (key === "providerConnections" && Array.isArray(next.providerConnections)) {
      for (const connection of next.providerConnections) {
        if (connection.weight === undefined || connection.weight === null) {
          connection.weight = 1;
          changed = true;
        }
        if (connection.healthErrorPenalty === undefined || connection.healthErrorPenalty === null) {
          connection.healthErrorPenalty = 0;
          changed = true;
        }
        if (connection.healthLatencyEwmaMs === undefined) {
          connection.healthLatencyEwmaMs = null;
          changed = true;
        }
        if (connection.lastSuccessAt === undefined) {
          connection.lastSuccessAt = null;
          changed = true;
        }
        if (connection.lastFailureAt === undefined) {
          connection.lastFailureAt = null;
          changed = true;
        }
      }
    }
  }

  return { data: next, changed };
}

// Singleton instance
let dbInstance = null;
let dbSyncPromise = null;
let dbLastSyncedAt = 0;
const DB_SYNC_TTL_MS = 1_000;

class SnapshotDbFacade {
  constructor({ load, save, defaults }) {
    this.data = defaults();
    this._load = load;
    this._save = save;
    this._defaults = defaults;
  }

  async read() {
    this.data = await this._load();
    return this.data;
  }

  async write() {
    this.data = await this._save(this.data || this._defaults());
    return this.data;
  }
}

/**
 * Safely read database from the canonical SQLite store.
 */
async function safeRead(db) {
  await db.read();
}

/**
 * Safely write database to the canonical SQLite store.
 */
export async function safeWrite(db) {
  await db.write();
  dbLastSyncedAt = Date.now();
}

async function syncDbInstance(force = false) {
  if (!dbInstance) {
    return null;
  }

  const now = Date.now();
  if (!force && dbInstance.data && (now - dbLastSyncedAt) < DB_SYNC_TTL_MS) {
    return dbInstance;
  }

  if (dbSyncPromise) {
    await dbSyncPromise;
    return dbInstance;
  }

  const pending = (async () => {
    await safeRead(dbInstance);

    if (!dbInstance.data) {
      dbInstance.data = cloneDefaultData();
      await safeWrite(dbInstance);
    } else {
      const { data, changed } = ensureDbShape(dbInstance.data);
      dbInstance.data = data;
      if (changed) {
        await safeWrite(dbInstance);
      }
    }

    dbLastSyncedAt = Date.now();
  })();

  dbSyncPromise = pending;

  try {
    await pending;
  } finally {
    if (dbSyncPromise === pending) {
      dbSyncPromise = null;
    }
  }

  return dbInstance;
}

/**
 * Get database instance (singleton)
 */
export async function getDb() {
  if (isCloud) {
    if (!dbInstance) {
      dbInstance = new SnapshotDbFacade({
        load: async () => cloneDefaultData(),
        save: async (data) => data,
        defaults: cloneDefaultData,
      });
      dbLastSyncedAt = Date.now();
    }
    return dbInstance;
  }

  await ensureStorageReady();

  if (!dbInstance) {
    dbInstance = new SnapshotDbFacade({
      load: getGatewayStateSnapshot,
      save: saveGatewayStateSnapshot,
      defaults: cloneDefaultData,
    });
  }

  await syncDbInstance();

  return dbInstance;
}

// Re-export for other modules
export { cloneDefaultData, ensureDbShape };
