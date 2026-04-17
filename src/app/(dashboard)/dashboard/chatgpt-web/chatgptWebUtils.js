// ── ChatGPT Web Page — Utility functions ──

const INITIAL_LOAD_CACHE_TTL_MS = 15_000;
const initialPageLoadCache = new Map();

export function getCachedInitialPageLoad(cacheKey, loader, { preferCache = false } = {}) {
  if (!preferCache) {
    return loader();
  }

  const now = Date.now();
  const cached = initialPageLoadCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < INITIAL_LOAD_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = loader()
    .then((result) => {
      initialPageLoadCache.set(cacheKey, {
        timestamp: Date.now(),
        promise: Promise.resolve(result),
      });
      return result;
    })
    .catch((error) => {
      initialPageLoadCache.delete(cacheKey);
      throw error;
    });

  initialPageLoadCache.set(cacheKey, {
    timestamp: now,
    promise,
  });

  return promise;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function coerceNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(parsed));
}

export async function parseErrorResponse(response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    return (
      parsed?.error?.message
      || parsed?.error
      || text
      || `HTTP ${response.status}`
    );
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export function hasBearerAuthorizationHeader(value) {
  return /^Bearer\s+\S+/i.test(String(value || "").trim());
}
