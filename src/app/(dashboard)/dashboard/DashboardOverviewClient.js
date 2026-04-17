"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card } from "@/shared/components";

const providerColors = ["#f637ec", "#7c3aed", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444"];
const DashboardRequestsChart = dynamic(() => import("./DashboardRequestsChart"), {
  ssr: false,
  loading: () => (
    <ChartLoadingState
      icon="progress_activity"
      title="Loading charts"
      body="Preparing live telemetry visuals for the dashboard."
    />
  ),
});
const DashboardProviderMixChart = dynamic(() => import("./DashboardProviderMixChart"), {
  ssr: false,
  loading: () => (
    <ChartLoadingState
      icon="pie_chart"
      title="Loading provider mix"
      body="Preparing provider distribution for the current telemetry window."
    />
  ),
});

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardOverviewClient({ initialData = null }) {
  const [overviewData, setOverviewData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData) {
      setOverviewData(initialData);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch("/api/dashboard/overview?scope=overview", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) {
          setOverviewData(response.ok ? data : { error: data.error || "Failed to load dashboard overview" });
        }
      } catch (error) {
        if (!cancelled) {
          setOverviewData({ error: error.message || "Failed to load dashboard overview" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const error = overviewData?.error || "";
  const usageStats = overviewData?.usageStats || null;
  const storageStatus = overviewData?.storageStatus || null;
  const tunnelStatus = overviewData?.tunnelStatus || null;
  const versionInfo = overviewData?.versionInfo || null;
  const activeProviderCount = overviewData?.summary?.activeProviderCount || 0;
  const supportedFlags = overviewData?.summary?.supportedFlagsCount || 0;

  const providerSeries = Object.entries(usageStats?.byProvider || {})
    .map(([provider, stats], index) => ({
      provider,
      requests: stats.requests || 0,
      cost: Number(stats.cost || 0),
      fill: providerColors[index % providerColors.length],
    }))
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 6);

  const requestTimeline = (usageStats?.last10Minutes || []).map((bucket, index, buckets) => ({
    minute: `${index - buckets.length + 1}m`,
    requests: bucket.requests || 0,
    cost: Number(bucket.cost || 0),
  }));

  return (
    <div className="flex flex-col gap-6">
      <section
        className="relative overflow-hidden rounded-[30px] border border-black/5 p-6 md:p-8 dark:border-white/10"
        style={{
          background:
            "linear-gradient(135deg, rgba(18,24,38,0.96) 0%, rgba(72,30,121,0.88) 48%, rgba(246,55,236,0.18) 100%)",
          boxShadow: "0 30px 120px -70px rgba(124, 58, 237, 0.8)",
        }}
      >
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="primary" size="lg" icon="monitoring">
                Live Gateway Overview
              </Badge>
              <Badge variant={tunnelStatus?.enabled ? "success" : "default"} size="lg" dot>
                {tunnelStatus?.enabled ? "Tunnel online" : "Tunnel offline"}
              </Badge>
              <Badge variant={versionInfo?.hasUpdate ? "warning" : "info"} size="lg">
                {versionInfo?.hasUpdate ? `Update v${versionInfo.latestVersion}` : `v${versionInfo?.currentVersion || "—"}`}
              </Badge>
            </div>

            <div className="max-w-3xl">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                NexusAI Gateway is healthy, observable, and ready for routing decisions.
              </h1>
              <p className="mt-3 text-sm md:text-base leading-7 text-white/70">
                This overview combines usage telemetry, provider availability, diagnostics capability flags, and storage migration health into one bento-style control surface.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <HeroMetric label="Requests" value={formatCount(usageStats?.totalRequests || 0)} icon="bolt" />
            <HeroMetric label="Active Providers" value={formatCount(activeProviderCount)} icon="hub" />
            <HeroMetric label="Capability Flags" value={formatCount(supportedFlags)} icon="flag" />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card
          className="rounded-[24px] border-white/10 bg-surface/90"
          title="Requests · Last 10 Minutes"
          subtitle="Real-time request and cost trend from SQLite usage history."
          icon="query_stats"
        >
          {loading ? (
            <ChartLoadingState icon="progress_activity" title="Loading charts" body="Preparing live telemetry visuals for the dashboard." />
          ) : requestTimeline.length > 0 ? (
            <DashboardRequestsChart data={requestTimeline} />
          ) : (
            <EmptyState icon="insights" title="No usage yet" body="Recent requests will appear here once traffic flows through the gateway." />
          )}
        </Card>

        <div className="grid gap-6">
          <BentoStatCard
            icon="payments"
            label="7-Day Cost"
            value={formatCurrency(usageStats?.totalCost || 0)}
            description="Aggregated from persisted usage rows."
          />
          <BentoStatCard
            icon="storage"
            label="SQLite Schema"
            value={`v${storageStatus?.schemaVersion || "—"}`}
            description={storageStatus?.importedLegacyAt ? `Legacy imported ${formatDateTime(storageStatus.importedLegacyAt)}` : "Fresh canonical store"}
          />
          <BentoStatCard
            icon="memory"
            label="Stored Diagnostics"
            value={formatCount(storageStatus?.counts?.diagnostics || 0)}
            description="Manual capability results persisted per modality."
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card
          className="rounded-[24px] border-white/10 bg-surface/90"
          title="Provider Mix"
          subtitle="Top providers by request volume in the current telemetry window."
          icon="donut_large"
        >
          {loading ? (
            <ChartLoadingState icon="pie_chart" title="Loading provider mix" body="Preparing provider distribution for the current telemetry window." />
          ) : providerSeries.length > 0 ? (
            <DashboardProviderMixChart
              data={providerSeries}
              formatCount={formatCount}
              formatCurrency={formatCurrency}
            />
          ) : (
            <EmptyState icon="pie_chart" title="No provider mix yet" body="Provider distribution needs usage history to become meaningful." />
          )}
        </Card>

        <Card
          className="rounded-[24px] border-white/10 bg-surface/90"
          title="Quick Actions"
          subtitle="Jump straight to the areas that matter most during operations."
          icon="assistant_navigation"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <QuickActionCard
              href="/dashboard/providers"
              icon="dns"
              title="Inspect Providers"
              body="Validate credentials, refresh models, and tune weighted routing inputs."
            />
            <QuickActionCard
              href="/dashboard/usage"
              icon="bar_chart"
              title="Review Usage"
              body="Check request logs, latency patterns, and cost drift in one place."
            />
            <QuickActionCard
              href="/dashboard/diagnostics"
              icon="science"
              title="Run Diagnostics"
              body="Probe text, vision, audio, and tool-calling capabilities with persisted results."
            />
            <QuickActionCard
              href="/dashboard/endpoint"
              icon="api"
              title="Manage Endpoint"
              body="Share the local gateway, inspect tunnel state, and manage client-facing access."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, icon }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/70">{label}</span>
        <span className="material-symbols-outlined text-white/80">{icon}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function BentoStatCard({ icon, label, value, description }) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-surface px-5 py-5 shadow-[0_18px_60px_-45px_rgba(15,23,42,0.38)] dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{label}</span>
        <span className="material-symbols-outlined text-primary">{icon}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-text-main">{value}</p>
      <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function QuickActionCard({ href, icon, title, body }) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-black/5 bg-black/[0.02] p-5 transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_24px_80px_-55px_rgba(124,58,237,0.5)] dark:border-white/5 dark:bg-white/[0.02]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <span className="material-symbols-outlined text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
          arrow_forward
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-text-main">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">{body}</p>
    </Link>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-dashed border-black/10 px-6 py-10 text-center dark:border-white/10">
      <span className="material-symbols-outlined text-4xl text-text-muted">{icon}</span>
      <h3 className="mt-4 text-base font-semibold text-text-main">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-muted">{body}</p>
    </div>
  );
}

function ChartLoadingState({ icon, title, body }) {
  return <EmptyState icon={icon} title={title} body={body} />;
}
