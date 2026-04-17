import { describe, expect, it } from "vitest";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { hasValuableContent } from "../../open-sse/utils/streamHelpers.js";
import { extractUsage, inferReasoningUsage } from "../../open-sse/utils/usageTracking.js";

describe("OpenAI stream usage handling", () => {
  it("keeps usage-only stream chunks so reasoning is not lost", () => {
    const chunk = {
      id: "chatcmpl-usage",
      choices: [],
      usage: {
        prompt_tokens: 2548,
        completion_tokens: 141,
        completion_tokens_details: {
          reasoning_tokens: 169,
        },
      },
    };

    expect(hasValuableContent(chunk, FORMATS.OPENAI)).toBe(true);
  });

  it("extracts reasoning tokens from nested completion details", () => {
    const chunk = {
      usage: {
        prompt_tokens: 2548,
        completion_tokens: 141,
        completion_tokens_details: {
          reasoning_tokens: 169,
        },
      },
    };

    expect(extractUsage(chunk)).toEqual({
      prompt_tokens: 2548,
      completion_tokens: 141,
      reasoning_tokens: 169,
    });
  });

  it("still drops empty chunks with no delta and no usage", () => {
    const chunk = {
      id: "chatcmpl-empty",
      choices: [],
    };

    expect(hasValuableContent(chunk, FORMATS.OPENAI)).toBe(false);
  });

  it("infers hidden reasoning tokens when completion is much larger than visible output", () => {
    const usage = inferReasoningUsage({
      usage: {
        prompt_tokens: 2668,
        completion_tokens: 879,
        total_tokens: 3547,
      },
      body: {
        reasoning: {
          effort: "xhigh",
        },
      },
      content: "Đúng: đáp án D. 8.\n\nMọi walk độ dài 4 từ u đến v phải có dạng ...",
      thinking: "",
    });

    expect(usage.reasoning_tokens).toBeGreaterThan(0);
    expect(usage.completion_tokens).toBeLessThan(879);
    expect((usage.completion_tokens || 0) + (usage.reasoning_tokens || 0)).toBe(879);
  });
});
