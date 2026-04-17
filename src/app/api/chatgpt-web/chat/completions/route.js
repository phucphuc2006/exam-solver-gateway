import {
  executeChatgptWebCompletion,
  createOpenAiCompatibleConversationStreamResponse,
  convertChatgptConversationResponseToJson,
} from "@/lib/chatgptWeb";
import { clearServerCache } from "@/lib/serverCache";
import {
  buildWebBridgeMetricsHeaders,
  createWebBridgeTimingTracker,
  formatWebBridgeMetricsSseEvent,
} from "@/lib/webBridgeTiming";
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

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

async function readUpstreamErrorMessage(response) {
  const fallback = `ChatGPT Web upstream returned HTTP ${response.status}`;
  const text = await response.text();

  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  } catch {
  }

  const normalized = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 400);
}

export async function POST(request) {
  try {
    const internalRequest = isInternalWebBridgeRequest(request);
    if (!internalRequest) {
      return createWebBridgeUpgradeRequiredResponse({
        request,
        model: "chatgpt-web/auto",
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
    const isStream = body.stream !== false;
    const tracker = createWebBridgeTimingTracker({
      bridge: "chatgpt-web",
      mode: isStream ? "stream" : "json",
    });

    if (!isStream) {
      const { normalized, response } = await executeChatgptWebCompletion(body);
      tracker.markUpstreamReady({ model: normalized.model });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) clearServerCache();
        const errorText = await readUpstreamErrorMessage(response);
        tracker.markCompleted({
          status: "error",
          model: normalized.model,
          upstreamStatus: response.status,
        });
        return jsonError(
          errorText || `ChatGPT Web upstream returned HTTP ${response.status}`,
          response.status,
          response.status === 401 || response.status === 403 ? "upstream_unauthorized" : "upstream_error",
        );
      }
      const payload = await convertChatgptConversationResponseToJson(
        response,
        normalized.model,
        normalized.body.messages,
      );
      const metrics = tracker.markCompleted({
        status: "ok",
        model: normalized.model,
      });
      return Response.json(payload, { headers: buildWebBridgeMetricsHeaders(metrics) });
    }

    // Zero-TTFB Streaming
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    (async () => {
      let metricsWritten = false;
      let chunkBuffer = "";

      try {
        const { normalized, response } = await executeChatgptWebCompletion(body);
        tracker.markUpstreamReady({ model: normalized.model });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) clearServerCache();
          const errorText = await readUpstreamErrorMessage(response);
          const errorMsg = `[Hệ thống]: Rất tiếc, đã có lỗi kết nối đến ChatGPT Upstream (HTTP ${response.status}).\nChi tiết: ${errorText}`;
          const chunkPayload = JSON.stringify({
            id: "chatcmpl_error",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: normalized.model || "chatgpt",
            choices: [{ index: 0, delta: { content: errorMsg }, finish_reason: "stop" }]
          });
          const metrics = tracker.markCompleted({
            status: "error",
            model: normalized.model || "chatgpt",
            upstreamStatus: response.status,
          });
          await writer.write(encoder.encode(formatWebBridgeMetricsSseEvent(metrics)));
          await writer.write(encoder.encode(`data: ${chunkPayload}\n\n`));
          await writer.write(encoder.encode("data: [DONE]\n\n"));
          await writer.close();
          return;
        }

        const streamBody = createOpenAiCompatibleConversationStreamResponse(
          response.body,
          normalized.model,
          normalized.body.messages,
        );
        const reader = streamBody.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) {
            tracker.markFirstByte({ model: normalized.model });
            chunkBuffer += decoder.decode(value, { stream: true });
            const messages = chunkBuffer.split("\n\n");
            chunkBuffer = messages.pop() || "";

            for (const rawMessage of messages) {
              const dataLine = rawMessage
                .split("\n")
                .find((entry) => entry.startsWith("data:"));
              if (!dataLine) continue;
              const payloadText = dataLine.slice(5).trim();
              if (!payloadText || payloadText === "[DONE]") continue;

              try {
                const parsed = JSON.parse(payloadText);
                const delta = parsed?.choices?.[0]?.delta?.content || "";
                if (delta) {
                  tracker.markFirstDelta({ model: normalized.model });
                  break;
                }
              } catch {
              }
            }
          }
          await writer.write(value);
        }
        chunkBuffer += decoder.decode();
        if (chunkBuffer.trim()) {
          const messages = chunkBuffer.split("\n\n");
          for (const rawMessage of messages) {
            const dataLine = rawMessage
              .split("\n")
              .find((entry) => entry.startsWith("data:"));
            if (!dataLine) continue;
            const payloadText = dataLine.slice(5).trim();
            if (!payloadText || payloadText === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payloadText);
              const delta = parsed?.choices?.[0]?.delta?.content || "";
              if (delta) {
                tracker.markFirstDelta({ model: normalized.model });
                break;
              }
            } catch {
            }
          }
        }
        const metrics = tracker.markCompleted({
          status: "ok",
          model: normalized.model,
        });
        await writer.write(encoder.encode(formatWebBridgeMetricsSseEvent(metrics)));
        metricsWritten = true;
        await writer.close();
      } catch (error) {
        console.error("[ChatGPT Web] Background stream failed:", error);
        const status = Number(error?.status || 500);
        if (status === 401 || status === 403) clearServerCache();
        const errorMsg = `[Hệ thống]: Lỗi thực thi Bridge (${status}).\nChi tiết: ${error.message || "Unknown error"}`;
        const chunkPayload = JSON.stringify({
             id: "chatcmpl_error",
             object: "chat.completion.chunk",
             created: Math.floor(Date.now() / 1000),
             model: body.model || "chatgpt",
             choices: [{ index: 0, delta: { content: errorMsg }, finish_reason: "stop" }]
        });
        const metrics = tracker.markCompleted({
          status: "error",
          model: body.model || "chatgpt",
          error: error.message || "Unknown error",
        });
        await writer.write(encoder.encode(`data: ${chunkPayload}\n\n`));
        if (!metricsWritten) {
          await writer.write(encoder.encode(formatWebBridgeMetricsSseEvent(metrics)));
        }
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      status: 200,
      headers: buildWebBridgeMetricsHeaders(tracker.snapshot(), {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }),
    });
  } catch (error) {
    console.error("[ChatGPT Web] chat/completions route failed:", error);
    const status = Number(error?.status || 500);
    return jsonError(
      error.message || "ChatGPT Web bridge request failed",
      status,
      "server_error",
    );
  }
}
