// Default pricing rates for AI models — NexusAI Gateway
// All rates are in dollars per million tokens ($/1M tokens)
// Only keeps: Codex (cx), Kiro (kr), OpenAI (openai)

export const DEFAULT_PRICING = {
  // OpenAI Codex (cx) - OAuth
  cx: {
    "gpt-5.3-codex": {
      input: 6.00,
      output: 24.00,
      cached: 3.00,
      reasoning: 36.00,
      cache_creation: 6.00
    },
    "gpt-5.3-codex-xhigh": {
      input: 10.00,
      output: 40.00,
      cached: 5.00,
      reasoning: 60.00,
      cache_creation: 10.00
    },
    "gpt-5.3-codex-high": {
      input: 8.00,
      output: 32.00,
      cached: 4.00,
      reasoning: 48.00,
      cache_creation: 8.00
    },
    "gpt-5.3-codex-low": {
      input: 4.00,
      output: 16.00,
      cached: 2.00,
      reasoning: 24.00,
      cache_creation: 4.00
    },
    "gpt-5.3-codex-none": {
      input: 3.00,
      output: 12.00,
      cached: 1.50,
      reasoning: 18.00,
      cache_creation: 3.00
    },
    "gpt-5.3-codex-spark": {
      input: 3.00,
      output: 12.00,
      cached: 0.30,
      reasoning: 12.00,
      cache_creation: 3.00
    },
    "gpt-5.2-codex": {
      input: 5.00,
      output: 20.00,
      cached: 2.50,
      reasoning: 30.00,
      cache_creation: 5.00
    },
    "gpt-5.2": {
      input: 5.00,
      output: 20.00,
      cached: 2.50,
      reasoning: 30.00,
      cache_creation: 5.00
    },
    "gpt-5.1-codex-max": {
      input: 8.00,
      output: 32.00,
      cached: 4.00,
      reasoning: 48.00,
      cache_creation: 8.00
    },
    "gpt-5.1-codex": {
      input: 4.00,
      output: 16.00,
      cached: 2.00,
      reasoning: 24.00,
      cache_creation: 4.00
    },
    "gpt-5.1-codex-mini": {
      input: 1.50,
      output: 6.00,
      cached: 0.75,
      reasoning: 9.00,
      cache_creation: 1.50
    },
    "gpt-5.1-codex-mini-high": {
      input: 2.00,
      output: 8.00,
      cached: 1.00,
      reasoning: 12.00,
      cache_creation: 2.00
    },
    "gpt-5.1": {
      input: 4.00,
      output: 16.00,
      cached: 2.00,
      reasoning: 24.00,
      cache_creation: 4.00
    },
    "gpt-5-codex": {
      input: 3.00,
      output: 12.00,
      cached: 1.50,
      reasoning: 18.00,
      cache_creation: 3.00
    },
    "gpt-5-codex-mini": {
      input: 1.00,
      output: 4.00,
      cached: 0.50,
      reasoning: 6.00,
      cache_creation: 1.00
    }
  },

  // Kiro AI (kr) - AWS CodeWhisperer (FREE)
  kr: {
    "claude-sonnet-4.5": {
      input: 3.00,
      output: 15.00,
      cached: 0.30,
      reasoning: 22.50,
      cache_creation: 3.00
    },
    "claude-haiku-4.5": {
      input: 0.50,
      output: 2.50,
      cached: 0.05,
      reasoning: 3.75,
      cache_creation: 0.50
    }
  },

  // OpenAI (API Key)
  openai: {
    "gpt-4o": {
      input: 2.50,
      output: 10.00,
      cached: 1.25,
      reasoning: 15.00,
      cache_creation: 2.50
    },
    "gpt-4o-mini": {
      input: 0.15,
      output: 0.60,
      cached: 0.075,
      reasoning: 0.90,
      cache_creation: 0.15
    },
    "gpt-4-turbo": {
      input: 10.00,
      output: 30.00,
      cached: 5.00,
      reasoning: 45.00,
      cache_creation: 10.00
    },
    "o1": {
      input: 15.00,
      output: 60.00,
      cached: 7.50,
      reasoning: 90.00,
      cache_creation: 15.00
    },
    "o1-mini": {
      input: 3.00,
      output: 12.00,
      cached: 1.50,
      reasoning: 18.00,
      cache_creation: 3.00
    }
  },
};

/**
 * Provider-agnostic fallback pricing, keyed by model base name.
 */
export const MODEL_PRICING = {};

/**
 * Get pricing for a specific provider and model.
 */
export function getModelPricing(providerAlias, modelId) {
  const providerPricing = DEFAULT_PRICING[providerAlias];
  if (providerPricing) {
    if (providerPricing[modelId]) return providerPricing[modelId];
    const baseName = modelId.split("/").pop();
    if (baseName !== modelId && providerPricing[baseName]) return providerPricing[baseName];
  }
  const baseName = modelId.includes("/") ? modelId.split("/").pop() : modelId;
  if (MODEL_PRICING[baseName]) return MODEL_PRICING[baseName];
  return null;
}

/**
 * Default fallback pricing (used when no specific pricing found)
 */
export const DEFAULT_FALLBACK_PRICING = {
  input: 2.00,
  output: 8.00,
  cached: 1.00,
  reasoning: 12.00,
  cache_creation: 2.00
};

/**
 * Get default pricing
 */
export function getDefaultPricing() {
  return JSON.parse(JSON.stringify(DEFAULT_PRICING));
}
