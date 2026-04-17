import { describe, expect, it } from "vitest";

import { stripWebBridgeProviderPrefix } from "../../src/shared/constants/webBridge.js";

describe("stripWebBridgeProviderPrefix", () => {
  it("strips the gemini-web prefix before provider routes resolve the upstream model", () => {
    expect(stripWebBridgeProviderPrefix("gemini-web/gemini-3.1-pro", "gemini-web")).toBe("gemini-3.1-pro");
  });

  it("strips the grok-web prefix before provider routes resolve the upstream model", () => {
    expect(stripWebBridgeProviderPrefix("grok-web/grok-3", "grok-web")).toBe("grok-3");
  });

  it("keeps the model unchanged when there is no web-bridge prefix", () => {
    expect(stripWebBridgeProviderPrefix("gemini-3.0-flash", "gemini-web")).toBe("gemini-3.0-flash");
  });

  it("keeps the model unchanged when the prefix belongs to another provider", () => {
    expect(stripWebBridgeProviderPrefix("chatgpt-web/auto", "gemini-web")).toBe("chatgpt-web/auto");
  });
});
