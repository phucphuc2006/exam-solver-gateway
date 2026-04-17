import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function readStream(readable) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

describe("Responses SSE event pairing", () => {
  let tempDir = "";

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-stream-"));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps response.completed event name for usage-only Codex chunks", async () => {
    const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.js");
    const encoder = new TextEncoder();

    const transform = createSSETransformStreamWithLogger(
      "openai-responses",
      "openai",
      "codex",
      null,
      null,
      "gpt-5.4",
      "conn-1",
      { messages: [{ role: "user", content: "hi" }] },
      null,
      "test-key",
    );

    const writer = transform.writable.getWriter();
    await writer.write(
      encoder.encode(
        'event: response.completed\ndata: {"response":{"usage":{"input_tokens":10,"output_tokens":5,"output_tokens_details":{"reasoning_tokens":3}}}}\n\n',
      ),
    );
    await writer.close();

    const output = await readStream(transform.readable);

    expect(output).toContain('"reasoning_tokens":3');
    expect(output).toContain('"finish_reason":"stop"');
  });

  it("keeps response.completed event name when final data stays in flush buffer", async () => {
    const { createSSETransformStreamWithLogger } = await import("../../open-sse/utils/stream.js");
    const encoder = new TextEncoder();

    const transform = createSSETransformStreamWithLogger(
      "openai-responses",
      "openai",
      "codex",
      null,
      null,
      "gpt-5.4",
      "conn-1",
      { messages: [{ role: "user", content: "hi" }] },
      null,
      "test-key",
    );

    const writer = transform.writable.getWriter();
    await writer.write(
      encoder.encode(
        'event: response.completed\ndata: {"response":{"usage":{"input_tokens":10,"output_tokens":5,"output_tokens_details":{"reasoning_tokens":7}}}}',
      ),
    );
    await writer.close();

    const output = await readStream(transform.readable);

    expect(output).toContain('"reasoning_tokens":7');
    expect(output).toContain('"finish_reason":"stop"');
  });
});
