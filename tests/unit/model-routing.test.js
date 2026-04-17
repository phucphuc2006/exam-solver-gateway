import { describe, it, expect } from "vitest";

import { getModelInfoCore, parseModel } from "../../open-sse/services/model.js";

describe("model routing normalization", () => {
  it("strips unknown router namespaces before resolving provider aliases", () => {
    expect(parseModel("legacy/cx/gpt-5.4")).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      isAlias: false,
      providerAlias: "cx",
    });
  });

  it("normalizes namespaced alias targets before credential lookup", async () => {
    await expect(
      getModelInfoCore("embedded-default", {
        "embedded-default": "legacy/cx/gpt-5.4",
      }),
    ).resolves.toEqual({
      provider: "codex",
      model: "gpt-5.4",
    });
  });
});
