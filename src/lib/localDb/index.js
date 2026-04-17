// ── Local DB — Re-export Index ──
// Backward compatible re-export for `import { ... } from "@/lib/localDb"`

// ── Core ──
export { getDb, safeWrite } from "./core.js";

// ── Provider Connections, Nodes, Proxy Pools ──
export {
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
  deleteProviderConnectionsByProvider,
  reorderProviderConnections,
  cleanupProviderConnections,
  getProviderNodes,
  getProviderNodeById,
  createProviderNode,
  updateProviderNode,
  deleteProviderNode,
  getProxyPools,
  getProxyPoolById,
  createProxyPool,
  updateProxyPool,
  deleteProxyPool,
} from "./providers.js";

// ── Model Aliases, MITM Alias, Combos ──
export {
  getModelAliases,
  setModelAlias,
  deleteModelAlias,
  getMitmAlias,
  setMitmAliasAll,
  getCombos,
  getComboById,
  getComboByName,
  createCombo,
  updateCombo,
  deleteCombo,
} from "./aliases.js";

// ── API Keys ──
export {
  getApiKeys,
  createApiKey,
  deleteApiKey,
  getApiKeyById,
  updateApiKey,
  validateApiKey,
} from "./apiKeys.js";

// ── Web Bridge Sessions ──
export {
  getChatgptWebSession,
  upsertChatgptWebSession,
  deleteChatgptWebSession,
  getGeminiWebSession,
  upsertGeminiWebSession,
  deleteGeminiWebSession,
  getGrokWebSession,
  upsertGrokWebSession,
  deleteGrokWebSession,
} from "./webBridgeSessions.js";

// ── Settings, Export/Import, Cloud ──
export {
  getSettings,
  updateSettings,
  exportDb,
  importDb,
  isCloudEnabled,
  getCloudUrl,
} from "./settings.js";

// ── Pricing ──
export {
  getPricing,
  getPricingForModel,
  updatePricing,
  resetPricing,
  resetAllPricing,
} from "./pricing.js";
