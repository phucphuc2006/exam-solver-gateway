// ── Local DB — Settings, Export/Import, Cloud ──

import { getDb, safeWrite, cloneDefaultData, ensureDbShape } from "./core.js";

// ============ Settings ============

/**
 * Get settings
 */
export async function getSettings() {
  const db = await getDb();
  return db.data.settings || { cloudEnabled: false };
}

/**
 * Update settings
 */
export async function updateSettings(updates) {
  const db = await getDb();
  db.data.settings = {
    ...db.data.settings,
    ...updates
  };
  await safeWrite(db);
  return db.data.settings;
}

// ============ Export / Import ============

/**
 * Export full database payload
 */
export async function exportDb() {
  const db = await getDb();
  return db.data || cloneDefaultData();
}

/**
 * Import full database payload
 */
export async function importDb(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid database payload");
  }

  const nextData = {
    ...cloneDefaultData(),
    ...payload,
    settings: {
      ...cloneDefaultData().settings,
      ...(payload.settings && typeof payload.settings === "object" && !Array.isArray(payload.settings)
        ? payload.settings
        : {}),
    },
  };

  const { data: normalized } = ensureDbShape(nextData);
  const db = await getDb();
  db.data = normalized;
  await safeWrite(db);

  return db.data;
}

// ============ Cloud ============

/**
 * Check if cloud is enabled
 */
export async function isCloudEnabled() {
  const settings = await getSettings();
  return settings.cloudEnabled === true;
}

/**
 * Get cloud URL (UI config > env > default)
 */
export async function getCloudUrl() {
  const settings = await getSettings();
  return settings.cloudUrl
    || process.env.CLOUD_URL
    || process.env.NEXT_PUBLIC_CLOUD_URL
    || "";
}
