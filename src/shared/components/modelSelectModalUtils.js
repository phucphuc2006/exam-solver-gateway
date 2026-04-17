import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/providers";

export const WEB_BRIDGE_PROVIDERS = {
  "chatgpt-web": {
    id: "chatgpt-web",
    alias: "chatgpt-web",
    name: "ChatGPT Web Bridge",
    color: "#10A37F",
  },
  "gemini-web": {
    id: "gemini-web",
    alias: "gemini-web",
    name: "Gemini Web Bridge",
    color: "#4285F4",
  },
  "grok-web": {
    id: "grok-web",
    alias: "grok-web",
    name: "Grok Web Bridge",
    color: "#F97316",
  },
};

// Provider order: OAuth first, then API Key (matches dashboard/providers)
export const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(WEB_BRIDGE_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

export function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function normalizeWebBridgeModelEntries(providerId, availableModels = []) {
  const rawEntries = Array.isArray(availableModels) ? availableModels : [];
  const seen = new Set();
  const normalized = [];

  for (const entry of rawEntries) {
    const isObjectEntry = entry && typeof entry === "object" && !Array.isArray(entry);
    const rawId = isObjectEntry
      ? normalizeString(entry.id || entry.slug || entry.model_slug || entry.value || entry.name || entry.title || entry.label)
      : normalizeString(entry);
    if (!rawId) continue;

    const value = rawId.startsWith(`${providerId}/`) ? rawId : `${providerId}/${rawId}`;
    if (seen.has(value)) continue;
    seen.add(value);

    const displayName = isObjectEntry
      ? normalizeString(entry.title || entry.name || entry.label || entry.display_name || rawId)
      : rawId;

    normalized.push({
      id: rawId,
      name: displayName || rawId,
      value,
    });
  }

  if (normalized.length > 0) {
    return normalized;
  }

  if (providerId === "chatgpt-web") {
    return [{ id: "auto", name: "Auto", value: "chatgpt-web/auto" }];
  }

  return [];
}
