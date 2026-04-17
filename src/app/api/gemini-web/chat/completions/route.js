import crypto from "node:crypto";
import { clearServerCache } from "@/lib/serverCache";
import { executeGeminiWebCompletion } from "@/lib/geminiWeb";
import {
  buildWebBridgeMetricsHeaders,
  createWebBridgeTimingTracker,
  formatWebBridgeMetricsSseEvent,
} from "@/lib/webBridgeTiming";
import { stripWebBridgeProviderPrefix } from "@/shared/constants/webBridge";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth";
import { isInternalWebBridgeRequest } from "@/lib/webBridgeInternalAuth";
import { createWebBridgeUpgradeRequiredResponse } from "@/lib/webBridgeUpgrade";

function jsonError(message, status = 400, code = "invalid_request_error") {
  return Response.json(
    {
      error: {
        message,
        type: code,
        code,
      },
    },
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

function createOpenAiJsonResponse({ text, model, messages = [] }) {
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
      _messages: messages.length,
    },
  };
}

function createChunkPayload({ text, model }) {
  return JSON.stringify({
    id: `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function POST(request) {
  try {
    const internalRequest = isInternalWebBridgeRequest(request);
    if (!internalRequest) {
      return createWebBridgeUpgradeRequiredResponse({
        request,
        model: "gemini-web/gemini-3.1-pro",
      });
    }

    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();

    if (!internalRequest && settings.requireApiKey) {
      const apiKey = extractApiKey(request);
      if (!apiKey) return jsonError("Missing API key", 401, "unauthorized");
      const valid = await isValidApiKey(apiKey);
      if (!valid) return jsonError("Invalid API key", 401, "unauthorized");
    }

    const body = await request.json();
    body.model = stripWebBridgeProviderPrefix(body.model, "gemini-web");
    const isStream = body.stream === true;
    const tracker = createWebBridgeTimingTracker({
      bridge: "gemini-web",
      mode: isStream ? "stream" : "json",
      requestId: crypto.randomUUID(),
    });

    if (isStream) {
      const encoder = new TextEncoder();
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();

      (async () => {
        let sentText = "";
        let aborted = false;

        try {
          const result = await executeGeminiWebCompletion(body, {
            onUpstreamReady: async () => {
              tracker.markUpstreamReady();
            },
            onFirstByte: async () => {
              tracker.markFirstByte();
            },
            onDelta: async (delta) => {
              if (!delta || aborted) return;
              tracker.markFirstDelta();
              sentText += delta;
              try {
                await writer.write(encoder.encode(`data: ${createChunkPayload({
                  text: delta,
                  model: body.model || "gemini-3.0-flash",
                })}\n\n`));
              } catch {
                aborted = true;
              }
            },
          });

          const remaining = String(result?.text || "").startsWith(sentText)
            ? String(result.text || "").slice(sentText.length)
            : "";

          try {
            if (remaining) {
              await writer.write(encoder.encode(`data: ${createChunkPayload({
                text: remaining,
                model: result.model,
              })}\n\n`));
            }

            const metrics = tracker.markCompleted({
              model: result.model,
              status: "ok",
            });
            await writer.write(encoder.encode(formatWebBridgeMetricsSseEvent(metrics)));
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            await writer.close();
          } catch {
            // Client disconnected mid-stream — close writer gracefully
            try { await writer.close(); } catch {}
          }
        } catch (error) {
          const status = Number(error?.status || 500);
          if (status === 401 || status === 403) {
            clearServerCache();
          }

          try {
            const payload = JSON.stringify({
              id: `chatcmpl_${crypto.randomUUID()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: body.model || "gemini-3.0-flash",
              choices: [{
                index: 0,
                delta: { content: error.message || "Gemini Web bridge request failed" },
                finish_reason: "stop",
              }],
            });

            const metrics = tracker.markCompleted({
              status: "error",
              error: error.message || "Gemini Web bridge request failed",
            });
            await writer.write(encoder.encode(`data: ${payload}\n\n`));
            await writer.write(encoder.encode(formatWebBridgeMetricsSseEvent(metrics)));
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            await writer.close();
          } catch {
            // Response already aborted — writer is no longer writable, ignore gracefully
            try { await writer.close(); } catch {}
          }
        }
      })().catch(() => {
        // Guard against any remaining unhandled rejection (e.g. ResponseAborted)
      });

      return new Response(stream.readable, {
        status: 200,
        headers: buildWebBridgeMetricsHeaders(tracker.snapshot(), {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        }),
      });
    }

    const result = await executeGeminiWebCompletion(body, {
      onUpstreamReady: async () => {
        tracker.markUpstreamReady();
      },
      onFirstByte: async () => {
        tracker.markFirstByte();
      },
      onDelta: async () => {
        tracker.markFirstDelta();
      },
    });
    const metrics = tracker.markCompleted({
      model: result.model,
      status: "ok",
    });

    return Response.json(
      createOpenAiJsonResponse({
        ...result,
        messages: Array.isArray(body.messages) ? body.messages : [],
      }),
      { headers: buildWebBridgeMetricsHeaders(metrics) },
    );
  } catch (error) {
    const status = Number(error?.status || 500);
    if (status === 401 || status === 403) {
      clearServerCache();
    }

    return jsonError(
      error.message || "Gemini Web bridge request failed",
      status,
      "server_error",
    );
  }
}
