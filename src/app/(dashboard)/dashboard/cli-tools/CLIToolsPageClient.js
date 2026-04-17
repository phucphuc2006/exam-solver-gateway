"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge, Card, CardSkeleton } from "@/shared/components";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { useRuntimeLocale } from "@/i18n/useRuntimeLocale";
import { ClaudeToolCard, CodexToolCard, DroidToolCard, OpenClawToolCard, DefaultToolCard, OpenCodeToolCard } from "./components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

const WEB_BRIDGE_PROVIDERS = [
  { provider: "chatgpt-web", name: "ChatGPT Web Bridge", url: "/api/chatgpt-web/session" },
  { provider: "gemini-web", name: "Gemini Web Bridge", url: "/api/gemini-web/session" },
  { provider: "grok-web", name: "Grok Web Bridge", url: "/api/grok-web/session" },
];

const STATUS_ENDPOINTS = {
  claude: "/api/cli-tools/claude-settings",
  codex: "/api/cli-tools/codex-settings",
  opencode: "/api/cli-tools/opencode-settings",
  droid: "/api/cli-tools/droid-settings",
  openclaw: "/api/cli-tools/openclaw-settings",
};

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeWebBridgeModels(providerId, availableModels = []) {
  const rawEntries = Array.isArray(availableModels) ? availableModels : [];
  const seen = new Set();
  const normalized = [];

  for (const entry of rawEntries) {
    const isObjectEntry = entry && typeof entry === "object" && !Array.isArray(entry);
    const rawId = isObjectEntry
      ? normalizeString(entry.id || entry.slug || entry.model_slug || entry.value || entry.name || entry.title || entry.label)
      : normalizeString(entry);

    if (!rawId) continue;

    const modelId = rawId.startsWith(`${providerId}/`) ? rawId.slice(providerId.length + 1) : rawId;
    const modelValue = rawId.startsWith(`${providerId}/`) ? rawId : `${providerId}/${rawId}`;
    if (!modelId || seen.has(modelValue)) continue;

    seen.add(modelValue);
    normalized.push({
      id: modelId,
      name: isObjectEntry
        ? normalizeString(entry.title || entry.name || entry.label || entry.display_name || modelId)
        : modelId,
      value: modelValue,
      provider: providerId,
      alias: providerId,
      connectionName: providerId,
      modelId,
    });
  }

  if (normalized.length > 0) {
    return normalized;
  }

  if (providerId === "chatgpt-web") {
    return [{
      id: "auto",
      name: "Auto",
      value: "chatgpt-web/auto",
      provider: providerId,
      alias: providerId,
      connectionName: providerId,
      modelId: "auto",
    }];
  }

  return [];
}

function createWebBridgeConnection(provider, name, session) {
  if (!session || session.status === "missing") {
    return null;
  }

  return {
    id: session.id || provider,
    provider,
    name,
    authType: "web-bridge",
    isActive: true,
    providerSpecificData: {
      source: "web-bridge",
      status: session.status || null,
      availableModels: normalizeWebBridgeModels(provider, session.availableModels),
    },
  };
}

export default function CLIToolsPageClient({ machineId }) {
  const { t } = useRuntimeLocale();
  const [connections, setConnections] = useState([]);
  const [webBridgeConnections, setWebBridgeConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState(null);
  const [modelMappings, setModelMappings] = useState({});
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [tunnelEnabled, setTunnelEnabled] = useState(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [toolStatuses, setToolStatuses] = useState({});

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        await Promise.all([
          fetchConnections(),
          fetchWebBridgeConnections(),
          loadCloudSettings(),
          fetchApiKeys(),
          fetchAllStatuses(),
        ]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchAllStatuses = async () => {
    try {
      const entries = await Promise.all(
        Object.entries(STATUS_ENDPOINTS).map(async ([toolId, url]) => {
          try {
            const res = await fetch(url);
            const data = await res.json();
            return [toolId, data];
          } catch {
            return [toolId, null];
          }
        })
      );
      setToolStatuses(Object.fromEntries(entries));
    } catch (error) {
      console.log("Error fetching tool statuses:", error);
    }
  };

  const loadCloudSettings = async () => {
    try {
      const [settingsRes, tunnelRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/tunnel/status"),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setCloudEnabled(data.cloudEnabled || false);
      }
      if (tunnelRes.ok) {
        const data = await tunnelRes.json();
        setTunnelEnabled(data.enabled || false);
        setTunnelPublicUrl(data.publicUrl || "");
      }
    } catch (error) {
      console.log("Error loading settings:", error);
    }
  };

  const fetchApiKeys = async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
      }
    } catch (error) {
      console.log("Error fetching API keys:", error);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      if (res.ok) {
        setConnections(data.connections || []);
      }
    } catch (error) {
      console.log("Error fetching connections:", error);
    }
  };

  const fetchWebBridgeConnections = async () => {
    try {
      const responses = await Promise.all(
        WEB_BRIDGE_PROVIDERS.map(async ({ provider, name, url }) => {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) return null;
            const data = await res.json();
            return createWebBridgeConnection(provider, name, data?.session);
          } catch {
            return null;
          }
        }),
      );

      setWebBridgeConnections(responses.filter(Boolean));
    } catch (error) {
      console.log("Error fetching web bridge connections:", error);
      setWebBridgeConnections([]);
    }
  };

  const getActiveProviders = () => {
    const merged = new Map();
    [...connections, ...webBridgeConnections]
      .filter((connection) => connection && connection.isActive !== false)
      .forEach((connection) => {
        merged.set(connection.provider, connection);
      });
    return Array.from(merged.values());
  };

  const handleModelMappingChange = useCallback((toolId, modelAlias, targetModel) => {
    setModelMappings(prev => {
      if (prev[toolId]?.[modelAlias] === targetModel) return prev;
      return { ...prev, [toolId]: { ...prev[toolId], [modelAlias]: targetModel } };
    });
  }, []);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && CLOUD_URL) return CLOUD_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:20128";
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const activeProviders = getActiveProviders();
  const hasActiveProviders = activeProviders.length > 0;
  const regularTools = Object.entries(CLI_TOOLS);
  const autoWriterTools = regularTools.filter(([, tool]) => ["custom", "env"].includes(tool.configType));
  const guideTools = regularTools.filter(([, tool]) => tool.configType === "guide");
  const installedWriterCount = autoWriterTools.filter(([toolId]) => toolStatuses[toolId]?.installed).length;

  const renderToolCard = (toolId, tool) => {
    const commonProps = {
      tool,
      isExpanded: expandedTool === toolId,
      onToggle: () => setExpandedTool(expandedTool === toolId ? null : toolId),
      baseUrl: getBaseUrl(),
      apiKeys,
    };

    switch (toolId) {
      case "claude":
        return (
          <ClaudeToolCard
            key={toolId}
            {...commonProps}
            activeProviders={activeProviders}
            modelMappings={modelMappings[toolId] || {}}
            onModelMappingChange={(alias, target) => handleModelMappingChange(toolId, alias, target)}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
            initialStatus={toolStatuses.claude}
          />
        );
      case "codex":
        return <CodexToolCard key={toolId} {...commonProps} activeProviders={activeProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.codex} />;
      case "opencode":
        return <OpenCodeToolCard key={toolId} {...commonProps} activeProviders={activeProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.opencode} />;
      case "droid":
        return <DroidToolCard key={toolId} {...commonProps} activeProviders={activeProviders} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.droid} />;
      case "openclaw":
        return <OpenClawToolCard key={toolId} {...commonProps} activeProviders={activeProviders} hasActiveProviders={hasActiveProviders} cloudEnabled={cloudEnabled} initialStatus={toolStatuses.openclaw} />;
      default:
        return <DefaultToolCard key={toolId} toolId={toolId} {...commonProps} activeProviders={activeProviders} cloudEnabled={cloudEnabled} tunnelEnabled={tunnelEnabled} />;
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {!hasActiveProviders ? (
        <Card className="overflow-hidden border-[#b68c53]/20 bg-[#b68c53]/[0.08]">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[#c29158]/15 text-[#e6bc88]">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-[#f0d5ae]">{t("Chưa có provider active để cấp model cho Auto Config")}</p>
              <p className="text-sm leading-6 text-[#f5e5cb]/75">
                {t("Bạn vẫn có thể mở các guide card, nhưng những tool cần map model thật sẽ thiếu dữ liệu. Hãy kết nối ít nhất một provider trước để các card one-click hoạt động đầy đủ.")}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <section id="auto-config-writers" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#5e8b80] dark:text-[#87b4a9]">{t("One-click writers")}</p>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-semibold tracking-tight text-text-main">{t("Ghi cấu hình trực tiếp vào tool")}</h3>
              <p className="max-w-3xl text-sm leading-6 text-text-muted">
                {t("Dành cho các tool mà NexusAI có thể viết config thật vào file local. Mục tiêu là ít copy tay, ít bước trung gian và dễ rollback ngay trong cùng card.")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge size="sm" variant="primary">{t(`${autoWriterTools.length} writers`)}</Badge>
            <Badge size="sm">{t(`${installedWriterCount} installed`)}</Badge>
          </div>
        </div>

        <div
          className="rounded-[24px] border p-3 shadow-[0_18px_52px_rgba(17,43,39,0.14)] md:p-4"
          style={{
            borderColor: "rgba(108, 145, 129, 0.2)",
            background: "linear-gradient(180deg, rgba(112, 176, 155, 0.08) 0%, rgba(255,255,255,0.015) 22%, rgba(255,255,255,0) 100%)",
          }}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {autoWriterTools.map(([toolId, tool]) => renderToolCard(toolId, tool))}
          </div>
        </div>
      </section>

      <section id="auto-config-guides" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#8e6b49] dark:text-[#d2a170]">{t("Manual guides")}</p>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-semibold tracking-tight text-text-main">{t("Guide card cho IDE và assistant cần cấu hình tay")}</h3>
              <p className="max-w-3xl text-sm leading-6 text-text-muted">
                {t("Nhóm này không tự viết file cho bạn, nhưng được gom riêng để dễ phân biệt với one-click writer. Mỗi card tập trung vào thứ phải copy: base URL, API key, model và snippet cấu hình.")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge size="sm">{t(`${guideTools.length} guides`)}</Badge>
            <Badge size="sm">{t(`${activeProviders.length} provider ready`)}</Badge>
          </div>
        </div>

        <div
          className="rounded-[24px] border p-3 shadow-[0_18px_52px_rgba(74,51,28,0.1)] md:p-4"
          style={{
            borderColor: "rgba(166, 128, 88, 0.18)",
            background: "linear-gradient(180deg, rgba(205, 151, 91, 0.08) 0%, rgba(255,255,255,0.015) 24%, rgba(255,255,255,0) 100%)",
          }}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {guideTools.map(([toolId, tool]) => renderToolCard(toolId, tool))}
          </div>
        </div>
      </section>
    </div>
  );
}
