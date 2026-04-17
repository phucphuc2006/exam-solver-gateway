// ── Local DB — Pricing CRUD ──

import { getDb, safeWrite } from "./core.js";

/**
 * Get pricing configuration
 * Returns merged user pricing with defaults
 */
export async function getPricing() {
  const db = await getDb();
  const userPricing = db.data.pricing || {};

  // Import default pricing
  const { getDefaultPricing } = await import("@/shared/constants/pricing.js");
  const defaultPricing = getDefaultPricing();

  // Merge user pricing with defaults
  // User pricing overrides defaults for specific provider/model combinations
  const mergedPricing = {};

  for (const [provider, models] of Object.entries(defaultPricing)) {
    mergedPricing[provider] = { ...models };

    // Apply user overrides if they exist
    if (userPricing[provider]) {
      for (const [model, pricing] of Object.entries(userPricing[provider])) {
        if (mergedPricing[provider][model]) {
          mergedPricing[provider][model] = { ...mergedPricing[provider][model], ...pricing };
        } else {
          mergedPricing[provider][model] = pricing;
        }
      }
    }
  }

  // Add any user-only pricing entries
  for (const [provider, models] of Object.entries(userPricing)) {
    if (!mergedPricing[provider]) {
      mergedPricing[provider] = { ...models };
    } else {
      for (const [model, pricing] of Object.entries(models)) {
        if (!mergedPricing[provider][model]) {
          mergedPricing[provider][model] = pricing;
        }
      }
    }
  }

  return mergedPricing;
}

/**
 * Get pricing for a specific provider and model
 */
export async function getPricingForModel(provider, model) {
  const pricing = await getPricing();

  // Try direct lookup
  if (pricing[provider]?.[model]) {
    return pricing[provider][model];
  }

  // Try mapping provider ID to alias
  const PROVIDER_ID_TO_ALIAS = {
    claude: "cc",
    codex: "cx",
    "gemini-cli": "gc",
    qwen: "qw",
    iflow: "if",
    antigravity: "ag",
    github: "gh",
    kiro: "kr",
    openai: "openai",
    anthropic: "anthropic",
    gemini: "gemini",
    openrouter: "openrouter",
    glm: "glm",
    kimi: "kimi",
    minimax: "minimax",
  };

  const alias = PROVIDER_ID_TO_ALIAS[provider];
  if (alias && pricing[alias]) {
    return pricing[alias][model] || null;
  }

  // Fallback: strip vendor prefix (e.g. "deepseek/deepseek-chat" → "deepseek-chat")
  // then lookup in MODEL_PRICING (provider-agnostic explicit map)
  const { MODEL_PRICING } = await import("@/shared/constants/pricing.js");
  const baseModel = model.includes("/") ? model.split("/").pop() : model;
  return MODEL_PRICING[baseModel] || MODEL_PRICING[model] || null;
}

/**
 * Update pricing configuration
 * @param {object} pricingData - New pricing data to merge
 */
export async function updatePricing(pricingData) {
  const db = await getDb();

  // Ensure pricing object exists
  if (!db.data.pricing) {
    db.data.pricing = {};
  }

  // Merge new pricing data
  for (const [provider, models] of Object.entries(pricingData)) {
    if (!db.data.pricing[provider]) {
      db.data.pricing[provider] = {};
    }

    for (const [model, pricing] of Object.entries(models)) {
      db.data.pricing[provider][model] = pricing;
    }
  }

  await safeWrite(db);
  return db.data.pricing;
}

/**
 * Reset pricing to defaults for specific provider/model
 * @param {string} provider - Provider ID
 * @param {string} model - Model ID (optional, if not provided resets entire provider)
 */
export async function resetPricing(provider, model) {
  const db = await getDb();

  if (!db.data.pricing) {
    db.data.pricing = {};
  }

  if (model) {
    // Reset specific model
    if (db.data.pricing[provider]) {
      delete db.data.pricing[provider][model];
      // Clean up empty provider objects
      if (Object.keys(db.data.pricing[provider]).length === 0) {
        delete db.data.pricing[provider];
      }
    }
  } else {
    // Reset entire provider
    delete db.data.pricing[provider];
  }

  await safeWrite(db);
  return db.data.pricing;
}

/**
 * Reset all pricing to defaults
 */
export async function resetAllPricing() {
  const db = await getDb();
  db.data.pricing = {};
  await safeWrite(db);
  return db.data.pricing;
}
