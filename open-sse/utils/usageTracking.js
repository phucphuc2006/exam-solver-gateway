/**
 * Token Usage Tracking - Extract, normalize, estimate and log token usage
 */

import { saveRequestUsage, appendRequestLog } from "@/lib/usageDb/index.js";
import { FORMATS } from "../translator/formats.js";

// ANSI color codes
export const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Buffer tokens to prevent context errors
const BUFFER_TOKENS = 2000;
const MIN_REASONING_GAP_TOKENS = 32;
const MIN_REASONING_GAP_RATIO = 0.15;

function getReasoningTokens(usage) {
  if (!usage || typeof usage !== "object") return 0;
  const candidates = [
    usage.reasoning_tokens,
    usage.output_tokens_details?.reasoning_tokens,
    usage.completion_tokens_details?.reasoning_tokens,
    usage.thoughtsTokenCount,
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return 0;
}

// Get HH:MM:SS timestamp
function getTimeString() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Add buffer tokens to usage to prevent context errors
 * @param {object} usage - Usage object (any format)
 * @returns {object} Usage with buffer added
 */
export function addBufferToUsage(usage) {
  if (!usage || typeof usage !== "object") return usage;

  const result = { ...usage };

  // Claude format
  if (result.input_tokens !== undefined) {
    result.input_tokens += BUFFER_TOKENS;
  }

  // OpenAI format
  if (result.prompt_tokens !== undefined) {
    result.prompt_tokens += BUFFER_TOKENS;
  }

  // Calculate or update total_tokens
  if (result.total_tokens !== undefined) {
    result.total_tokens += BUFFER_TOKENS;
  } else if (result.prompt_tokens !== undefined && result.completion_tokens !== undefined) {
    // Calculate total_tokens if not exists
    result.total_tokens = result.prompt_tokens + result.completion_tokens;
  }

  return result;
}

export function filterUsageForFormat(usage, targetFormat) {
  if (!usage || typeof usage !== "object") return usage;

  // Helper to pick only defined fields from usage
  const pickFields = (fields) => {
    const filtered = {};
    for (const field of fields) {
      if (usage[field] !== undefined) {
        filtered[field] = usage[field];
      }
    }
    return filtered;
  };

  // Define allowed fields for each format
  const formatFields = {
    [FORMATS.CLAUDE]: [
      'input_tokens', 'output_tokens', 
      'cache_read_input_tokens', 'cache_creation_input_tokens',
      'estimated'
    ],
    [FORMATS.GEMINI]: [
      'promptTokenCount', 'candidatesTokenCount', 'totalTokenCount',
      'cachedContentTokenCount', 'thoughtsTokenCount',
      'estimated'
    ],
    [FORMATS.OPENAI_RESPONSES]: [
      'input_tokens', 'output_tokens',
      'input_tokens_details', 'output_tokens_details',
      'estimated'
    ],
    // OpenAI format (default for OPENAI, CODEX, KIRO, etc.)
    default: [
      'prompt_tokens', 'completion_tokens', 'total_tokens',
      'cached_tokens', 'reasoning_tokens',
      'prompt_tokens_details', 'completion_tokens_details',
      'estimated'
    ]
  };

  // Get fields for target format
  let fields = formatFields[targetFormat];
  
  // Use same fields for similar formats
  if (targetFormat === FORMATS.GEMINI_CLI || targetFormat === FORMATS.ANTIGRAVITY) {
    fields = formatFields[FORMATS.GEMINI];
  } else if (targetFormat === FORMATS.OPENAI_RESPONSE) {
    fields = formatFields[FORMATS.OPENAI_RESPONSES];
  } else if (!fields) {
    fields = formatFields.default;
  }

  return pickFields(fields);
}

/**
 * Normalize usage object - ensure all values are valid numbers
 */
export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;

  const normalized = {};
  const assignNumber = (key, value) => {
    if (value === undefined || value === null) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) normalized[key] = numeric;
  };

  assignNumber("prompt_tokens", usage?.prompt_tokens);
  assignNumber("completion_tokens", usage?.completion_tokens);
  assignNumber("total_tokens", usage?.total_tokens);
  assignNumber("cache_read_input_tokens", usage?.cache_read_input_tokens);
  assignNumber("cache_creation_input_tokens", usage?.cache_creation_input_tokens);
  assignNumber("cached_tokens", usage?.cached_tokens);
  assignNumber("reasoning_tokens", getReasoningTokens(usage));

  if (Object.keys(normalized).length === 0) return null;
  return normalized;
}

/**
 * Check if usage has valid token data
 * Valid = has at least one token field with value > 0
 * Invalid = empty object {}, null, undefined, no token fields, or all zeros
 */
export function hasValidUsage(usage) {
  if (!usage || typeof usage !== "object") return false;

  // Check for any known token field with value > 0
  const tokenFields = [
    "prompt_tokens", "completion_tokens", "total_tokens",  // OpenAI
    "input_tokens", "output_tokens",                        // Claude
    "promptTokenCount", "candidatesTokenCount",             // Gemini
    "reasoning_tokens", "thoughtsTokenCount"
  ];

  for (const field of tokenFields) {
    if (typeof usage[field] === "number" && usage[field] > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Extract usage from any format (Claude, OpenAI, Gemini, Responses API)
 */
export function extractUsage(chunk) {
  if (!chunk || typeof chunk !== "object") return null;

  // Claude format (message_delta event)
  if (chunk.type === "message_delta" && chunk.usage && typeof chunk.usage === "object") {
    return normalizeUsage({
      prompt_tokens: chunk.usage.input_tokens || 0,
      completion_tokens: chunk.usage.output_tokens || 0,
      cache_read_input_tokens: chunk.usage.cache_read_input_tokens,
      cache_creation_input_tokens: chunk.usage.cache_creation_input_tokens
    });
  }

  // OpenAI Responses API format (response.completed or response.done)
  if ((chunk.type === "response.completed" || chunk.type === "response.done") && chunk.response?.usage && typeof chunk.response.usage === "object") {
    const usage = chunk.response.usage;
    return normalizeUsage({
      prompt_tokens: usage.input_tokens || usage.prompt_tokens || 0,
      completion_tokens: usage.output_tokens || usage.completion_tokens || 0,
      cached_tokens: usage.input_tokens_details?.cached_tokens,
      reasoning_tokens: usage.reasoning_tokens || usage.output_tokens_details?.reasoning_tokens || usage.completion_tokens_details?.reasoning_tokens
    });
  }

  // OpenAI format
  if (chunk.usage && typeof chunk.usage === "object" && chunk.usage.prompt_tokens !== undefined) {
    return normalizeUsage({
      prompt_tokens: chunk.usage.prompt_tokens,
      completion_tokens: chunk.usage.completion_tokens || 0,
      cached_tokens: chunk.usage.prompt_tokens_details?.cached_tokens,
      reasoning_tokens: getReasoningTokens(chunk.usage)
    });
  }

  // Gemini format (Antigravity)
  // Antigravity wraps usageMetadata inside response: { response: { usageMetadata: {...} } }
  const usageMeta = chunk.usageMetadata || chunk.response?.usageMetadata;
  if (usageMeta && typeof usageMeta === "object") {
    return normalizeUsage({
      prompt_tokens: usageMeta.promptTokenCount || 0,
      completion_tokens: usageMeta.candidatesTokenCount || 0,
      total_tokens: usageMeta.totalTokenCount,
      cached_tokens: usageMeta.cachedContentTokenCount,
      reasoning_tokens: usageMeta.thoughtsTokenCount
    });
  }

  return null;
}

/**
 * Estimate input tokens from request body
 * Calculate total body size for more accurate estimation
 */
export function estimateInputTokens(body) {
  if (!body || typeof body !== "object") return 0;

  try {
    // Calculate total body size (includes messages, tools, system, thinking config, etc.)
    const bodyStr = JSON.stringify(body);
    const totalChars = bodyStr.length;

    // Estimate: ~4 chars per token (rough average across all tokenizers)
    return Math.ceil(totalChars / 4);
  } catch (err) {
    // Fallback if stringify fails
    return 0;
  }
}

/**
 * Estimate output tokens from content length
 */
export function estimateOutputTokens(contentLength) {
  if (!contentLength || contentLength <= 0) return 0;
  return Math.max(1, Math.floor(contentLength / 4));
}

function getEffortLevel(body) {
  if (!body || typeof body !== "object") return null;

  const effort = body.reasoning?.effort || body.reasoning_effort || null;
  return typeof effort === "string" ? effort.toLowerCase() : null;
}

export function inferReasoningUsage({ usage, body, content = "", thinking = "" }) {
  if (!usage || typeof usage !== "object") return usage;

  const effort = getEffortLevel(body);
  if (!effort || effort === "none") {
    return usage;
  }

  const explicitReasoning = getReasoningTokens(usage);
  if (explicitReasoning > 0) {
    return usage;
  }

  const completionTokens = Number(
    usage.completion_tokens ??
    usage.output_tokens ??
    0
  ) || 0;

  if (completionTokens <= 0) {
    return usage;
  }

  const contentLength = typeof content === "string" ? content.length : 0;
  const visibleCompletionTokens = estimateOutputTokens(contentLength);
  const hiddenGap = Math.max(0, completionTokens - visibleCompletionTokens);
  const gapRatio = completionTokens > 0 ? hiddenGap / completionTokens : 0;
  const thinkingLength = typeof thinking === "string" ? thinking.length : 0;

  const shouldInfer =
    hiddenGap >= MIN_REASONING_GAP_TOKENS &&
    gapRatio >= MIN_REASONING_GAP_RATIO &&
    (
      thinkingLength > 0 ||
      effort === "medium" ||
      effort === "high" ||
      effort === "xhigh"
    );

  if (!shouldInfer) {
    return usage;
  }

  const normalized = { ...usage };
  const visibleTokens = Math.max(1, visibleCompletionTokens);

  if (normalized.completion_tokens !== undefined) {
    normalized.completion_tokens = visibleTokens;
  }
  if (normalized.output_tokens !== undefined) {
    normalized.output_tokens = visibleTokens;
  }

  normalized.reasoning_tokens = hiddenGap;

  if (normalized.completion_tokens_details && typeof normalized.completion_tokens_details === "object") {
    normalized.completion_tokens_details = {
      ...normalized.completion_tokens_details,
      reasoning_tokens: hiddenGap,
    };
  } else {
    normalized.completion_tokens_details = { reasoning_tokens: hiddenGap };
  }

  if (normalized.output_tokens_details && typeof normalized.output_tokens_details === "object") {
    normalized.output_tokens_details = {
      ...normalized.output_tokens_details,
      reasoning_tokens: hiddenGap,
    };
  }

  const promptTokens = Number(
    normalized.prompt_tokens ??
    normalized.input_tokens ??
    0
  ) || 0;

  if (normalized.total_tokens !== undefined || promptTokens > 0) {
    normalized.total_tokens = promptTokens + visibleTokens + hiddenGap;
  }

  return normalized;
}

/**
 * Format usage object based on target format
 * @param {number} inputTokens - Input/prompt tokens
 * @param {number} outputTokens - Output/completion tokens
 * @param {string} targetFormat - Target format from FORMATS
 */
export function formatUsage(inputTokens, outputTokens, targetFormat) {
  // Claude format uses input_tokens/output_tokens
  if (targetFormat === FORMATS.CLAUDE) {
    return addBufferToUsage({ 
      input_tokens: inputTokens, 
      output_tokens: outputTokens, 
      estimated: true 
    });
  }

  // Default: OpenAI format (works for openai, gemini, responses, etc.)
  return addBufferToUsage({
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated: true
  });
}

/**
 * Estimate full usage when provider doesn't return it
 * @param {object} body - Request body for input token estimation
 * @param {number} contentLength - Content length for output token estimation
 * @param {string} targetFormat - Target format from FORMATS constant
 */
export function estimateUsage(body, contentLength, targetFormat = FORMATS.OPENAI) {
  return formatUsage(
    estimateInputTokens(body),
    estimateOutputTokens(contentLength),
    targetFormat
  );
}

/**
 * Log usage with cache info (green color)
 */
export function logUsage(provider, usage, model = null, connectionId = null, apiKey = null) {
  if (!usage || typeof usage !== "object") return;

  const p = provider?.toUpperCase() || "UNKNOWN";

  // Support both formats:
  // - OpenAI: prompt_tokens, completion_tokens
  // - Claude: input_tokens, output_tokens
  const inTokens = usage?.prompt_tokens || usage?.input_tokens || 0;
  const outTokens = usage?.completion_tokens || usage?.output_tokens || 0;
  const accountPrefix = connectionId ? connectionId.slice(0, 8) + "..." : "unknown";

  let msg = `[${getTimeString()}] 📊 ${COLORS.green}[USAGE] ${p} | in=${inTokens} | out=${outTokens} | account=${accountPrefix}${COLORS.reset}`;

  // Add estimated flag if present
  if (usage.estimated) {
    msg += ` ${COLORS.yellow}(estimated)${COLORS.reset}`;
  }

  // Add cache info if present (unified from different formats)
  const cacheRead = usage.cache_read_input_tokens || usage.cached_tokens;
  if (cacheRead) msg += ` | cache_read=${cacheRead}`;

  const cacheCreation = usage.cache_creation_input_tokens;
  if (cacheCreation) msg += ` | cache_create=${cacheCreation}`;

  const reasoning = getReasoningTokens(usage);
  if (reasoning) msg += ` | reasoning=${reasoning}`;

  console.log(msg);

  // Save to usage DB
  const tokens = {
    prompt_tokens: inTokens,
    completion_tokens: outTokens,
    cache_read_input_tokens: cacheRead || 0,
    cache_creation_input_tokens: cacheCreation || 0,
    reasoning_tokens: reasoning || 0
  };
  saveRequestUsage({ model, provider, connectionId, tokens, apiKey: apiKey || undefined }).catch(() => { });
  appendRequestLog({ model, provider, connectionId, tokens, status: "200 OK" }).catch(() => { });
}
