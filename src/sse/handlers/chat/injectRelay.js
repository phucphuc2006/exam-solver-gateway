// ── Chat Handler — Inject Relay forwarding ──
// Handles inject mode: bypasses cookie-based flow, builds prompt from messages

import crypto from "node:crypto";
import * as log from "../../utils/logger.js";
import { isInjectModeEnabled, createInjectTask, waitForResult } from "@/lib/injectRelay";
import { errorResponse } from "open-sse/utils/error.js";

/**
 * Handle inject relay forwarding for web bridge providers
 * Returns a Response if inject mode is enabled, or null if not
 */
export async function handleInjectRelay(provider, model, body, isStream) {
  const injectEnabled = isInjectModeEnabled(provider);
  log.info("INJECT_RELAY", `Check inject mode for ${provider}: ${injectEnabled}`);

  if (!injectEnabled) {
    return null; // Not inject mode, caller should continue with WS bridge
  }

  log.info("INJECT_RELAY", `Inject mode enabled for ${provider} — routing via inject relay`);

  // Build full prompt từ TOÀN BỘ messages — KHÔNG CẮT bất kỳ thứ gì
  const messages = Array.isArray(body.messages) ? body.messages : [];

  /**
   * Chuyển toàn bộ array messages thành 1 chuỗi prompt duy nhất
   * để inject vào web UI. Giữ nguyên role labels + nội dung.
   */
  function extractContent(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((p) => {
          if (typeof p === "string") return p;
          if (p?.type === "text") return p.text || "";
          if (p?.type === "image_url") return "[image]";
          return JSON.stringify(p);
        })
        .filter(Boolean)
        .join("\n");
    }
    return typeof content === "object" ? JSON.stringify(content) : String(content || "");
  }

  const promptParts = [];
  for (const msg of messages) {
    const role = (msg.role || "unknown").toUpperCase();
    const text = extractContent(msg.content);

    // Tool calls (function calling)
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      const toolStr = msg.tool_calls
        .map(tc => `Tool call: ${tc.function?.name || "unknown"}(${tc.function?.arguments || ""})`)
        .join("\n");
      promptParts.push(`[${role}]\n${text}\n${toolStr}`);
    } else if (msg.role === "tool") {
      // Tool response
      promptParts.push(`[TOOL RESPONSE (${msg.name || msg.tool_call_id || ""})]:\n${text}`);
    } else if (text) {
      promptParts.push(`[${role}]\n${text}`);
    }
  }

  const promptText = promptParts.join("\n\n---\n\n");
  log.info("INJECT_RELAY", `Built full prompt: ${messages.length} messages → ${promptText.length} chars`);

  // ── Tool Call Support: thêm hướng dẫn format nếu request có tools ──
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  let finalPromptText = promptText;

  if (hasTools) {
    // Thêm tool definitions và hướng dẫn format vào cuối prompt
    const toolDefs = body.tools.map(t => {
      const fn = t.function || t;
      const params = fn.parameters ? JSON.stringify(fn.parameters) : "{}";
      return `- ${fn.name}: ${fn.description || ""}\n  Parameters: ${params}`;
    }).join("\n");

    finalPromptText += `\n\n---\n\n[TOOL DEFINITIONS]\n${toolDefs}\n\n[CRITICAL INSTRUCTION - TOOL CALLING]\nBạn có quyền truy cập các tools ở trên. Khi thực hiện task, hãy tuân thủ CHÍNH XÁC các quy tắc sau:

1. **GOM TẤT CẢ tool calls vào MỘT response duy nhất.** KHÔNG BAO GIỜ chỉ gọi 1 tool rồi dừng lại chờ. Hãy phân tích TOÀN BỘ yêu cầu và gọi TẤT CẢ tools cần thiết cùng lúc.
   - Ví dụ: Nếu cần tạo file HTML + CSS + JS → gọi cả 3 tool write trong cùng 1 response.
   - Ví dụ: Nếu cần đọc file rồi sửa → gọi read + write trong cùng 1 response.

2. **Format BẮT BUỘC** khi gọi tools (không thêm text trước hoặc sau block này):
\`\`\`tool_calls
[{"name": "tool_name", "arguments": {"param1": "value1"}}, {"name": "tool_name2", "arguments": {"param2": "value2"}}]
\`\`\`

3. Nếu KHÔNG CẦN gọi tool, trả lời text bình thường.

4. **QUAN TRỌNG NHẤT:** Mỗi lần bạn trả lời là MỘT cơ hội DUY NHẤT. Không có lần thứ hai. Hãy gom hết mọi thứ cần làm vào 1 response.`;

    log.info("INJECT_RELAY", `Added ${body.tools.length} tool definitions to prompt`);
  }

  if (!finalPromptText) {
    return errorResponse(400, "Inject mode: không tìm thấy prompt text trong messages.");
  }

  log.info("INJECT_RELAY", `Final prompt size: ${finalPromptText.length} chars`);

  const { taskId, emitter } = createInjectTask(provider, finalPromptText, model);
  log.info("INJECT_RELAY", `Created inject task ${taskId} for ${provider}`);
  const responseModel = `${provider}/${model}`;

  // ── Tool call parser: extract tool_calls từ text response ──
  function parseToolCalls(text) {
    if (!hasTools || !text) return null;

    // Pattern 1: ```tool_calls\n[...]\n```
    const toolCallMatch = text.match(/```tool_calls\s*\n([\s\S]*?)```/);
    if (toolCallMatch) {
      try {
        const calls = JSON.parse(toolCallMatch[1].trim());
        if (Array.isArray(calls) && calls.length > 0) {
          return calls.map((c, i) => ({
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            type: "function",
            function: {
              name: c.name || c.function?.name || "",
              arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments || {}),
            },
          }));
        }
      } catch { /* parse failed */ }
    }

    // Pattern 2: ```json\n{"tool_calls": [...]}\n```
    const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        const calls = parsed.tool_calls || (Array.isArray(parsed) ? parsed : null);
        if (Array.isArray(calls) && calls.length > 0 && calls[0]?.name) {
          return calls.map((c, i) => ({
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            type: "function",
            function: {
              name: c.name || "",
              arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments || {}),
            },
          }));
        }
      } catch { /* parse failed */ }
    }

    // Pattern 3: tìm JSON trực tiếp trong text {"name": "...", "arguments": ...}
    const directMatch = text.match(/\[\s*\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\}\s*\]/);
    if (directMatch) {
      try {
        const calls = JSON.parse(directMatch[0]);
        if (Array.isArray(calls) && calls.length > 0 && calls[0]?.name) {
          return calls.map((c) => ({
            id: `call_${crypto.randomUUID().slice(0, 8)}`,
            type: "function",
            function: {
              name: c.name || "",
              arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments || {}),
            },
          }));
        }
      } catch { /* parse failed */ }
    }

    return null;
  }

  if (!isStream) {
    // Non-stream: chờ kết quả hoàn chỉnh
    try {
      const resultText = await waitForResult(taskId, 120_000);

      // Check tool calls
      const toolCalls = parseToolCalls(resultText);
      const message = toolCalls
        ? { role: "assistant", content: null, tool_calls: toolCalls }
        : { role: "assistant", content: resultText };

      return Response.json({
        id: `chatcmpl_${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: responseModel,
        choices: [{
          index: 0,
          message,
          finish_reason: toolCalls ? "tool_calls" : "stop",
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      });
    } catch (error) {
      return errorResponse(502, `Inject relay error: ${error?.message || "timeout"}`);
    }
  }

  // Stream mode
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      if (hasTools) {
        // ── CÓ TOOLS: buffer toàn bộ response, parse tool_calls cuối cùng ──
        let fullText = "";
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Inject relay stream timeout")), 120_000);

          emitter.on("delta", ({ delta, fullText: ft }) => {
            if (ft) fullText = ft;
            else if (delta) fullText += delta;
          });

          emitter.on("done", () => { clearTimeout(timeout); resolve(); });
          emitter.on("error", ({ error }) => { clearTimeout(timeout); reject(new Error(error || "Inject failed")); });
        });

        // Parse tool calls từ buffered text
        const toolCalls = parseToolCalls(fullText);

        if (toolCalls) {
          log.info("INJECT_RELAY", `Extracted ${toolCalls.length} tool call(s) from response`);
          const chunk = {
            id: `chatcmpl_${crypto.randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: responseModel,
            choices: [{
              index: 0,
              delta: { role: "assistant", content: null, tool_calls: toolCalls },
              finish_reason: "tool_calls",
            }],
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } else {
          const chunk = {
            id: `chatcmpl_${crypto.randomUUID()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: responseModel,
            choices: [{ index: 0, delta: { content: fullText }, finish_reason: "stop" }],
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        await writer.write(encoder.encode("data: [DONE]\n\n"));

      } else {
        // ── KHÔNG CÓ TOOLS: stream trực tiếp (nhanh hơn) ──
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Inject relay stream timeout")), 120_000);

          emitter.on("delta", async ({ delta }) => {
            if (delta) {
              const chunk = {
                id: `chatcmpl_${crypto.randomUUID()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: responseModel,
                choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
              };
              await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
          });

          emitter.on("done", async () => {
            clearTimeout(timeout);
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            resolve();
          });

          emitter.on("error", async ({ error }) => {
            clearTimeout(timeout);
            reject(new Error(error || "Inject failed"));
          });
        });
      }
    } catch (error) {
      const errPayload = {
        id: `chatcmpl_${crypto.randomUUID()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: responseModel,
        choices: [{ index: 0, delta: { content: `\n\n[Inject Relay Error: ${error?.message || "failed"}]` }, finish_reason: "stop" }],
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errPayload)}\n\n`));
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
