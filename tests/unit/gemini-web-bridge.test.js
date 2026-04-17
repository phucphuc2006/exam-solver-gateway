import { describe, expect, it } from "vitest";

import { __testables } from "../../src/sse/handlers/chat.js";
import { normalizeGeminiWebModel } from "../../src/lib/geminiWeb.js";

const OPENCLAW_SYSTEM_PROMPT = [
  "You are a personal assistant running inside OpenClaw.",
  "## Tooling",
  "Tool availability (filtered by policy):",
  "Call tools exactly as listed.",
  "agents_list",
  "sessions_list",
  "sessions_history",
  "sessions_send",
  "session_status",
].join("\n");

describe("Gemini Web model normalization", () => {
  it("strips the web-bridge provider prefix before resolving Gemini model ids", () => {
    expect(normalizeGeminiWebModel("gemini-web/gemini-3.1-pro")).toBe("gemini-3.1-pro");
    expect(normalizeGeminiWebModel("gemini-3.0-flash-thinking")).toBe("gemini-3.0-flash-thinking");
  });
});

describe("Web bridge sanitization", () => {
  it("does not force raw passthrough for OpenClaw Gemini requests", () => {
    const body = {
      model: "gemini-web/gemini-3.1-pro",
      tools: [{ type: "function", function: { name: "read" } }],
      reasoning_effort: "high",
      messages: [
        { role: "system", content: OPENCLAW_SYSTEM_PROMPT },
        { role: "user", content: "alo" },
      ],
    };

    const sanitized = __testables.sanitizeWebBridgeBody(body, "gemini-web");

    expect(sanitized.__webBridgeRawMessagePassthrough).toBe(false);
    expect(sanitized.tools).toBeUndefined();
    expect(sanitized.messages).toEqual([
      { role: "user", content: "alo" },
    ]);
  });

  it("keeps chatgpt-web raw passthrough behavior intact", () => {
    expect(__testables.shouldUseRawWebBridgePassthrough("chatgpt-web")).toBe(true);
    expect(__testables.shouldUseRawWebBridgePassthrough("gemini-web")).toBe(false);
  });
});
