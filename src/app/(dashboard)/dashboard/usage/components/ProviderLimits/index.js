"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import ProviderLimitCard from "./ProviderLimitCard";
import QuotaTable from "./QuotaTable";
import { parseQuotaData, calculatePercentage } from "./utils";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import { USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const REFRESH_INTERVAL_MS = 60000; // 60 seconds

export default function ProviderLimits() {
  const [connections, setConnections] = useState([]);
  const [selectedConnections, setSelectedConnections] = useState({});
  const [quotaData, setQuotaData] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [connectionsLoading, setConnectionsLoading] = useState(true);

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Fetch all provider connections
  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/providers/client");
      if (!response.ok) throw new Error("Failed to fetch connections");

      const data = await response.json();
      const connectionList = data.connections || [];
      setConnections(connectionList);
      return connectionList;
    } catch (error) {
      console.error("Error fetching connections:", error);
      setConnections([]);
      return [];
    }
  }, []);

  // Fetch quota for a specific connection
  const fetchQuota = useCallback(async (connectionId, provider) => {
    setLoading((prev) => ({ ...prev, [connectionId]: true }));
    setErrors((prev) => ({ ...prev, [connectionId]: null }));

    try {
      console.log(
        `[ProviderLimits] Fetching quota for ${provider} (${connectionId})`,
      );
      const response = await fetch(`/api/usage/${connectionId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;

        // Handle different error types gracefully
        if (response.status === 404) {
          // Connection not found - skip silently
          console.warn(
            `[ProviderLimits] Connection not found for ${provider}, skipping`,
          );
          return;
        }

        if (response.status === 401) {
          // Auth error - show message instead of throwing
          console.warn(
            `[ProviderLimits] Auth error for ${provider}:`,
            errorMsg,
          );
          setQuotaData((prev) => ({
            ...prev,
            [connectionId]: {
              quotas: [],
              message: errorMsg,
            },
          }));
          return;
        }

        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      console.log(`[ProviderLimits] Got quota for ${provider}:`, data);

      // Parse quota data using provider-specific parser
      const parsedQuotas = parseQuotaData(provider, data);

      setQuotaData((prev) => ({
        ...prev,
        [connectionId]: {
          quotas: parsedQuotas,
          plan: data.plan || null,
          message: data.message || null,
          raw: data,
        },
      }));
    } catch (error) {
      console.error(
        `[ProviderLimits] Error fetching quota for ${provider} (${connectionId}):`,
        error,
      );
      setErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Failed to fetch quota",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  // Refresh quota for a specific provider
  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider);
      setLastUpdated(new Date());
    },
    [fetchQuota],
  );

  // Refresh all providers
  const refreshAll = useCallback(async () => {
    if (refreshingAll) return;

    setRefreshingAll(true);
    setCountdown(60);

    try {
      const conns = await fetchConnections();

      // Filter only supported OAuth providers
      const oauthConnections = conns.filter(
        (conn) =>
          USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) &&
          conn.authType === "oauth",
      );

      // Fetch quota for supported OAuth connections only
      await Promise.all(
        oauthConnections.map((conn) => fetchQuota(conn.id, conn.provider)),
      );

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error refreshing all providers:", error);
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshingAll, fetchConnections, fetchQuota]);

  // Initial load: fetch connections first so cards render immediately, then fetch quotas
  useEffect(() => {
    const initializeData = async () => {
      setConnectionsLoading(true);
      const conns = await fetchConnections();
      setConnectionsLoading(false);

      const oauthConnections = conns.filter(
        (conn) =>
          USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) &&
          conn.authType === "oauth",
      );

      // Mark all as loading before fetching
      const loadingState = {};
      oauthConnections.forEach((conn) => {
        loadingState[conn.id] = true;
      });
      setLoading(loadingState);

      await Promise.all(
        oauthConnections.map((conn) => fetchQuota(conn.id, conn.provider)),
      );
      setLastUpdated(new Date());
    };

    initializeData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    // Main refresh interval
    intervalRef.current = setInterval(() => {
      refreshAll();
    }, REFRESH_INTERVAL_MS);

    // Countdown interval
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 60;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshAll]);

  // Pause auto-refresh when tab is hidden (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      } else if (autoRefresh) {
        // Resume auto-refresh when tab becomes visible
        intervalRef.current = setInterval(refreshAll, REFRESH_INTERVAL_MS);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, refreshAll]);

  // Format last updated time
  const formatLastUpdated = useCallback(() => {
    if (!lastUpdated) return "Never";

    const now = new Date();
    const diffMs = now - lastUpdated;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    return "Just now";
  }, [lastUpdated]);

  // Filter only supported providers
  const filteredConnections = connections.filter(
    (conn) =>
      USAGE_SUPPORTED_PROVIDERS.includes(conn.provider) &&
      conn.authType === "oauth",
  );

  // Group connections by provider
  const groupedConnections = filteredConnections.reduce((acc, conn) => {
    if (!acc[conn.provider]) acc[conn.provider] = [];
    acc[conn.provider].push(conn);
    return acc;
  }, {});

  // Sort providers by USAGE_SUPPORTED_PROVIDERS order, then alphabetically
  const sortedProviderNames = Object.keys(groupedConnections).sort((a, b) => {
    const orderA = USAGE_SUPPORTED_PROVIDERS.indexOf(a);
    const orderB = USAGE_SUPPORTED_PROVIDERS.indexOf(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  // Calculate summary stats
  const totalProviders = sortedProviderNames.length;
  const activeWithLimits = Object.values(quotaData).filter(
    (data) => data?.quotas?.length > 0,
  ).length;

  // Count low quotas (remaining < 30%)
  const lowQuotasCount = Object.values(quotaData).reduce((count, data) => {
    if (!data?.quotas) return count;

    const hasLowQuota = data.quotas.some((quota) => {
      const percentage = calculatePercentage(quota.used, quota.total);
      return percentage < 30 && quota.total > 0;
    });

    return count + (hasLowQuota ? 1 : 0);
  }, 0);

  // Empty state
  if (!connectionsLoading && sortedProviderNames.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-[64px] text-text-muted opacity-20">
            cloud_off
          </span>
          <h3 className="mt-4 text-lg font-semibold text-text-primary">
            No Providers Connected
          </h3>
          <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">
            Connect to providers with OAuth to track your API quota limits and
            usage.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">
            Provider Limits
          </h2>
          <span className="text-sm text-text-muted">
            Last updated: {formatLastUpdated()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 ${
              autoRefresh 
                ? 'bg-primary/10 border-primary/30 text-primary shadow-[0_0_15px_rgba(168,85,247,0.15)] glow-hover' 
                : 'border-black/5 dark:border-white/5 bg-surface hover:bg-black/5 dark:hover:bg-white/5 text-text-muted hover:text-text-primary'
            }`}
            title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
          >
            <span
              className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${
                autoRefresh ? "text-primary" : "text-text-muted opacity-50"
              }`}
            >
              {autoRefresh ? "toggle_on" : "toggle_off"}
            </span>
            <span className={`text-sm font-medium ${autoRefresh ? "text-primary" : "text-text-muted"}`}>
              Auto-refresh
            </span>
            {autoRefresh && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                {countdown}s
              </span>
            )}
          </button>

          {/* Refresh all button */}
          <Button
            variant="secondary"
            size="md"
            icon="refresh"
            onClick={refreshAll}
            disabled={refreshingAll}
            loading={refreshingAll}
          >
            Refresh All
          </Button>
        </div>
      </div>

      {/* Provider Cards Grid */}
      <div className="flex flex-col gap-4">
        {sortedProviderNames.map((providerName) => {
          const providerConns = groupedConnections[providerName];
          const selectedConnId = selectedConnections[providerName] || providerConns[0].id;
          const conn = providerConns.find((c) => c.id === selectedConnId) || providerConns[0];

          const quota = quotaData[conn.id];
          const isLoading = loading[conn.id];
          const error = errors[conn.id];

          // Use table layout for all providers
          return (
            <div key={providerName} className="relative rounded-xl overflow-hidden border border-black/5 dark:border-white/5 shadow-[0_0_30px_-10px_rgba(168,85,247,0.1)] dark:shadow-[0_0_40px_-12px_rgba(168,85,247,0.15)] bg-white dark:bg-[#0d0d12]/80 backdrop-blur-xl transition-all duration-300 group">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary via-accent to-secondary opacity-80" />
              <div className="p-5 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-black/5 to-black/10 dark:from-white/5 dark:to-white/10 ring-1 ring-white/10 shadow-inner group-hover:shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-shadow duration-300">
                      <ProviderIcon
                        src={`/providers/${conn.provider}.png`}
                        alt={conn.provider}
                        size={40}
                        className="object-contain"
                        fallbackText={
                          conn.provider?.slice(0, 2).toUpperCase() || "PR"
                        }
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-text-primary capitalize tracking-wide drop-shadow-sm">
                        {conn.provider}
                      </h3>
                      {providerConns.length > 1 ? (
                        <select
                          value={conn.id}
                          onChange={(e) => setSelectedConnections((prev) => ({ ...prev, [providerName]: e.target.value }))}
                          className="mt-1 text-sm font-medium text-text-muted/80 bg-black/5 dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-md py-1 pb-1 pl-2 pr-7 appearance-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 cursor-pointer hover:bg-black/10 dark:hover:bg-white/[0.06] hover:text-text-primary outline-none transition-all"
                          style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', backgroundSize: '14px' }}
                        >
                          {providerConns.map((c) => {
                            const cQuota = quotaData[c.id];
                            const cLoading = loading[c.id];
                            const cError = errors[c.id] || cQuota?.message;
                            
                            let isExhausted = false;
                            if (cQuota?.quotas?.length > 0) {
                              isExhausted = cQuota.quotas.some((q) => q.total > 0 && q.used >= q.total);
                            } else if (cError) {
                              isExhausted = true;
                            }
                            
                            const indicator = cLoading ? "⚪" : (isExhausted ? "🔴" : "🟢");
                            const color = cLoading ? "var(--color-text-muted)" : (isExhausted ? "#ef4444" : "#22c55e");
                            
                            return (
                              <option key={c.id} value={c.id} className="bg-surface font-medium" style={{background: 'var(--color-surface)', color}}>
                                {indicator} {c.name || "Default Account"}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        conn.name && <p className="text-sm font-medium mt-1 text-text-muted/80 bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-md px-2 py-0.5 inline-block">{conn.name}</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => refreshProvider(conn.id, conn.provider)}
                    disabled={isLoading}
                    className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                    title="Refresh quota"
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] text-text-muted ${isLoading ? "animate-spin" : ""}`}
                    >
                      refresh
                    </span>
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {isLoading ? (
                  <div className="text-center py-10">
                    <span className="material-symbols-outlined text-[32px] animate-spin text-primary opacity-50 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                      progress_activity
                    </span>
                    <p className="mt-4 text-xs font-mono text-primary/70 animate-pulse tracking-widest uppercase">Syncing Quotas</p>
                  </div>
                ) : error ? (
                  <div className="text-center py-8 rounded-xl bg-red-500/5 border border-red-500/10 my-2">
                    <span className="material-symbols-outlined text-[32px] text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                      error
                    </span>
                    <p className="mt-2 text-sm text-text-muted">{error}</p>
                  </div>
                ) : quota?.message ? (
                  <div className="text-center py-6 rounded-xl bg-blue-500/5 border border-blue-500/10 my-2">
                    <p className="text-sm text-blue-400 font-medium">{quota.message}</p>
                  </div>
                ) : (
                  <div className="mt-1">
                    <QuotaTable quotas={quota?.quotas} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
