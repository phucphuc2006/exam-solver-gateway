// ── ChatGPT Web Bridge — Model Discovery & Resolution ──

import { normalizeString, safeParseJson } from "./constants.js";

function parseModelItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.models)) {
    return payload.models;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (payload?.categories && typeof payload.categories === "object") {
    return Object.values(payload.categories).flatMap((entry) => {
      if (Array.isArray(entry)) return entry;
      if (Array.isArray(entry?.models)) return entry.models;
      return [];
    });
  }

  return [];
}

export function normalizeChatgptWebModels(payload) {
  const seen = new Set();
  const models = [];

  for (const item of parseModelItems(payload)) {
    const id = normalizeString(
      item?.slug
      || item?.id
      || item?.model
      || item?.name,
    );

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    models.push({
      id,
      name: normalizeString(item?.title || item?.display_name || item?.name) || id,
      description: normalizeString(item?.description || item?.category) || null,
    });
  }

  return models;
}

function normalizeChatgptWebModelLookupKey(value) {
  return normalizeString(value).toLowerCase().replace(/[\s._-]+/g, "");
}

function findStoredChatgptWebModelId(availableModels = [], requestedModel = "") {
  const lookupKey = normalizeChatgptWebModelLookupKey(requestedModel);
  if (!lookupKey) {
    return "";
  }

  const exactMatch = availableModels.find((entry) => (
    normalizeChatgptWebModelLookupKey(entry?.id) === lookupKey
  ));

  return normalizeString(exactMatch?.id);
}

export function resolveChatgptWebModel(rawModel, availableModels = []) {
  const storedModelId = findStoredChatgptWebModelId(availableModels, rawModel);
  if (storedModelId) {
    return storedModelId;
  }

  const lowerModel = normalizeString(rawModel).toLowerCase();
  if (!lowerModel) {
    return "auto";
  }

  if (lowerModel.includes("gpt-3.5")) return "text-davinci-002-render-sha";
  if (lowerModel.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (lowerModel.includes("gpt-4o")) return "gpt-4o";
  if (lowerModel.includes("gpt-4")) return "gpt-4";
  if (lowerModel.includes("o1-preview")) return "o1-preview";
  if (lowerModel.includes("o3-mini")) return "o3-mini";
  if (lowerModel.includes("o1-mini")) return "o1-mini";
  if (lowerModel.includes("o1")) return "o1";

  return lowerModel;
}
