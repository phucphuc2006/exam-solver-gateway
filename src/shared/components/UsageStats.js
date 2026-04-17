"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Badge from "./Badge";
import Card from "./Card";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import TopProviders from "@/app/(dashboard)/dashboard/usage/components/TopProviders";
import RecentRequests from "@/app/(dashboard)/dashboard/usage/components/RecentRequests";
import {
  sortData, groupDataByKey, MODEL_COLUMNS, ACCOUNT_COLUMNS,
  API_KEY_COLUMNS, ENDPOINT_COLUMNS, TABLE_OPTIONS, PERIODS
} from "@/app/(dashboard)/dashboard/usage/components/usageStatsUtils";

const UsageChart = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/UsageChart"),
  {
    ssr: false,
    loading: () => (
      <Card className="p-4 flex items-center justify-center min-h-[248px] text-sm text-text-muted">
        Loading chart...
      </Card>
    ),
  },
);

export default function UsageStats() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [period, setPeriod] = useState("7d");
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch connected providers once, deduplicate by provider type
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.connections) return;
        const seen = new Set();
        const unique = d.connections.filter((c) => {
          if (seen.has(c.provider)) return false;
          seen.add(c.provider);
          return true;
        });
        setProviders(unique);
      })
      .catch(() => {});
  }, []);

  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (!stats) setLoading(true);
    else setFetching(true);

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setStats((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    let es = null;

    const connect = () => {
      if (document.hidden || es) return;

      es = new EventSource("/api/usage/stream");

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Always merge only real-time fields, never overwrite full stats from REST
          setStats((prev) => ({
            ...(prev || {}),
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          }));
          setLoading(false);
        } catch (err) {
          console.error("[SSE CLIENT] parse error:", err);
        }
      };

      es.onerror = () => {
        setLoading(false);
        es?.close();
        es = null;
      };
    };

    const disconnect = () => {
      es?.close();
      es = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        disconnect();
      } else {
        connect();
      }
    };

    connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disconnect();
    };
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byModel, pendingMap, sortBy, sortOrder), "rawModel"),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider ? `${data.rawModel} (${data.provider})` : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byAccount, pendingMap, sortBy, sortOrder), "accountName"),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}</td>
              <td className={`px-6 py-3 font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}>{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium">{item.keyName}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byEndpoint, {}, sortBy, sortOrder), "endpoint"),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-text-muted">—</td>
              <td className="px-6 py-3 text-right">{fmt(group.summary.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(group.summary.lastUsed)}</td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-6 py-3 font-medium font-mono text-sm">{item.endpoint}</td>
              <td className="px-6 py-3">{item.rawModel}</td>
              <td className="px-6 py-3"><Badge variant="neutral" size="sm">{item.provider}</Badge></td>
              <td className="px-6 py-3 text-right">{fmt(item.requests)}</td>
              <td className="px-6 py-3 text-right text-text-muted whitespace-nowrap">{fmtTime(item.lastUsed)}</td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) return <div className="text-text-muted">Failed to load usage statistics.</div>;

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex items-center gap-2 self-end">
        <div className="flex items-center gap-1 bg-bg-subtle rounded-lg p-1 border border-border">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              disabled={fetching}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {fetching && (
          <span className="material-symbols-outlined text-[16px] text-text-muted animate-spin">progress_activity</span>
        )}
      </div>

      {/* Overview cards */}
      {loading ? spinner : <OverviewCards stats={stats} />}

      {/* Usage Chart + Top Providers */}
      {loading ? spinner : (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
          <UsageChart period={period} />
          <TopProviders stats={stats} />
        </div>
      )}

      {/* Recent Requests — full width */}
      {loading ? spinner : <RecentRequests requests={stats.recentRequests || []} />}

      {/* Table with dropdown selector */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          {(() => {
            const selected = TABLE_OPTIONS.find(o => o.value === tableView);
            return (
              <div className="relative" ref={dropRef}>
                <button
                  onClick={() => setDropOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg-subtle text-sm font-medium text-text hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                >
                  {selected?.label || "Select"}
                  <span className={`material-symbols-outlined text-[16px] transition-transform ${dropOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>
                {dropOpen && (
                  <div className="absolute left-0 top-full mt-1 min-w-[200px] rounded-lg border border-border bg-bg-subtle shadow-xl z-50 overflow-hidden" style={{ animation: "dropdownFadeIn 150ms ease-out" }}>
                    {TABLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setTableView(opt.value); setDropOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                          tableView === opt.value
                            ? "bg-primary text-white font-medium"
                            : "text-text-muted hover:bg-bg-hover hover:text-text"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                <style jsx>{`@keyframes dropdownFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
              </div>
            );
          })()}
          <div className="flex items-center gap-1 bg-bg-subtle rounded-lg p-1 border border-border">
            <button
              onClick={() => setViewMode("costs")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "costs" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Costs
            </button>
            <button
              onClick={() => setViewMode("tokens")}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              Tokens
            </button>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            title=""
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
