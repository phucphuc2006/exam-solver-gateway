// ── Local DB — API Keys CRUD ──

import { v4 as uuidv4 } from "uuid";
import { getDb, safeWrite } from "./core.js";

/**
 * Generate short random key (8 chars)
 */
function generateShortKey() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get all API keys
 */
export async function getApiKeys() {
  const db = await getDb();
  return db.data.apiKeys || [];
}

/**
 * Create API key
 * @param {string} name - Key name
 * @param {string} machineId - MachineId (required)
 */
export async function createApiKey(name, machineId) {
  if (!machineId) {
    throw new Error("machineId is required");
  }

  const db = await getDb();
  const now = new Date().toISOString();

  // Always use new format: sk-{machineId}-{keyId}-{crc8}
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);

  const apiKey = {
    id: uuidv4(),
    name: name,
    key: result.key,
    machineId: machineId,
    isActive: true,
    createdAt: now,
  };

  db.data.apiKeys.push(apiKey);
  await safeWrite(db);

  return apiKey;
}

/**
 * Delete API key
 */
export async function deleteApiKey(id) {
  const db = await getDb();
  const index = db.data.apiKeys.findIndex(k => k.id === id);

  if (index === -1) return false;

  db.data.apiKeys.splice(index, 1);
  await safeWrite(db);

  return true;
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(id) {
  const db = await getDb();
  return db.data.apiKeys.find(k => k.id === id) || null;
}

/**
 * Update API key
 */
export async function updateApiKey(id, data) {
  const db = await getDb();
  const index = db.data.apiKeys.findIndex(k => k.id === id);
  if (index === -1) return null;
  db.data.apiKeys[index] = {
    ...db.data.apiKeys[index],
    ...data,
  };
  await safeWrite(db);
  return db.data.apiKeys[index];
}

/**
 * Validate API key
 */
export async function validateApiKey(key) {
  const db = await getDb();
  const found = db.data.apiKeys.find(k => k.key === key);
  return found && found.isActive !== false;
}
