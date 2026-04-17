import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { getRuntimeDataDir } from "@/lib/serverRuntimeConfig";

const require = createRequire(import.meta.url);
const BetterSqlite3 = require("better-sqlite3");

const SQLITE_FILE_NAME = "nexusai-gateway.sqlite";

function ensureDataDir() {
  const dataDir = path.resolve(getRuntimeDataDir());
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function ensureSchema(connection) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL,
      imported_legacy_hash TEXT,
      imported_legacy_at TEXT,
      usage_lifetime_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS web_bridge_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      last_validated_at TEXT,
      last_error TEXT,
      last_error_at TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      auth_type TEXT,
      name TEXT,
      priority INTEGER,
      weight REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_nodes (
      id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proxy_pools (
      id TEXT PRIMARY KEY,
      name TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_aliases (
      alias TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mitm_aliases (
      tool_name TEXT PRIMARY KEY,
      mappings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS combos (
      id TEXT PRIMARY KEY,
      name TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT,
      key_value TEXT,
      machine_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_entries (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      PRIMARY KEY (provider, model)
    );

    CREATE TABLE IF NOT EXISTS usage_history (
      id TEXT PRIMARY KEY,
      provider TEXT,
      model TEXT,
      connection_id TEXT,
      api_key TEXT,
      endpoint TEXT,
      status TEXT,
      timestamp TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      entry_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      model TEXT,
      provider TEXT,
      connection_id TEXT,
      account_name TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      status TEXT,
      raw_line TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS request_details (
      id TEXT PRIMARY KEY,
      provider TEXT,
      model TEXT,
      connection_id TEXT,
      timestamp TEXT NOT NULL,
      status TEXT,
      detail_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnostic_results (
      id TEXT PRIMARY KEY,
      provider TEXT,
      connection_id TEXT,
      model TEXT,
      modality TEXT NOT NULL,
      source TEXT NOT NULL,
      supported INTEGER NOT NULL DEFAULT 0,
      last_tested_at TEXT NOT NULL,
      latency_ms INTEGER,
      summary TEXT,
      request_json TEXT,
      response_json TEXT,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_web_bridge_sessions_provider ON web_bridge_sessions(provider);
    CREATE INDEX IF NOT EXISTS idx_provider_connections_provider ON provider_connections(provider);
    CREATE INDEX IF NOT EXISTS idx_usage_history_timestamp ON usage_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_history_provider_model ON usage_history(provider, model);
    CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON request_details(timestamp);
    CREATE INDEX IF NOT EXISTS idx_diagnostic_results_lookup ON diagnostic_results(connection_id, model, modality, source);
  `);

  const columns = connection.prepare("PRAGMA table_info(schema_version)").all();
  if (!columns.some((column) => column.name === "usage_lifetime_count")) {
    connection.exec("ALTER TABLE schema_version ADD COLUMN usage_lifetime_count INTEGER NOT NULL DEFAULT 0");
  }
}

function createStorageState() {
  const dataDir = ensureDataDir();
  const filePath = path.join(dataDir, SQLITE_FILE_NAME);
  const connection = new BetterSqlite3(filePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("synchronous = NORMAL");
  ensureSchema(connection);

  return {
    filePath,
    connection,
    db: drizzle(connection, { schema }),
  };
}

function getStorageState() {
  if (!globalThis.__nexusSqliteStorage) {
    globalThis.__nexusSqliteStorage = createStorageState();
  }

  return globalThis.__nexusSqliteStorage;
}

export function getStorageDb() {
  return getStorageState().db;
}

export function getStorageConnection() {
  return getStorageState().connection;
}

export function getStorageFilePath() {
  return getStorageState().filePath;
}

export function withStorageTransaction(callback) {
  const { connection, db } = getStorageState();
  const transaction = connection.transaction(() => callback(db));
  return transaction();
}

export function resetStorageForTests() {
  const state = globalThis.__nexusSqliteStorage;
  if (!state) return;

  try {
    state.connection.close();
  } catch {
  }

  delete globalThis.__nexusSqliteStorage;
}
