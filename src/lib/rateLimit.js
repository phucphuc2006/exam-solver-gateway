import { NextResponse } from "next/server";
import { getClientIp } from "./requestContext.js";

const STORE = globalThis.__nexusRateLimitStore || new Map();

if (!globalThis.__nexusRateLimitStore) {
  globalThis.__nexusRateLimitStore = STORE;
}

function pruneExpired(now) {
  for (const [key, entry] of STORE.entries()) {
    if (!entry || entry.resetAt <= now) {
      STORE.delete(key);
    }
  }
}

export function consumeRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  pruneExpired(now);

  const existing = STORE.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 1,
      limit,
      resetAt: now + windowMs,
    };
    STORE.set(key, next);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - next.count),
      resetAt: next.resetAt,
      retryAfterMs: 0,
    };
  }

  existing.count += 1;
  STORE.set(key, existing);

  const retryAfterMs = Math.max(0, existing.resetAt - now);
  return {
    allowed: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterMs,
  };
}

export function buildRateLimitHeaders(result) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.retryAfterMs > 0
      ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
      : {}),
  };
}

export function enforceRateLimit(request, { scope, limit, windowMs }, message = "Too many requests") {
  const clientIp = getClientIp(request) || "unknown";
  const result = consumeRateLimit(`${scope}:${clientIp}`, { limit, windowMs });

  if (result.allowed) {
    return { response: null, result };
  }

  return {
    result,
    response: NextResponse.json(
      {
        error: message,
        code: "RATE_LIMITED",
        retryAfterMs: result.retryAfterMs,
      },
      {
        status: 429,
        headers: buildRateLimitHeaders(result),
      },
    ),
  };
}

export function resetRateLimitStore() {
  STORE.clear();
}
