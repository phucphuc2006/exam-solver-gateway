import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const schemaVersion = sqliteTable("schema_version", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
  importedLegacyHash: text("imported_legacy_hash"),
  importedLegacyAt: text("imported_legacy_at"),
  usageLifetimeCount: integer("usage_lifetime_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  dataJson: text("data_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const webBridgeSessions = sqliteTable("web_bridge_sessions", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  status: text("status").notNull(),
  lastValidatedAt: text("last_validated_at"),
  lastError: text("last_error"),
  lastErrorAt: text("last_error_at"),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const providerConnections = sqliteTable("provider_connections", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  authType: text("auth_type"),
  name: text("name"),
  priority: integer("priority"),
  weight: real("weight"),
  isActive: integer("is_active").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const providerNodes = sqliteTable("provider_nodes", {
  id: text("id").primaryKey(),
  type: text("type"),
  name: text("name"),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const proxyPools = sqliteTable("proxy_pools", {
  id: text("id").primaryKey(),
  name: text("name"),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const modelAliases = sqliteTable("model_aliases", {
  alias: text("alias").primaryKey(),
  model: text("model").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mitmAliases = sqliteTable("mitm_aliases", {
  toolName: text("tool_name").primaryKey(),
  mappingsJson: text("mappings_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const combos = sqliteTable("combos", {
  id: text("id").primaryKey(),
  name: text("name"),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name"),
  keyValue: text("key_value"),
  machineId: text("machine_id"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at"),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const pricingEntries = sqliteTable("pricing_entries", {
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedAt: text("updated_at").notNull(),
  dataJson: text("data_json").notNull(),
});

export const usageHistory = sqliteTable("usage_history", {
  id: text("id").primaryKey(),
  provider: text("provider"),
  model: text("model"),
  connectionId: text("connection_id"),
  apiKey: text("api_key"),
  endpoint: text("endpoint"),
  status: text("status"),
  timestamp: text("timestamp").notNull(),
  cost: real("cost").notNull().default(0),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  entryJson: text("entry_json").notNull(),
});

export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  model: text("model"),
  provider: text("provider"),
  connectionId: text("connection_id"),
  accountName: text("account_name"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  status: text("status"),
  rawLine: text("raw_line").notNull(),
});

export const requestDetails = sqliteTable("request_details", {
  id: text("id").primaryKey(),
  provider: text("provider"),
  model: text("model"),
  connectionId: text("connection_id"),
  timestamp: text("timestamp").notNull(),
  status: text("status"),
  detailJson: text("detail_json").notNull(),
});

export const diagnosticResults = sqliteTable("diagnostic_results", {
  id: text("id").primaryKey(),
  provider: text("provider"),
  connectionId: text("connection_id"),
  model: text("model"),
  modality: text("modality").notNull(),
  source: text("source").notNull(),
  supported: integer("supported").notNull().default(0),
  lastTestedAt: text("last_tested_at").notNull(),
  latencyMs: integer("latency_ms"),
  summary: text("summary"),
  requestJson: text("request_json"),
  responseJson: text("response_json"),
  metadataJson: text("metadata_json"),
});
