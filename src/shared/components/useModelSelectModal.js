import { useState, useMemo, useEffect } from "react";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { WEB_BRIDGE_PROVIDERS, PROVIDER_ORDER, normalizeWebBridgeModelEntries } from "./modelSelectModalUtils";

export function useModelSelectModal({ isOpen, activeProviders = [], modelAliases = {} }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [webBridgeProviders, setWebBridgeProviders] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/combos")
        .then(res => res.json())
        .then(data => setCombos(data.combos || []))
        .catch(() => setCombos([]));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/provider-nodes")
        .then(res => res.json())
        .then(data => setProviderNodes(data.nodes || []))
        .catch(() => setProviderNodes([]));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;

    const fetchWebBridgeProviders = async () => {
      try {
        const requests = [
          { provider: "chatgpt-web", url: "/api/chatgpt-web/session" },
          { provider: "gemini-web", url: "/api/gemini-web/session" },
          { provider: "grok-web", url: "/api/grok-web/session" },
        ];

        const responses = await Promise.all(
          requests.map(async ({ provider, url }) => {
            try {
              const res = await fetch(url, { cache: "no-store" });
              if (!res.ok) return null;
              const data = await res.json();
              const session = data?.session;
              if (!session) return null;

              const models = normalizeWebBridgeModelEntries(provider, session.availableModels);
              return {
                provider,
                name: WEB_BRIDGE_PROVIDERS[provider]?.name || provider,
                isActive: true,
                authType: "web-bridge",
                providerSpecificData: {
                  availableModels: models,
                  source: "web-bridge",
                  status: session.status || null,
                },
              };
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setWebBridgeProviders(responses.filter(Boolean));
        }
      } catch {
        if (!cancelled) {
          setWebBridgeProviders([]);
        }
      }
    };

    fetchWebBridgeProviders();
    return () => { cancelled = true; };
  }, [isOpen]);

  const allProviders = useMemo(() => ({ ...OAUTH_PROVIDERS, ...WEB_BRIDGE_PROVIDERS, ...APIKEY_PROVIDERS }), []);
  const mergedActiveProviders = useMemo(() => {
    const byProvider = new Map();
    for (const provider of activeProviders) {
      if (provider?.provider) byProvider.set(provider.provider, provider);
    }
    for (const provider of webBridgeProviders) {
      if (provider?.provider) byProvider.set(provider.provider, provider);
    }
    return Array.from(byProvider.values());
  }, [activeProviders, webBridgeProviders]);

  const groupedModels = useMemo(() => {
    const groups = {};
    const activeConnectionIds = mergedActiveProviders.map((p) => p.provider);
    const providerIdsToShow = new Set([...activeConnectionIds]);

    const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
      const indexA = PROVIDER_ORDER.indexOf(a);
      const indexB = PROVIDER_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    sortedProviderIds.forEach((providerId) => {
      const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);
      const connection = mergedActiveProviders.find((p) => p.provider === providerId);

      if (WEB_BRIDGE_PROVIDERS[providerId]) {
        const bridgeModels = normalizeWebBridgeModelEntries(
          providerId,
          connection?.providerSpecificData?.availableModels,
        );

        if (bridgeModels.length > 0) {
          groups[providerId] = {
            name: connection?.name || providerInfo.name,
            alias: providerId,
            color: providerInfo.color,
            models: bridgeModels,
            isWebBridge: true,
          };
        }
        return;
      }

      if (providerInfo.passthroughModels) {
        const aliasModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${alias}/`, ""),
            name: aliasName,
            value: fullModel,
          }));

        if (aliasModels.length > 0) {
          const matchedNode = providerNodes.find(node => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: aliasModels,
          };
        }
      } else if (isCustomProvider) {
        const matchedNode = providerNodes.find(node => node.id === providerId);
        const displayName = connection?.name || matchedNode?.name || providerInfo.name;
        const nodePrefix = connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          }));

        const modelsToShow = nodeModels.length > 0 ? nodeModels : [{
          id: `__placeholder__${providerId}`,
          name: `${nodePrefix}/model-id`,
          value: `${nodePrefix}/model-id`,
          isPlaceholder: true,
        }];

        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: modelsToShow,
          isCustom: true,
          hasModels: nodeModels.length > 0,
        };
      } else {
        const hardcodedModels = getModelsByProviderId(providerId);
        const hardcodedIds = new Set(hardcodedModels.map((m) => m.id));

        const customModels = Object.entries(modelAliases)
          .filter(([aliasName, fullModel]) =>
            fullModel.startsWith(`${alias}/`) &&
            aliasName === fullModel.replace(`${alias}/`, "") &&
            !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
          )
          .map(([, fullModel]) => {
            const modelId = fullModel.replace(`${alias}/`, "");
            return { id: modelId, name: modelId, value: fullModel, isCustom: true };
          });

        const allModels = [
          ...hardcodedModels.map((m) => ({ id: m.id, name: m.name, value: `${alias}/${m.id}` })),
          ...customModels,
        ];

        if (allModels.length > 0) {
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    return groups;
  }, [mergedActiveProviders, modelAliases, allProviders, providerNodes]);

  const filteredCombos = useMemo(() => {
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter(c => c.name.toLowerCase().includes(query));
  }, [combos, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;
    const query = searchQuery.toLowerCase();
    const filtered = {};

    Object.entries(groupedModels).forEach(([providerId, group]) => {
      const matchedModels = group.models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
      );
      const providerNameMatches = group.name.toLowerCase().includes(query);

      if (matchedModels.length > 0 || providerNameMatches) {
        filtered[providerId] = {
          ...group,
          models: matchedModels,
        };
      }
    });

    return filtered;
  }, [groupedModels, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    combos,
    filteredCombos,
    providerNodes,
    webBridgeProviders,
    groupedModels,
    filteredGroups,
  };
}
