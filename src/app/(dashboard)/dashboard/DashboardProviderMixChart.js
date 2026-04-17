"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export default function DashboardProviderMixChart({ data, formatCount, formatCurrency }) {
  return (
    <div className="grid gap-4 md:grid-cols-[0.95fr_1.05fr]">
      <div className="h-[260px] min-w-0 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <PieChart>
            <Pie data={data} dataKey="requests" nameKey="provider" innerRadius={56} outerRadius={90} paddingAngle={3}>
              {data.map((entry) => (
                <Cell key={entry.provider} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgba(9, 14, 27, 0.94)",
                border: "1px solid rgba(148, 163, 184, 0.14)",
                borderRadius: 16,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-3">
        {data.map((entry) => (
          <div
            key={entry.provider}
            className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="size-3 rounded-full" style={{ backgroundColor: entry.fill }} />
                <span className="text-sm font-medium text-text-main">{entry.provider}</span>
              </div>
              <span className="text-sm text-text-muted">{formatCount(entry.requests)}</span>
            </div>
            <p className="mt-2 text-xs text-text-muted">Cost {formatCurrency(entry.cost)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
