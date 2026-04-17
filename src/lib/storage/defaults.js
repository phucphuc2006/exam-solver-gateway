export const SQLITE_SCHEMA_VERSION = 2;

export function createDefaultLocalState() {
  return {
    schemaVersion: SQLITE_SCHEMA_VERSION,
    webBridgeSessions: [],
    providerConnections: [],
    providerNodes: [],
    proxyPools: [],
    modelAliases: {},
    mitmAlias: {},
    combos: [],
    apiKeys: [],
    settings: {
      cloudEnabled: false,
      tunnelEnabled: false,
      tunnelUrl: "",
      stickyRoundRobinLimit: 3,
      providerStrategies: {},
      comboStrategy: "fallback",
      comboStrategies: {},
      fallbackStrategy: "fill-first",
      requireLogin: true,
      bootstrapCompletedAt: null,
      passwordUpdatedAt: null,
      observabilityEnabled: true,
      observabilityMaxRecords: 1000,
      observabilityBatchSize: 20,
      observabilityFlushIntervalMs: 5000,
      observabilityMaxJsonSize: 1024,
      outboundProxyEnabled: false,
      outboundProxyUrl: "",
      outboundNoProxy: "",
    },
    pricing: {},
  };
}

export function createDefaultUsageState() {
  return {
    history: [],
    totalRequestsLifetime: 0,
  };
}

export function createDefaultRequestDetailsState() {
  return {
    records: [],
  };
}
