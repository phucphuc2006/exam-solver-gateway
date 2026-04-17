// ── Usage DB — Stats: saveRequestUsage, getUsageHistory, cost, aggregation, chart ──

import {
  isCloud,
  statsEmitter,
  pendingRequests,
  lastErrorProvider,
  getPromptTokens,
  getCompletionTokens,
  getReasoningTokens,
  getCachedTokens,
  getCacheCreationTokens,
  clonePendingRequests,
  buildRecentRequests,
  getUsageDb,
} from "./core.js";

// ── Cost Calculation ──

/**
 * Calculate cost for a usage entry
 * @param {string} provider - Provider ID
 * @param {string} model - Model ID
 * @param {object} tokens - Token counts
 * @returns {number} Cost in dollars
 */
async function calculateCost(provider, model, tokens) {
  if (!tokens || !provider || !model) return 0;

  try {
    const { getPricingForModel } = await import("@/lib/localDb/index.js");
    const pricing = await getPricingForModel(provider, model);

    if (!pricing) return 0;

    let cost = 0;

    // Input tokens (non-cached)
    const inputTokens = getPromptTokens(tokens);
    const cachedTokens = getCachedTokens(tokens);
    const nonCachedInput = Math.max(0, inputTokens - cachedTokens);

    cost += (nonCachedInput * (pricing.input / 1000000));

    // Cached tokens
    if (cachedTokens > 0) {
      const cachedRate = pricing.cached || pricing.input; // Fallback to input rate
      cost += (cachedTokens * (cachedRate / 1000000));
    }

    // Output tokens
    const outputTokens = getCompletionTokens(tokens);
    cost += (outputTokens * (pricing.output / 1000000));

    // Reasoning tokens
    const reasoningTokens = getReasoningTokens(tokens);
    if (reasoningTokens > 0) {
      const reasoningRate = pricing.reasoning || pricing.output; // Fallback to output rate
      cost += (reasoningTokens * (reasoningRate / 1000000));
    }

    // Cache creation tokens
    const cacheCreationTokens = getCacheCreationTokens(tokens);
    if (cacheCreationTokens > 0) {
      const cacheCreationRate = pricing.cache_creation || pricing.input; // Fallback to input rate
      cost += (cacheCreationTokens * (cacheCreationRate / 1000000));
    }

    return cost;
  } catch (error) {
    console.error("Error calculating cost:", error);
    return 0;
  }
}

// ── Save & History ──

/**
 * Save request usage
 * @param {object} entry - Usage entry { provider, model, tokens: { prompt_tokens, completion_tokens, ... }, connectionId?, apiKey? }
 */
export async function saveRequestUsage(entry) {
  if (isCloud) return; // Skip saving in Workers

  try {
    const db = await getUsageDb();

    // Add timestamp if not present
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    // Ensure history array exists
    if (!Array.isArray(db.data.history)) {
      db.data.history = [];
    }
    if (typeof db.data.totalRequestsLifetime !== "number") {
      db.data.totalRequestsLifetime = db.data.history.length;
    }

    const entryCost = await calculateCost(entry.provider, entry.model, entry.tokens);
    entry.cost = entryCost;
    db.data.history.push(entry);
    db.data.totalRequestsLifetime += 1;

    // Cap history to prevent unbounded memory/disk growth
    const MAX_HISTORY = 10000;
    if (db.data.history.length > MAX_HISTORY) {
      db.data.history.splice(0, db.data.history.length - MAX_HISTORY);
    }

    await db.write();
    try {
      const { deleteCachedValue } = await import("@/lib/serverCache");
      deleteCachedValue("dashboard:overview-bootstrap");
    } catch {}
    statsEmitter.emit("update");
  } catch (error) {
    console.error("Failed to save usage stats:", error);
  }
}

/**
 * Get usage history
 * @param {object} filter - Filter criteria
 */
export async function getUsageHistory(filter = {}) {
  const db = await getUsageDb();
  let history = db.data.history || [];

  // Apply filters
  if (filter.provider) {
    history = history.filter(h => h.provider === filter.provider);
  }

  if (filter.model) {
    history = history.filter(h => h.model === filter.model);
  }

  if (filter.startDate) {
    const start = new Date(filter.startDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() >= start);
  }

  if (filter.endDate) {
    const end = new Date(filter.endDate).getTime();
    history = history.filter(h => new Date(h.timestamp).getTime() <= end);
  }

  return history;
}

// ── Aggregated Stats ──

const PERIOD_MS = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, "60d": 5184000000 };

/**
 * Get aggregated usage stats
 * @param {"24h"|"7d"|"30d"|"60d"|"all"} period - Time period to filter
 */
export async function getUsageStats(period = "all") {
  const db = await getUsageDb();
  let history = db.data.history || [];

  // Filter history by period
  if (period && PERIOD_MS[period]) {
    const cutoff = Date.now() - PERIOD_MS[period];
    history = history.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  }

  // Import localDb to get provider connection names and API keys
  const { getProviderConnections, getApiKeys, getProviderNodes } = await import("@/lib/localDb/index.js");

  // Fetch all provider connections to get account names
  let allConnections = [];
  try {
    allConnections = await getProviderConnections();
  } catch (error) {
    console.warn("Could not fetch provider connections for usage stats:", error.message);
  }

  // Create a map from connectionId to account name
  const connectionMap = {};
  for (const conn of allConnections) {
    connectionMap[conn.id] = conn.name || conn.email || conn.id;
  }

  // Build map from compatible provider ID → friendly name (from providerNodes)
  const providerNodeNameMap = {};
  try {
    const nodes = await getProviderNodes();
    for (const node of nodes) {
      if (node.id && node.name) providerNodeNameMap[node.id] = node.name;
    }
  } catch {}

  // Fetch all API keys to get key names
  let allApiKeys = [];
  try {
    allApiKeys = await getApiKeys();
  } catch (error) {
    console.warn("Could not fetch API keys for usage stats:", error.message);
  }

  // Create a map from API key to key info
  const apiKeyMap = {};
  for (const key of allApiKeys) {
    apiKeyMap[key.key] = {
      name: key.name,
      id: key.id,
      createdAt: key.createdAt
    };
  }

  // 20 most recent requests from history (always in sync with SSE emit)
  const recentRequests = buildRecentRequests(history);

  const lifetimeTotalRequests = typeof db.data.totalRequestsLifetime === "number"
    ? db.data.totalRequestsLifetime
    : history.length;

  const stats = {
    totalRequests: lifetimeTotalRequests,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalReasoningTokens: 0,
    totalCost: 0,
    byProvider: {},
    byModel: {},
    byAccount: {},
    byApiKey: {},
    byEndpoint: {},
    last10Minutes: [],
    pending: clonePendingRequests(),
    activeRequests: [],
    recentRequests,
    errorProvider: (Date.now() - lastErrorProvider.ts < 10000) ? lastErrorProvider.provider : "",
  };

  // Build active requests list from pending counts
  for (const [connectionId, models] of Object.entries(pendingRequests.byAccount)) {
    for (const [modelKey, count] of Object.entries(models)) {
      if (count > 0) {
        const accountName = connectionMap[connectionId] || `Account ${connectionId.slice(0, 8)}...`;
        const match = modelKey.match(/^(.*) \((.*)\)$/);
        const modelName = match ? match[1] : modelKey;
        const providerName = match ? match[2] : "unknown";

        stats.activeRequests.push({
          model: modelName,
          provider: providerName,
          account: accountName,
          count
        });
      }
    }
  }

  // Initialize 10-minute buckets using stable minute boundaries
  const now = new Date();
  const currentMinuteStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const tenMinutesAgo = new Date(currentMinuteStart.getTime() - 9 * 60 * 1000);

  const bucketMap = {};
  for (let i = 0; i < 10; i++) {
    const bucketTime = new Date(currentMinuteStart.getTime() - (9 - i) * 60 * 1000);
    const bucketKey = bucketTime.getTime();
    bucketMap[bucketKey] = {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cost: 0
    };
    stats.last10Minutes.push(bucketMap[bucketKey]);
  }

  for (const entry of history) {
    const promptTokens = getPromptTokens(entry.tokens);
    const completionTokens = getCompletionTokens(entry.tokens);
    const reasoningTokens = getReasoningTokens(entry.tokens);
    const entryTime = new Date(entry.timestamp);

    // Use pre-stored cost (saved at request time), avoid recalculating
    const entryCost = entry.cost || 0;

    stats.totalPromptTokens += promptTokens;
    stats.totalCompletionTokens += completionTokens;
    stats.totalReasoningTokens += reasoningTokens;
    stats.totalCost += entryCost;

    // Last 10 minutes aggregation - floor entry time to its minute
    if (entryTime >= tenMinutesAgo && entryTime <= now) {
      const entryMinuteStart = Math.floor(entryTime.getTime() / 60000) * 60000;
      if (bucketMap[entryMinuteStart]) {
        bucketMap[entryMinuteStart].requests++;
        bucketMap[entryMinuteStart].promptTokens += promptTokens;
        bucketMap[entryMinuteStart].completionTokens += completionTokens;
        bucketMap[entryMinuteStart].reasoningTokens += reasoningTokens;
        bucketMap[entryMinuteStart].cost += entryCost;
      }
    }

    // By Provider
    if (!stats.byProvider[entry.provider]) {
      stats.byProvider[entry.provider] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cost: 0
      };
    }
    stats.byProvider[entry.provider].requests++;
    stats.byProvider[entry.provider].promptTokens += promptTokens;
    stats.byProvider[entry.provider].completionTokens += completionTokens;
    stats.byProvider[entry.provider].reasoningTokens += reasoningTokens;
    stats.byProvider[entry.provider].cost += entryCost;

    // By Model
    const modelKey = entry.provider ? `${entry.model} (${entry.provider})` : entry.model;
    const providerDisplayName = providerNodeNameMap[entry.provider] || entry.provider;

    if (!stats.byModel[modelKey]) {
      stats.byModel[modelKey] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cost: 0,
        rawModel: entry.model,
        provider: providerDisplayName,
        lastUsed: entry.timestamp
      };
    }
    stats.byModel[modelKey].requests++;
    stats.byModel[modelKey].promptTokens += promptTokens;
    stats.byModel[modelKey].completionTokens += completionTokens;
    stats.byModel[modelKey].reasoningTokens += reasoningTokens;
    stats.byModel[modelKey].cost += entryCost;
    if (new Date(entry.timestamp) > new Date(stats.byModel[modelKey].lastUsed)) {
      stats.byModel[modelKey].lastUsed = entry.timestamp;
    }

    // By Account (model + oauth account)
    if (entry.connectionId) {
      const accountName = connectionMap[entry.connectionId] || `Account ${entry.connectionId.slice(0, 8)}...`;
      const accountKey = `${entry.model} (${entry.provider} - ${accountName})`;

      if (!stats.byAccount[accountKey]) {
        stats.byAccount[accountKey] = {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          cost: 0,
          rawModel: entry.model,
          provider: providerDisplayName,
          connectionId: entry.connectionId,
          accountName: accountName,
          lastUsed: entry.timestamp
        };
      }
      stats.byAccount[accountKey].requests++;
      stats.byAccount[accountKey].promptTokens += promptTokens;
      stats.byAccount[accountKey].completionTokens += completionTokens;
      stats.byAccount[accountKey].reasoningTokens += reasoningTokens;
      stats.byAccount[accountKey].cost += entryCost;
      if (new Date(entry.timestamp) > new Date(stats.byAccount[accountKey].lastUsed)) {
        stats.byAccount[accountKey].lastUsed = entry.timestamp;
      }
    }

    // Handle requests with API key
    if (entry.apiKey && typeof entry.apiKey === "string") {
      const keyInfo = apiKeyMap[entry.apiKey];
      const keyName = keyInfo?.name || entry.apiKey.slice(0, 8) + "...";
      const apiKeyKey = entry.apiKey;
      const apiKeyModelKey = `${apiKeyKey}|${entry.model}|${entry.provider || 'unknown'}`;

      if (!stats.byApiKey[apiKeyModelKey]) {
        stats.byApiKey[apiKeyModelKey] = {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          rawModel: entry.model,
          provider: providerDisplayName,
          apiKey: entry.apiKey,
          keyName: keyName,
          apiKeyKey: apiKeyKey,
          lastUsed: entry.timestamp
        };
      }
      const apiKeyEntry = stats.byApiKey[apiKeyModelKey];
      apiKeyEntry.requests++;
      apiKeyEntry.promptTokens += promptTokens;
      apiKeyEntry.completionTokens += completionTokens;
      apiKeyEntry.cost += entryCost;
      if (new Date(entry.timestamp) > new Date(apiKeyEntry.lastUsed)) {
        apiKeyEntry.lastUsed = entry.timestamp;
      }
    } else {
      const apiKeyKey = "local-no-key";
      const keyName = "Local (No API Key)";

      if (!stats.byApiKey[apiKeyKey]) {
        stats.byApiKey[apiKeyKey] = {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          rawModel: entry.model,
          provider: providerDisplayName,
          apiKey: null,
          keyName: keyName,
          apiKeyKey: apiKeyKey,
          lastUsed: entry.timestamp
        };
      }
      const apiKeyEntry = stats.byApiKey[apiKeyKey];
      apiKeyEntry.requests++;
      apiKeyEntry.promptTokens += promptTokens;
      apiKeyEntry.completionTokens += completionTokens;
      apiKeyEntry.cost += entryCost;
      if (new Date(entry.timestamp) > new Date(apiKeyEntry.lastUsed)) {
        apiKeyEntry.lastUsed = entry.timestamp;
      }
    }

    // By Endpoint (endpoint + model + provider combination)
    const endpoint = entry.endpoint || "Unknown";
    const endpointModelKey = `${endpoint}|${entry.model}|${entry.provider || 'unknown'}`;

    if (!stats.byEndpoint[endpointModelKey]) {
      stats.byEndpoint[endpointModelKey] = {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        endpoint: endpoint,
        rawModel: entry.model,
        provider: providerDisplayName,
        lastUsed: entry.timestamp
      };
    }
    const endpointEntry = stats.byEndpoint[endpointModelKey];
    endpointEntry.requests++;
    endpointEntry.promptTokens += promptTokens;
    endpointEntry.completionTokens += completionTokens;
    endpointEntry.cost += entryCost;
    if (new Date(entry.timestamp) > new Date(endpointEntry.lastUsed)) {
      endpointEntry.lastUsed = entry.timestamp;
    }
  }

  return stats;
}

// ── Chart Data ──

/**
 * Get time-series chart data for a given period
 * @param {"24h"|"7d"|"30d"|"60d"} period
 * @returns {Promise<Array<{label: string, tokens: number, cost: number}>>}
 */
export async function getChartData(period = "7d") {
  const db = await getUsageDb();
  const history = db.data.history || [];
  const now = Date.now();

  let bucketCount, bucketMs, labelFn;
  if (period === "24h") {
    bucketCount = 24;
    bucketMs = 3600000; // 1 hour
    labelFn = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } else if (period === "7d") {
    bucketCount = 7;
    bucketMs = 86400000;
    labelFn = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else if (period === "30d") {
    bucketCount = 30;
    bucketMs = 86400000;
    labelFn = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else {
    bucketCount = 60;
    bucketMs = 86400000;
    labelFn = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const startTime = now - bucketCount * bucketMs;
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const ts = startTime + i * bucketMs;
    return { label: labelFn(ts), tokens: 0, cost: 0, _ts: ts };
  });

  for (const entry of history) {
    const entryTime = new Date(entry.timestamp).getTime();
    if (entryTime < startTime || entryTime > now) continue;
    const idx = Math.min(Math.floor((entryTime - startTime) / bucketMs), bucketCount - 1);
    const promptTokens = getPromptTokens(entry.tokens);
    const completionTokens = getCompletionTokens(entry.tokens);
    buckets[idx].tokens += promptTokens + completionTokens;
    // Use pre-stored cost if available, else 0
    buckets[idx].cost += entry.cost || 0;
  }

  return buckets.map(({ label, tokens, cost }) => ({ label, tokens, cost }));
}
