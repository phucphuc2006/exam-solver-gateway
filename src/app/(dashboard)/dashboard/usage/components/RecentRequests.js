"use client";

import { useState, useEffect } from "react";
import Card from "@/shared/components/Card";
import { fmt } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";

function timeAgo(timestamp, now = Date.now()) {
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return "—";
  const diff = Math.max(0, Math.floor((now - value) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function RecentRequests({ requests = [] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!requests.length) return undefined;

    const timer = setInterval(() => {
      if (!document.hidden) {
        setNow(Date.now());
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [requests.length]);

  return (
    <Card className="flex flex-col overflow-hidden" padding="sm">
      {/* Header */}
      <div className="px-1 py-2 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Recent Requests</span>
        <span className="text-[10px] text-text-muted">{requests.length} entries</span>
      </div>

      {!requests.length ? (
        <div className="flex items-center justify-center text-text-muted text-sm py-12">No requests yet.</div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-bg z-10">
              <tr className="border-b border-border">
                <th className="py-2 px-2 text-left font-semibold text-text-muted w-2"></th>
                <th className="py-2 px-2 text-left font-semibold text-text-muted">Model</th>
                <th className="py-2 px-2 text-left font-semibold text-text-muted">Provider</th>
                <th className="py-2 px-2 text-right font-semibold text-text-muted whitespace-nowrap">Input</th>
                <th className="py-2 px-2 text-right font-semibold text-text-muted whitespace-nowrap">Output</th>
                <th className="py-2 px-2 text-right font-semibold text-text-muted whitespace-nowrap">Reasoning</th>
                <th className="py-2 px-2 text-right font-semibold text-text-muted">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {requests.map((r, i) => {
                const ok = !r.status || r.status === "ok" || r.status === "success";
                return (
                  <tr key={i} className="hover:bg-bg-subtle transition-colors">
                    <td className="py-2 px-2">
                      <span className={`block w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-error"}`} />
                    </td>
                    <td className="py-2 px-2 font-mono truncate max-w-[200px]" title={r.model}>{r.model}</td>
                    <td className="py-2 px-2 text-text-muted">{r.provider || '—'}</td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <span className="text-primary">{fmt(r.promptTokens)}↑</span>
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <span className="text-success">{fmt(r.completionTokens)}↓</span>
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      {r.reasoningTokens > 0 ? (
                        <span className="text-violet-400">{fmt(r.reasoningTokens)}🧠</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-text-muted whitespace-nowrap">{timeAgo(r.timestamp, now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
