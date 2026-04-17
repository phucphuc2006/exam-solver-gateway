import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetStorageForTests } from "../../src/lib/storage/sqlite/client.js";
import {
  resetStorageBootstrapForTests,
  runLegacyMigration,
} from "../../src/lib/storage/sqlite/migrateLegacy.js";
import {
  getGatewayStateSnapshot,
  getRecentRequestLogLines,
  getRequestDetailsStateSnapshot,
  getUsageStateSnapshot,
} from "../../src/lib/storage/sqlite/repositories.js";

describe("legacy SQLite migration", () => {
  const originalDataDir = process.env.DATA_DIR;
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexusai-storage-"));
    process.env.DATA_DIR = tempDir;
    resetStorageBootstrapForTests();
    resetStorageForTests();
  });

  afterEach(() => {
    resetStorageBootstrapForTests();
    resetStorageForTests();

    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("imports db, usage, request details, and request logs into SQLite", async () => {
    fs.writeFileSync(path.join(tempDir, "db.json"), JSON.stringify({
      providerConnections: [
        {
          id: "conn-1",
          provider: "openai",
          authType: "apikey",
          name: "Primary",
          apiKey: "sk-test",
          isActive: true,
          priority: 1,
        },
      ],
      providerNodes: [],
      proxyPools: [],
      modelAliases: { "gpt-fast": "openai/gpt-4.1-mini" },
      mitmAlias: {},
      combos: [],
      apiKeys: [{ id: "key-1", name: "Local Key", key: "sk-local", machineId: "machine-1", isActive: true }],
      settings: { requireLogin: true, bootstrapCompletedAt: "2026-04-03T12:00:00.000Z" },
      pricing: {},
      schemaVersion: 1,
    }, null, 2));

    fs.writeFileSync(path.join(tempDir, "usage.json"), JSON.stringify({
      history: [
        {
          provider: "openai",
          model: "gpt-4.1-mini",
          timestamp: "2026-04-03T12:01:00.000Z",
          tokens: { prompt_tokens: 12, completion_tokens: 8 },
          endpoint: "/api/v1/chat/completions",
        },
      ],
      totalRequestsLifetime: 7,
    }, null, 2));

    fs.writeFileSync(path.join(tempDir, "request-details.json"), JSON.stringify({
      records: [
        {
          id: "detail-1",
          provider: "openai",
          model: "gpt-4.1-mini",
          timestamp: "2026-04-03T12:01:00.000Z",
          status: "success",
        },
      ],
    }, null, 2));

    fs.writeFileSync(
      path.join(tempDir, "log.txt"),
      "03-04-2026 19:20:19 | gpt-4.1-mini | OPENAI | Primary | 12 | 8 | 200 OK\n",
    );

    const result = await runLegacyMigration({ force: true });
    const localState = await getGatewayStateSnapshot();
    const usageState = await getUsageStateSnapshot();
    const requestDetailsState = await getRequestDetailsStateSnapshot();
    const logs = await getRecentRequestLogLines();

    expect(result.status).toBe("imported");
    expect(localState.providerConnections).toHaveLength(1);
    expect(localState.apiKeys).toHaveLength(1);
    expect(localState.modelAliases["gpt-fast"]).toBe("openai/gpt-4.1-mini");
    expect(usageState.totalRequestsLifetime).toBe(7);
    expect(usageState.history).toHaveLength(1);
    expect(requestDetailsState.records[0].id).toBe("detail-1");
    expect(logs[0]).toContain("OPENAI");
  });
});
