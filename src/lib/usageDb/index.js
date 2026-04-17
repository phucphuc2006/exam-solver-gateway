// ── Usage DB — Re-export Index ──
// Backward compatible re-export for `import { ... } from "@/lib/usageDb"`

// ── Core ──
export { getUsageDb, statsEmitter } from "./core.js";

// ── Tracking ──
export {
  trackPendingRequest,
  getActiveRequests,
  appendRequestLog,
  getRecentLogs,
} from "./tracking.js";

// ── Stats ──
export {
  saveRequestUsage,
  getUsageHistory,
  getUsageStats,
  getChartData,
} from "./stats.js";

// Re-export request details functions from SQLite-based module
export { saveRequestDetail, getRequestDetails, getRequestDetailById } from "../requestDetailsDb.js";
