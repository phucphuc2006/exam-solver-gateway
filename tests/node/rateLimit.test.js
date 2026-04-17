import { beforeEach, describe, expect, it } from "vitest";
import { consumeRateLimit, resetRateLimitStore } from "../../src/lib/rateLimit.js";

describe("rate limit store", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests within the window", () => {
    const first = consumeRateLimit("auth:127.0.0.1", { limit: 2, windowMs: 60_000 });
    const second = consumeRateLimit("auth:127.0.0.1", { limit: 2, windowMs: 60_000 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks requests after the limit is exceeded", () => {
    consumeRateLimit("auth:127.0.0.1", { limit: 1, windowMs: 60_000 });
    const blocked = consumeRateLimit("auth:127.0.0.1", { limit: 1, windowMs: 60_000 });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
