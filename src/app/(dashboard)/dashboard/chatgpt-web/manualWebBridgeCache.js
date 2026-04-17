/**
 * ManualWebBridge — cache, extension sticky storage, and utility helpers.
 */

// ── Constants ──
export const WEB_EXTENSION_PAGE_SOURCE = "nexusai-chatgpt-web-page";
export const WEB_EXTENSION_BRIDGE_SOURCE = "nexusai-chatgpt-web-extension";
export const WEB_EXTENSION_REQUEST_TIMEOUT_MS = 15_000;
export const WEB_EXTENSION_STICKY_STORAGE_KEY = "nexusai-web-extension-bridge-ready";
export const INITIAL_LOAD_CACHE_TTL_MS = 15_000;
export const BOOTSTRAP_CACHE_KEY = "manual:bootstrap";

// ── Initial Page Load Cache ──
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

// ── Extension Sticky Storage ──
export function readStickyExtensionAvailability() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(WEB_EXTENSION_STICKY_STORAGE_KEY) === "1";
}

export function writeStickyExtensionAvailability(value) {
  if (typeof window === "undefined") {
    return;
  }

  if (value) {
    window.localStorage.setItem(WEB_EXTENSION_STICKY_STORAGE_KEY, "1");
    return;
  }

  window.localStorage.removeItem(WEB_EXTENSION_STICKY_STORAGE_KEY);
}

// ── Date Format ──
export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}
