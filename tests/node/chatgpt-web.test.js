import { describe, expect, it } from "vitest";
import {
  applyConversationPreparePayloadToHeaders,
  normalizeChatgptWebCaptureBundle,
  redactChatgptWebSession,
  validateChatgptWebRequest,
} from "../../src/lib/chatgptWeb.js";

describe("ChatGPT Web bridge helpers", () => {
  it("normalizes an Electron capture bundle", () => {
    const session = normalizeChatgptWebCaptureBundle({
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "secret-cookie",
          domain: "chatgpt.com",
          path: "/",
          secure: true,
        },
      ],
      headers: {
        Authorization: "Bearer browser-token",
        Cookie: "should-be-removed",
        "User-Agent": "Electron Test",
      },
      userAgent: "Electron Test",
      capturedAt: "2026-04-04T00:00:00.000Z",
      captureUrl: "https://chatgpt.com/backend-api/f/conversation",
      capturedTargetPath: "/backend-api/f/conversation",
      requestTemplate: {
        action: "next",
        model: "gpt-5",
        messages: [
          {
            id: "captured-message",
            author: { role: "user" },
            content: { content_type: "multimodal_text", parts: ["hello"] },
          },
        ],
      },
    });

    expect(session.provider).toBe("chatgpt-web");
    expect(session.status).toBe("captured");
    expect(session.userAgent).toBe("Electron Test");
    expect(JSON.parse(session.cookiesJson)).toHaveLength(1);
    expect(JSON.parse(session.headersJson)).toEqual({
      authorization: "Bearer browser-token",
      "user-agent": "Electron Test",
    });
    expect(JSON.parse(session.requestTemplateJson)).toMatchObject({
      action: "next",
      model: "gpt-5",
    });
  });

  it("rejects cookie-only capture bundles", () => {
    expect(() => normalizeChatgptWebCaptureBundle({
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "secret-cookie",
          domain: "chatgpt.com",
          path: "/",
          secure: true,
        },
      ],
      userAgent: "Browser Cookie Import",
      captureSource: "browser-cookie-import",
      captureUrl: "https://chatgpt.com/backend-api/f/conversation",
      capturedTargetPath: "/backend-api/f/conversation",
    })).toThrow("Authorization Bearer");
  });

  it("keeps conversation target paths from extension-style captures", () => {
    const session = normalizeChatgptWebCaptureBundle({
      cookies: [
        {
          name: "__Secure-next-auth.session-token",
          value: "secret-cookie",
          domain: "chatgpt.com",
          path: "/",
          secure: true,
        },
      ],
      headers: {
        Authorization: "Bearer browser-token",
      },
      userAgent: "Extension Test",
      captureSource: "browser-extension",
      captureUrl: "https://chatgpt.com/backend-api/f/conversation",
      capturedTargetPath: "/backend-api/f/conversation",
    });

    expect(session.capturedTargetPath).toBe("/backend-api/f/conversation");
  });

  it("redacts stored session metadata", () => {
    const redacted = redactChatgptWebSession({
      id: "chatgpt-web",
      provider: "chatgpt-web",
      status: "active",
      userAgent: "Electron Test",
      cookiesJson: JSON.stringify([{ name: "a", value: "b" }, { name: "c", value: "d" }]),
      headersJson: JSON.stringify({ authorization: "Bearer token", "user-agent": "Electron Test" }),
      requestTemplateJson: JSON.stringify({
        action: "next",
        model: "gpt-5",
      }),
      availableModelsJson: JSON.stringify([{ id: "gpt-5", name: "gpt-5" }]),
      capturedAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z",
    });

    expect(redacted.cookieCount).toBe(2);
    expect(redacted.headerKeys).toEqual(["authorization", "user-agent"]);
    expect(redacted.availableModels[0].id).toBe("gpt-5");
    expect(redacted.hasCapturedRequestTemplate).toBe(true);
    expect(redacted.challengeState.hasRequestTemplate).toBe(true);
    expect(redacted.cookiesJson).toBeUndefined();
    expect(redacted.headersJson).toBeUndefined();
  });

  it("defaults model from the validated model list and flattens text arrays", () => {
    const result = validateChatgptWebRequest(
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }],
          },
        ],
      },
      {
        availableModelsJson: JSON.stringify([{ id: "gpt-5.4", name: "gpt-5.4" }]),
      },
    );

    expect(result.model).toBe("gpt-5.4");
    expect(result.body.messages[0].content).toBe("hello\nworld");
    expect(result.stream).toBe(false);
  });

  it("matches dotted upstream models from hyphenated client slugs", () => {
    const result = validateChatgptWebRequest(
      {
        model: "gpt-5-3",
        messages: [
          {
            role: "user",
            content: "hello",
          },
        ],
      },
      {
        availableModelsJson: JSON.stringify([{ id: "gpt-5.3", name: "gpt-5.3" }]),
      },
    );

    expect(result.model).toBe("gpt-5.3");
  });

  it("applies conduit token from conversation prepare payload", () => {
    const headers = applyConversationPreparePayloadToHeaders(
      { "oai-echo-logs": "0,1,2" },
      { conduit_token: "conduit-secret-token" },
    );

    expect(headers).toMatchObject({
      "oai-echo-logs": "0,1,2",
      "x-conduit-token": "conduit-secret-token",
    });
  });

  it("rejects prepare payloads that do not include a conduit token", () => {
    expect(() => applyConversationPreparePayloadToHeaders({}, {})).toThrow(
      "Conversation prepare did not return a conduit token.",
    );
  });

  it("falls back to conduit token from prepare response headers", () => {
    const headers = applyConversationPreparePayloadToHeaders(
      {},
      null,
      {
        headers: {
          get(name) {
            return name === "x-conduit-token" ? "header-conduit-token" : null;
          },
        },
      },
    );

    expect(headers["x-conduit-token"]).toBe("header-conduit-token");
  });

  it("rejects unsupported tool or multimodal payloads", () => {
    expect(() =>
      validateChatgptWebRequest(
        {
          tools: [{ type: "function" }],
          messages: [{ role: "user", content: "hello" }],
        },
        {},
      ),
    ).toThrow("Field `tools` is not supported");

    expect(() =>
      validateChatgptWebRequest(
        {
          messages: [
            {
              role: "user",
              content: [{ type: "image_url", image_url: { url: "https://example.com/test.png" } }],
            },
          ],
        },
        {},
      ),
    ).toThrow("rejects image/audio/tool message content");
  });
});
