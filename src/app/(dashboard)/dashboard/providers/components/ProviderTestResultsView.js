import PropTypes from "prop-types";
import { Badge } from "@/shared/components";

export default function ProviderTestResultsView({ results }) {
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <span className="material-symbols-outlined text-red-500 text-[32px] mb-2 block">
          error
        </span>
        <p className="text-sm text-red-400">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "API Key",
      provider: "Provider",
      all: "All",
    }[mode] || mode;

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <div className="flex items-center gap-3 text-xs mb-1">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            {summary.passed} passed
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
              {summary.failed} failed
            </span>
          )}
          <span className="text-text-muted ml-auto">
            {summary.total} tested
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-black/[0.03] dark:bg-white/[0.03]"
        >
          <span
            className={`material-symbols-outlined text-[16px] ${r.valid ? "text-emerald-500" : "text-red-500"}`}
          >
            {r.valid ? "check_circle" : "error"}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium">{r.connectionName}</span>
            <span className="text-text-muted ml-1.5">({r.provider})</span>
          </div>
          {r.latencyMs !== undefined && (
            <span className="text-text-muted font-mono tabular-nums">
              {r.latencyMs}ms
            </span>
          )}
          <span
            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              r.valid
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          No active connections found for this group.
        </div>
      )}
    </div>
  );
}

ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
