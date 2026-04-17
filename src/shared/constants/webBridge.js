export const WEB_BRIDGE_PROVIDER_IDS = [
  "chatgpt-web",
  "gemini-web",
  "grok-web",
];

export const WEB_BRIDGE_PROTOCOL_OPENAI = "nexus-wb-openai.v1";
export const WEB_BRIDGE_PROTOCOL_NATIVE = "nexus-wb-native.v1";
export const WEB_BRIDGE_CONTROL_PROTOCOL = "nexus-wb-control.v1";

export const WEB_BRIDGE_PROTOCOLS = [
  WEB_BRIDGE_PROTOCOL_OPENAI,
  WEB_BRIDGE_PROTOCOL_NATIVE,
];

export function isWebBridgeProvider(provider) {
  return WEB_BRIDGE_PROVIDER_IDS.includes(String(provider || "").trim());
}

export function extractWebBridgeProviderFromModel(model) {
  const normalized = String(model || "").trim();
  if (!normalized) {
    return "";
  }

  const [firstSegment] = normalized.split("/");
  return isWebBridgeProvider(firstSegment) ? firstSegment : "";
}

export function stripWebBridgeProviderPrefix(model, expectedProvider = "") {
  const normalizedModel = String(model || "").trim();
  if (!normalizedModel) {
    return "";
  }

  const detectedProvider = extractWebBridgeProviderFromModel(normalizedModel);
  if (!detectedProvider) {
    return normalizedModel;
  }

  const normalizedExpectedProvider = String(expectedProvider || "").trim();
  if (normalizedExpectedProvider && detectedProvider !== normalizedExpectedProvider) {
    return normalizedModel;
  }

  const firstSlashIndex = normalizedModel.indexOf("/");
  if (firstSlashIndex <= 0 || firstSlashIndex >= normalizedModel.length - 1) {
    return normalizedModel;
  }

  return normalizedModel.slice(firstSlashIndex + 1).trim();
}

export function isWebBridgeModel(model) {
  return Boolean(extractWebBridgeProviderFromModel(model));
}
