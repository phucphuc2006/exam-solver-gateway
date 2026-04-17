"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

export default function DashboardRequestsChart({ data }) {
  return (
    <div className="h-[320px] min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="requestsGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f637ec" stopOpacity={0.42} />
              <stop offset="100%" stopColor="#f637ec" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <Tooltip
            contentStyle={{
              background: "rgba(9, 14, 27, 0.94)",
              border: "1px solid rgba(148, 163, 184, 0.14)",
              borderRadius: 16,
            }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            stroke="#f637ec"
            strokeWidth={2}
            fill="url(#requestsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
