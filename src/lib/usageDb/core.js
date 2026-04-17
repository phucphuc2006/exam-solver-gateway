// ── Usage DB — Core: Singleton, paths, global state, token helpers ──

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { EventEmitter } from "events";
import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

export const isCloud = typeof caches !== 'undefined' || typeof caches === 'object';

// Get app name from root package.json config
function getAppName() {
  if (isCloud) return "ES Gateway"; // Skip file system access in Workers

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Look for root package.json (monorepo root)
  const rootPkgPath = path.resolve(__dirname, "../../../../package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
    return pkg.config?.appName || "ES Gateway";
  } catch {
    return "ES Gateway";
  }
}

// Get user data directory based on platform
function getUserDataDir() {
  if (isCloud) return "/tmp"; // Fallback for Workers

  if (process.env.DATA_DIR) return process.env.DATA_DIR;

  try {
    const platform = process.platform;
    const homeDir = os.homedir();
    const appName = getAppName();

    if (platform === "win32") {
      return path.join(process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"), appName);
    } else {
      // macOS & Linux: ~/.{appName}
      return path.join(homeDir, `.${appName}`);
    }
  } catch (error) {
    console.error("[usageDb] Failed to get user data directory:", error.message);
    // Fallback to cwd if homedir fails
    return path.join(process.cwd(), ".es-gateway");
  }
}

// Data file path - stored in user home directory
export const DATA_DIR = getUserDataDir();
export const DB_FILE = isCloud ? null : path.join(DATA_DIR, "usage.json");
export const LOG_FILE = isCloud ? null : path.join(DATA_DIR, "log.txt");

// Ensure data directory exists
if (!isCloud && fs && typeof fs.existsSync === "function") {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`[usageDb] Created data directory: ${DATA_DIR}`);
    }
  } catch (error) {
    console.error("[usageDb] Failed to create data directory:", error.message);
  }
}

// Default data structure
export const defaultData = {
  history: [],
  totalRequestsLifetime: 0
};

// Singleton instance
let dbInstance = null;

// Use global to share pending state across Next.js route modules
if (!global._pendingRequests) {
  global._pendingRequests = { byModel: {}, byAccount: {} };
}
export const pendingRequests = global._pendingRequests;

// Track last error provider for UI edge coloring (auto-clears after 10s)
if (!global._lastErrorProvider) {
  global._lastErrorProvider = { provider: "", ts: 0 };
}
export const lastErrorProvider = global._lastErrorProvider;

// Use global to share singleton across Next.js route modules
if (!global._statsEmitter) {
  global._statsEmitter = new EventEmitter();
  global._statsEmitter.setMaxListeners(50);
}
export const statsEmitter = global._statsEmitter;

// ── Token helpers ──

export function getPromptTokens(tokens = {}) {
  return Number(
    tokens?.prompt_tokens ??
    tokens?.input_tokens ??
    0
  ) || 0;
}

export function getCompletionTokens(tokens = {}) {
  return Number(
    tokens?.completion_tokens ??
    tokens?.output_tokens ??
    0
  ) || 0;
}

export function getReasoningTokens(tokens = {}) {
  const candidates = [
    tokens?.reasoning_tokens,
    tokens?.output_tokens_details?.reasoning_tokens,
    tokens?.completion_tokens_details?.reasoning_tokens,
    tokens?.thoughtsTokenCount,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return 0;
}

export function getCachedTokens(tokens = {}) {
  return Number(
    tokens?.cached_tokens ??
    tokens?.cache_read_input_tokens ??
    tokens?.prompt_tokens_details?.cached_tokens ??
    0
  ) || 0;
}

export function getCacheCreationTokens(tokens = {}) {
  return Number(
    tokens?.cache_creation_input_tokens ??
    tokens?.prompt_tokens_details?.cache_creation_tokens ??
    0
  ) || 0;
}

// ── Pending state helpers ──

export function clonePendingRequests() {
  return {
    byModel: { ...pendingRequests.byModel },
    byAccount: Object.fromEntries(
      Object.entries(pendingRequests.byAccount).map(([connectionId, models]) => [
        connectionId,
        { ...models },
      ]),
    ),
  };
}

export function buildRecentRequests(history = [], limit = 20) {
  const seen = new Set();

  return [...history]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .map((entry) => {
      const tokens = entry.tokens || {};
      const promptTokens = getPromptTokens(tokens);
      const completionTokens = getCompletionTokens(tokens);
      const reasoningTokens = getReasoningTokens(tokens);

      return {
        timestamp: entry.timestamp,
        model: entry.model,
        provider: entry.provider || "",
        promptTokens,
        completionTokens,
        reasoningTokens,
        status: entry.status || "ok",
      };
    })
    .filter((entry) => {
      if (entry.promptTokens === 0 && entry.completionTokens === 0 && entry.reasoningTokens === 0) {
        return false;
      }

      const minute = entry.timestamp ? entry.timestamp.slice(0, 16) : "";
      const key = `${entry.model}|${entry.provider}|${entry.promptTokens}|${entry.completionTokens}|${entry.reasoningTokens}|${minute}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

// ── DB Instance ──

/**
 * Get usage database instance (singleton)
 */
export async function getUsageDb() {
  if (isCloud) {
    // Return in-memory DB for Workers
    if (!dbInstance) {
      dbInstance = new Low({ read: async () => {}, write: async () => {} }, defaultData);
      dbInstance.data = defaultData;
    }
    return dbInstance;
  }

  if (!dbInstance) {
    const adapter = new JSONFile(DB_FILE);
    dbInstance = new Low(adapter, defaultData);

    // Try to read DB with error recovery for corrupt JSON
    try {
      await dbInstance.read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn('[DB] Corrupt Usage JSON detected, resetting to defaults...');
        dbInstance.data = defaultData;
        await dbInstance.write();
      } else {
        throw error;
      }
    }

    // Initialize with default data if empty
    if (!dbInstance.data) {
      dbInstance.data = defaultData;
      await dbInstance.write();
    }
  }
  return dbInstance;
}

// Re-export fs for modules that need it
export { fs };
