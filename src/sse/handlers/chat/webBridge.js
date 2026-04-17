// ── Chat Handler — Web Bridge forwarding (WS + response helpers) ──

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import * as log from "../../utils/logger.js";
import { getWebBridgePort } from "@/lib/webBridgeServerConfig";
import { clearServerCache } from "@/lib/serverCache";
import { errorResponse } from "open-sse/utils/error.js";
import { normalizeBridgeModel, WB_OPENAI_PROTOCOL } from "./constants.js";
import { sanitizeWebBridgeBody } from "./messageSanitizer.js";
import { handleInjectRelay } from "./injectRelay.js";

// ── Response builders ──

export function createWebBridgeJsonCompletion({ text, model, messages = [] }) {
  return {
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      _messages: Array.isArray(messages) ? messages.length : 0,
    },
  };
}

export function createWebBridgeChunkPayload({ id = "", created = 0, role = "", text, model, finishReason = null }) {
  const delta = {};
  if (role) {
    delta.role = role;
  }
  if (text) {
    delta.content = text;
  }

  return JSON.stringify({
    id: id || `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion.chunk",
    created: created || Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
  });
}

export function createWebBridgeStreamResponse(run) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      await run({
        writeChunk: async (payload) => {
          await writer.write(encoder.encode(`data: ${payload}\n\n`));
        },
        writeDone: async () => {
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        },
      });
    } catch (error) {
      const fallbackPayload = createWebBridgeChunkPayload({
        text: error?.message || "Web Bridge request failed",
        model: "web-bridge",
        finishReason: "stop",
      });
      await writer.write(encoder.encode(`data: ${fallbackPayload}\n\n`));
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function readWebBridgeUpstreamError(response, fallbackMessage) {
  const fallback = fallbackMessage || `Web Bridge upstream returned HTTP ${response.status}`;
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } catch {
  }

  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400) || fallback;
}

// ── Debug snapshot ──

export async function saveLastWebBridgeRawRequestSnapshot(provider, modelStr, rawBody) {
  try {
    const outputPath = path.join(process.cwd(), "data", "web-bridge-last-request.json");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        provider,
        model: modelStr,
        rawRequestBody: rawBody,
      }, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    log.warn("ROUTING", `Web Bridge debug snapshot failed: ${error?.message || String(error)}`);
  }
}

// ── WebSocket Bridge forwarding ──

/**
 * Forward an HTTP API request to the Rust WebSocket bridge and translate
 * back to standard HTTP SSE / JSON for the external caller.
 */
export async function forwardViaWebBridge(provider, model, body, request) {
  const isStream = body.stream === true;

  // ── Inject Relay Mode: bypass cookie-based flow ──
  const injectResponse = await handleInjectRelay(provider, model, body, isStream);
  if (injectResponse) return injectResponse;

  const port = getWebBridgePort();
  const wsUrl = `ws://127.0.0.1:${port}/ws/bridge`;

  // Dump full incoming body to file for debugging
  const dumpPath = path.join(process.cwd(), "data", "web-bridge-incoming-body.json");
  fs.mkdir(path.dirname(dumpPath), { recursive: true })
    .then(() => fs.writeFile(dumpPath, JSON.stringify(body, null, 2), "utf-8"))
    .then(() => log.info("WEB_BRIDGE_PROXY", `Full request body saved to: ${dumpPath}`))
    .catch((err) => log.warn("WEB_BRIDGE_PROXY", `Failed to dump body: ${err.message}`));

  // Forward entire body as-is — no stripping, no filtering, no truncation
  const requestId = crypto.randomUUID();
  const wsPayload = {
    ...body,
    type: "request.create",
    request_id: requestId,
    model: `${provider}/${model}`,
  };

  log.info("WEB_BRIDGE_PROXY", `Forwarding ${provider}/${model} via WS (stream=${isStream})`);

  if (isStream) {
    // --- SSE streaming mode ---
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const socket = new WebSocket(wsUrl, WB_OPENAI_PROTOCOL);
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try { socket.close(); } catch { }
    };

    socket.on("open", () => {
      socket.send(JSON.stringify(wsPayload));
    });

    socket.on("message", async (raw) => {
      let parsed;
      try { parsed = JSON.parse(String(raw)); } catch { return; }

      switch (parsed?.type) {
        case "response.chunk": {
          const chunk = parsed?.chunk || parsed?.data;
          if (chunk) {
            await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          return;
        }
        case "response.completed": {
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
          cleanup();
          return;
        }
        case "response.error": {
          const errMsg = parsed?.error?.message || parsed?.message || "Web Bridge request failed.";
          const errPayload = {
            id: `chatcmpl_${crypto.randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: `${provider}/${model}`,
            choices: [{ index: 0, delta: { content: errMsg }, finish_reason: "stop" }],
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(errPayload)}\n\n`));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
          cleanup();
          return;
        }
        default:
          return;
      }
    });

    socket.on("error", async (err) => {
      log.warn("WEB_BRIDGE_PROXY", `WS error: ${err.message}`);
      if (!closed) {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            id: `chatcmpl_${crypto.randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: `${provider}/${model}`,
            choices: [{ index: 0, delta: { content: `[Bridge Error] ${err.message}` }, finish_reason: "stop" }],
          })}\n\n`));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
        } catch { }
        cleanup();
      }
    });

    socket.on("close", async () => {
      if (!closed) {
        try { await writer.close(); } catch { }
        cleanup();
      }
    });

    return new Response(stream.readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // --- Non-stream JSON mode ---
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl, WB_OPENAI_PROTOCOL);
    let settled = false;
    let aggregatedText = "";

    const finish = (response) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch { }
      resolve(response);
    };

    socket.on("open", () => {
      socket.send(JSON.stringify(wsPayload));
    });

    socket.on("message", (raw) => {
      let parsed;
      try { parsed = JSON.parse(String(raw)); } catch { return; }

      switch (parsed?.type) {
        case "response.chunk": {
          const chunk = parsed?.chunk || parsed?.data;
          const delta = chunk?.choices?.[0]?.delta?.content || "";
          aggregatedText += delta;
          return;
        }
        case "response.completed": {
          const responsePayload = parsed?.response || parsed?.data || {};
          const finalText = responsePayload?.choices?.[0]?.message?.content || aggregatedText;
          finish(Response.json({
            id: `chatcmpl_${crypto.randomUUID()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: `${provider}/${model}`,
            choices: [{
              index: 0,
              message: { role: "assistant", content: finalText },
              finish_reason: "stop",
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }, {
            headers: { "Access-Control-Allow-Origin": "*" },
          }));
          return;
        }
        case "response.error": {
          const errMsg = parsed?.error?.message || parsed?.message || "Web Bridge request failed.";
          finish(Response.json(
            { error: { message: errMsg, type: "server_error", code: "web_bridge_error" } },
            { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
          ));
          return;
        }
        default:
          return;
      }
    });

    socket.on("error", (err) => {
      log.warn("WEB_BRIDGE_PROXY", `WS error: ${err.message}`);
      finish(Response.json(
        { error: { message: `[Bridge Error] ${err.message}`, type: "server_error", code: "web_bridge_connection_error" } },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
      ));
    });

    socket.on("close", () => {
      finish(Response.json(
        { error: { message: "WebSocket closed before completion.", type: "server_error", code: "web_bridge_closed" } },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
      ));
    });
  });
}

// ── handleWebBridgeChat: orchestrates sanitize + provider dispatch ──

export async function handleWebBridgeChat(body, provider, modelStr) {
  await saveLastWebBridgeRawRequestSnapshot(provider, modelStr, body);
  const sanitizedBody = sanitizeWebBridgeBody(body, provider);
  const responseModel = typeof modelStr === "string" && modelStr.trim()
    ? modelStr.trim()
    : `${provider}/${normalizeBridgeModel(provider, sanitizedBody.model)}`;
  const isStream = sanitizedBody.stream === true;

  if (provider === "chatgpt-web") {
    const {
      executeChatgptWebCompletion,
      createOpenAiCompatibleConversationStreamResponse,
      convertChatgptConversationResponseToJson,
    } = await import("@/lib/chatgptWeb");

    const bridgeBody = {
      ...sanitizedBody,
      model: normalizeBridgeModel(provider, modelStr, "auto"),
    };

    if (!isStream) {
      const { normalized, response } = await executeChatgptWebCompletion(bridgeBody);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clearServerCache();
        const message = await readWebBridgeUpstreamError(response, "ChatGPT Web bridge request failed");
        return errorResponse(response.status, message);
      }

      const payload = await convertChatgptConversationResponseToJson(
        response,
        responseModel,
        normalized.body.messages,
      );
      payload.model = responseModel;
      return Response.json(payload);
    }

    try {
      const { normalized, response } = await executeChatgptWebCompletion(bridgeBody);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clearServerCache();
        const message = await readWebBridgeUpstreamError(response, "ChatGPT Web bridge request failed");
        return errorResponse(response.status, message);
      }

      return new Response(
        createOpenAiCompatibleConversationStreamResponse(
          response.body,
          responseModel,
          normalized.body.messages,
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status === 401 || status === 403) clearServerCache();
      return errorResponse(status, error?.message || "ChatGPT Web bridge request failed");
    }
  }

  const isGemini = provider === "gemini-web";
  const bridgeModelFallback = isGemini ? "gemini-3.1-pro" : "grok-3";
  const executeBridgeCompletion = isGemini
    ? (await import("@/lib/geminiWeb")).executeGeminiWebCompletion
    : (await import("@/lib/grokWeb")).executeGrokWebCompletion;
  const bridgeBody = {
    ...sanitizedBody,
    model: normalizeBridgeModel(provider, modelStr, bridgeModelFallback),
  };

  if (!isStream) {
    try {
      const result = await executeBridgeCompletion(bridgeBody);
      return Response.json(createWebBridgeJsonCompletion({
        text: result.text,
        model: responseModel,
        messages: Array.isArray(sanitizedBody.messages) ? sanitizedBody.messages : [],
      }));
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status === 401 || status === 403) clearServerCache();
      return errorResponse(status, error?.message || `${provider} bridge request failed`);
    }
  }

  return createWebBridgeStreamResponse(async ({ writeChunk, writeDone }) => {
    let streamedText = "";

    try {
      const result = await executeBridgeCompletion(bridgeBody, {
        onDelta: async (delta) => {
          if (!delta) return;
          streamedText += delta;
          await writeChunk(createWebBridgeChunkPayload({
            text: delta,
            model: responseModel,
          }));
        },
      });

      const finalText = String(result?.text || "");
      const remaining = finalText.startsWith(streamedText)
        ? finalText.slice(streamedText.length)
        : "";

      if (remaining) {
        await writeChunk(createWebBridgeChunkPayload({
          text: remaining,
          model: responseModel,
        }));
      }

      await writeDone();
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status === 401 || status === 403) clearServerCache();
      await writeChunk(createWebBridgeChunkPayload({
        text: error?.message || `${provider} bridge request failed`,
        model: responseModel,
        finishReason: "stop",
      }));
      await writeDone();
    }
  });
}
