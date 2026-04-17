const CACHE = globalThis.__nexusServerCache || new Map();
const PENDING = globalThis.__nexusServerCachePending || new Map();

if (!globalThis.__nexusServerCache) {
  globalThis.__nexusServerCache = CACHE;
}

if (!globalThis.__nexusServerCachePending) {
  globalThis.__nexusServerCachePending = PENDING;
}

export function getCachedValue(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    CACHE.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedValue(key, value, ttlMs) {
  CACHE.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export function deleteCachedValue(key) {
  CACHE.delete(key);
  PENDING.delete(key);
}

export async function getOrSetCachedValue(key, ttlMs, loader, options = {}) {
  const cached = getCachedValue(key);
  if (cached !== null) {
    return cached;
  }

  const pending = PENDING.get(key);
  if (pending) {
    return pending;
  }

  const shouldCache = typeof options.cacheIf === "function" ? options.cacheIf : () => true;
  const pendingLoad = (async () => {
    const value = await loader();
    if (shouldCache(value)) {
      setCachedValue(key, value, ttlMs);
    }
    return value;
  })();

  PENDING.set(key, pendingLoad);

  try {
    return await pendingLoad;
  } finally {
    if (PENDING.get(key) === pendingLoad) {
      PENDING.delete(key);
    }
  }
}

export function clearServerCache() {
  CACHE.clear();
  PENDING.clear();
}
