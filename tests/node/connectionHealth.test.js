import { describe, expect, it } from "vitest";
import {
  buildConnectionHealthUpdate,
  computeLatencyEwma,
  getConnectionHealthScore,
} from "../../src/lib/connectionHealth.js";

describe("connection health helpers", () => {
  it("seeds latency ewma from the first sample", () => {
    expect(computeLatencyEwma(null, 240)).toBe(240);
  });

  it("decays error penalty after a success", () => {
    const update = buildConnectionHealthUpdate(
      { healthErrorPenalty: 0.6, healthLatencyEwmaMs: 500 },
      { success: true, latencyMs: 300, occurredAt: "2026-04-03T10:00:00.000Z" },
    );

    expect(update.healthErrorPenalty).toBe(0.3);
    expect(update.lastSuccessAt).toBe("2026-04-03T10:00:00.000Z");
    expect(update.healthLatencyEwmaMs).toBeLessThan(500);
  });

  it("penalizes recent failures in the health score", () => {
    const healthy = getConnectionHealthScore({ weight: 1, healthErrorPenalty: 0, healthLatencyEwmaMs: 300 });
    const degraded = getConnectionHealthScore({
      weight: 1,
      healthErrorPenalty: 0.4,
      healthLatencyEwmaMs: 1200,
      lastFailureAt: "2026-04-03T11:00:00.000Z",
      lastSuccessAt: "2026-04-03T10:00:00.000Z",
    });

    expect(healthy).toBeGreaterThan(degraded);
  });
});
