import { describe, expect, it } from "vitest";
import {
  extractCookieValueFromSetCookie,
  generateFakeSentinelToken,
  solveSentinelChallenge,
} from "../../src/lib/chatgptWebSentinel.js";

describe("ChatGPT Web sentinel helpers", () => {
  it("generates a fake sentinel requirements token", () => {
    const token = generateFakeSentinelToken();

    expect(token.startsWith("gAAAAAC")).toBe(true);
    expect(token.length).toBeGreaterThan(20);
  });

  it("solves a proof-of-work challenge into a sentinel proof token", () => {
    const token = solveSentinelChallenge("seed-test", "ff");

    expect(token.startsWith("gAAAAAB")).toBe(true);
    expect(token.length).toBeGreaterThan(20);
  });

  it("extracts oai-sc from set-cookie headers", () => {
    const value = extractCookieValueFromSetCookie(
      [
        "foo=bar; Path=/; Secure",
        "oai-sc=test-cookie-value; Path=/; Secure; HttpOnly",
      ],
      "oai-sc",
    );

    expect(value).toBe("test-cookie-value");
  });
});
