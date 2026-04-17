// ── Local DB — Provider Connections CRUD ──

import { v4 as uuidv4 } from "uuid";
import { getDb, safeWrite } from "./core.js";

// ============ Provider Connections ============

/**
 * Get all provider connections
 */
export async function getProviderConnections(filter = {}) {
  const db = await getDb();
  let connections = db.data.providerConnections || [];

  if (filter.provider) {
    connections = connections.filter(c => c.provider === filter.provider);
  }
  if (filter.isActive !== undefined) {
    connections = connections.filter(c => c.isActive === filter.isActive);
  }

  // Sort by priority (lower = higher priority)
  connections.sort((a, b) => (a.priority || 999) - (b.priority || 999));

  return connections;
}

/**
 * Get provider connection by ID
 */
export async function getProviderConnectionById(id) {
  const db = await getDb();
  return db.data.providerConnections.find(c => c.id === id) || null;
}

/**
 * Create or update provider connection (upsert by provider + email/name)
 */
export async function createProviderConnection(data) {
  const db = await getDb();
  const now = new Date().toISOString();

  // Check for existing connection with same provider and email (for OAuth)
  // or same provider and name (for API key)
  let existingIndex = -1;
  if (data.authType === "oauth" && data.email) {
    existingIndex = db.data.providerConnections.findIndex(
      c => c.provider === data.provider && c.authType === "oauth" && c.email === data.email
    );
  } else if (data.authType === "apikey" && data.name) {
    existingIndex = db.data.providerConnections.findIndex(
      c => c.provider === data.provider && c.authType === "apikey" && c.name === data.name
    );
  }

  // If exists, update instead of create
  if (existingIndex !== -1) {
    db.data.providerConnections[existingIndex] = {
      ...db.data.providerConnections[existingIndex],
      ...data,
      updatedAt: now,
    };
    await safeWrite(db);
    return db.data.providerConnections[existingIndex];
  }

  // Generate name for OAuth if not provided
  let connectionName = data.name || null;
  if (!connectionName && data.authType === "oauth") {
    if (data.email) {
      connectionName = data.email;
    } else {
      // Count existing connections for this provider to generate index
      const existingCount = db.data.providerConnections.filter(
        c => c.provider === data.provider
      ).length;
      connectionName = `Account ${existingCount + 1}`;
    }
  }

  // Auto-increment priority if not provided
  let connectionPriority = data.priority;
  if (!connectionPriority) {
    const providerConnections = db.data.providerConnections.filter(
      c => c.provider === data.provider
    );
    const maxPriority = providerConnections.reduce((max, c) => Math.max(max, c.priority || 0), 0);
    connectionPriority = maxPriority + 1;
  }

  // Create new connection - only save fields with actual values
  const connection = {
    id: uuidv4(),
    provider: data.provider,
    authType: data.authType || "oauth",
    name: connectionName,
    priority: connectionPriority,
    weight: data.weight ?? 1,
    healthErrorPenalty: data.healthErrorPenalty ?? 0,
    healthLatencyEwmaMs: data.healthLatencyEwmaMs ?? null,
    lastSuccessAt: data.lastSuccessAt ?? null,
    lastFailureAt: data.lastFailureAt ?? null,
    isActive: data.isActive !== undefined ? data.isActive : true,
    createdAt: now,
    updatedAt: now,
  };

  // Only add optional fields if they have values
  const optionalFields = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "idToken", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn", "errorCode",
    "consecutiveUseCount"
  ];

  for (const field of optionalFields) {
    if (data[field] !== undefined && data[field] !== null) {
      connection[field] = data[field];
    }
  }

  // Only add providerSpecificData if it has content
  if (data.providerSpecificData && Object.keys(data.providerSpecificData).length > 0) {
    connection.providerSpecificData = data.providerSpecificData;
  }

  db.data.providerConnections.push(connection);
  await safeWrite(db);

  // Reorder to ensure consistency
  await reorderProviderConnections(data.provider);

  return connection;
}

/**
 * Update provider connection
 */
export async function updateProviderConnection(id, data) {
  const db = await getDb();
  const index = db.data.providerConnections.findIndex(c => c.id === id);

  if (index === -1) return null;

  const providerId = db.data.providerConnections[index].provider;

  db.data.providerConnections[index] = {
    ...db.data.providerConnections[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await safeWrite(db);

  // Reorder if priority was changed
  if (data.priority !== undefined) {
    await reorderProviderConnections(providerId);
  }

  return db.data.providerConnections[index];
}

/**
 * Delete provider connection
 */
export async function deleteProviderConnection(id) {
  const db = await getDb();
  const index = db.data.providerConnections.findIndex(c => c.id === id);

  if (index === -1) return false;

  const providerId = db.data.providerConnections[index].provider;

  db.data.providerConnections.splice(index, 1);
  await safeWrite(db);

  // Reorder to fill gaps
  await reorderProviderConnections(providerId);

  return true;
}

/**
 * Delete all provider connections by provider ID
 */
export async function deleteProviderConnectionsByProvider(providerId) {
  const db = await getDb();
  const beforeCount = db.data.providerConnections.length;
  db.data.providerConnections = db.data.providerConnections.filter(
    (connection) => connection.provider !== providerId
  );
  const deletedCount = beforeCount - db.data.providerConnections.length;
  await safeWrite(db);
  return deletedCount;
}

/**
 * Reorder provider connections to ensure unique, sequential priorities
 */
export async function reorderProviderConnections(providerId) {
  const db = await getDb();
  if (!db.data.providerConnections) return;

  const providerConnections = db.data.providerConnections
    .filter(c => c.provider === providerId)
    .sort((a, b) => {
      // Sort by priority first
      const pDiff = (a.priority || 0) - (b.priority || 0);
      if (pDiff !== 0) return pDiff;
      // Use updatedAt as tie-breaker (newer first)
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

  // Re-assign sequential priorities
  providerConnections.forEach((conn, index) => {
    conn.priority = index + 1;
  });

  await safeWrite(db);
}

/**
 * Remove null/empty fields from all provider connections to reduce db size
 */
export async function cleanupProviderConnections() {
  const db = await getDb();
  const fieldsToCheck = [
    "displayName", "email", "globalPriority", "defaultModel",
    "accessToken", "refreshToken", "expiresAt", "tokenType",
    "scope", "idToken", "projectId", "apiKey", "testStatus",
    "lastTested", "lastError", "lastErrorAt", "rateLimitedUntil", "expiresIn",
    "consecutiveUseCount"
  ];

  let cleaned = 0;
  for (const connection of db.data.providerConnections) {
    for (const field of fieldsToCheck) {
      if (connection[field] === null || connection[field] === undefined) {
        delete connection[field];
        cleaned++;
      }
    }
    // Remove empty providerSpecificData
    if (connection.providerSpecificData && Object.keys(connection.providerSpecificData).length === 0) {
      delete connection.providerSpecificData;
      cleaned++;
    }
  }

  if (cleaned > 0) {
    await safeWrite(db);
  }
  return cleaned;
}

// ============ Provider Nodes ============

/**
 * Get provider nodes
 */
export async function getProviderNodes(filter = {}) {
  const db = await getDb();
  let nodes = db.data.providerNodes || [];

  if (filter.type) {
    nodes = nodes.filter((node) => node.type === filter.type);
  }

  return nodes;
}

/**
 * Get provider node by ID
 */
export async function getProviderNodeById(id) {
  const db = await getDb();
  return db.data.providerNodes.find((node) => node.id === id) || null;
}

/**
 * Create provider node
 */
export async function createProviderNode(data) {
  const db = await getDb();

  // Initialize providerNodes if undefined (backward compatibility)
  if (!db.data.providerNodes) {
    db.data.providerNodes = [];
  }

  const now = new Date().toISOString();

  const node = {
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    prefix: data.prefix,
    apiType: data.apiType,
    baseUrl: data.baseUrl,
    createdAt: now,
    updatedAt: now,
  };

  db.data.providerNodes.push(node);
  await safeWrite(db);

  return node;
}

/**
 * Update provider node
 */
export async function updateProviderNode(id, data) {
  const db = await getDb();
  if (!db.data.providerNodes) {
    db.data.providerNodes = [];
  }

  const index = db.data.providerNodes.findIndex((node) => node.id === id);

  if (index === -1) return null;

  db.data.providerNodes[index] = {
    ...db.data.providerNodes[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await safeWrite(db);

  return db.data.providerNodes[index];
}

/**
 * Delete provider node
 */
export async function deleteProviderNode(id) {
  const db = await getDb();
  if (!db.data.providerNodes) {
    db.data.providerNodes = [];
  }

  const index = db.data.providerNodes.findIndex((node) => node.id === id);

  if (index === -1) return null;

  const [removed] = db.data.providerNodes.splice(index, 1);
  await safeWrite(db);

  return removed;
}

// ============ Proxy Pools ============

/**
 * Get proxy pools
 */
export async function getProxyPools(filter = {}) {
  const db = await getDb();
  let pools = db.data.proxyPools || [];

  if (filter.isActive !== undefined) {
    pools = pools.filter((pool) => pool.isActive === filter.isActive);
  }

  if (filter.testStatus) {
    pools = pools.filter((pool) => pool.testStatus === filter.testStatus);
  }

  return pools.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

/**
 * Get proxy pool by ID
 */
export async function getProxyPoolById(id) {
  const db = await getDb();
  return (db.data.proxyPools || []).find((pool) => pool.id === id) || null;
}

/**
 * Create proxy pool
 */
export async function createProxyPool(data) {
  const db = await getDb();
  if (!db.data.proxyPools) {
    db.data.proxyPools = [];
  }

  const now = new Date().toISOString();
  const pool = {
    id: data.id || uuidv4(),
    name: data.name,
    proxyUrl: data.proxyUrl,
    noProxy: data.noProxy || "",
    isActive: data.isActive !== undefined ? data.isActive : true,
    strictProxy: data.strictProxy === true,
    testStatus: data.testStatus || "unknown",
    lastTestedAt: data.lastTestedAt || null,
    lastError: data.lastError || null,
    createdAt: now,
    updatedAt: now,
  };

  db.data.proxyPools.push(pool);
  await safeWrite(db);

  return pool;
}

/**
 * Update proxy pool
 */
export async function updateProxyPool(id, data) {
  const db = await getDb();
  if (!db.data.proxyPools) {
    db.data.proxyPools = [];
  }

  const index = db.data.proxyPools.findIndex((pool) => pool.id === id);
  if (index === -1) return null;

  db.data.proxyPools[index] = {
    ...db.data.proxyPools[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  await safeWrite(db);
  return db.data.proxyPools[index];
}

/**
 * Delete proxy pool
 */
export async function deleteProxyPool(id) {
  const db = await getDb();
  if (!db.data.proxyPools) {
    db.data.proxyPools = [];
  }

  const index = db.data.proxyPools.findIndex((pool) => pool.id === id);
  if (index === -1) return null;

  const [removed] = db.data.proxyPools.splice(index, 1);
  await safeWrite(db);

  return removed;
}
