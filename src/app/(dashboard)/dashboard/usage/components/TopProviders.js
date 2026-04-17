"use client";

import Card from "@/shared/components/Card";
import { fmt } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";

export default function TopProviders({ stats }) {
  if (!stats?.byModel) return null;

  // Aggregate tokens per provider
  const providerMap = {};
  Object.values(stats.byModel).forEach((item) => {
    const prov = item.provider || 'Unknown';
    if (!providerMap[prov]) providerMap[prov] = { name: prov, tokens: 0, requests: 0, cost: 0 };
    providerMap[prov].tokens += (item.promptTokens || 0) + (item.completionTokens || 0);
    providerMap[prov].requests += item.requests || 0;
    providerMap[prov].cost += item.cost || 0;
  });

  const sorted = Object.values(providerMap).sort((a, b) => b.tokens - a.tokens);
  const totalTokens = sorted.reduce((sum, p) => sum + p.tokens, 0) || 1;

  const COLORS = ['#f637ec', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

  return (
    <Card className="flex flex-col p-4 gap-3" style={{ minHeight: 260 }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Top Providers</span>
        <span className="text-[10px] text-text-muted">{sorted.length} active</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">No usage data</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.slice(0, 8).map((prov, i) => {
            const pct = Math.max(1, Math.round((prov.tokens / totalTokens) * 100));
            const color = COLORS[i % COLORS.length];
            return (
              <div key={prov.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate max-w-[140px]" title={prov.name}>{prov.name}</span>
                  <span className="text-text-muted whitespace-nowrap">{fmt(prov.tokens)} tok · {pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
