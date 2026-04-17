import { describe, expect, it } from "vitest";
import { normalizeDiagnosticResult } from "../../src/lib/diagnostics.js";

const connection = {
  id: "conn-1",
  provider: "openai",
};

describe("diagnostic normalization", () => {
  it("marks successful text runs as supported", () => {
    const result = normalizeDiagnosticResult({
      connection,
      targetModel: "openai/gpt-4.1-mini",
      modality: "text",
      latencyMs: 420,
      responseStatus: 200,
      responsePayload: { choices: [{ message: { content: "diagnostic-ok" } }] },
    });

    expect(result.supported).toBe(true);
    expect(result.summary).toContain("completed successfully");
    expect(result.metadata.capabilityFlag).toBe("supports_text");
  });

  it("requires tool call output for tool-calling support", () => {
    const result = normalizeDiagnosticResult({
      connection,
      targetModel: "openai/gpt-4.1-mini",
      modality: "tool-calling",
      latencyMs: 510,
      responseStatus: 200,
      responsePayload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "diagnostic_echo", arguments: "{\"value\":\"diagnostic-ok\"}" },
                },
              ],
            },
          },
        ],
      },
    });

    expect(result.supported).toBe(true);
    expect(result.summary).toContain("tool call");
    expect(result.metadata.capabilityFlag).toBe("supports_tools");
  });

  it("records audio diagnostics as manual follow-up until the audio route exists", () => {
    const result = normalizeDiagnosticResult({
      connection,
      targetModel: "openai/gpt-4.1-mini",
      modality: "audio",
      latencyMs: 0,
      responsePayload: null,
      error: "Audio proxy route is not yet available in the gateway surface.",
    });

    expect(result.supported).toBe(false);
    expect(result.summary).toContain("manual follow-up");
    expect(result.metadata.capabilityFlag).toBe("supports_audio");
  });
});
