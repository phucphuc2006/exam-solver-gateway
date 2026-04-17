import { NextResponse } from "next/server";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { getUsageStats } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d", "all"]);
const USAGE_STATS_CACHE_TTL_MS = 15 * 1000;

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const stats = await getOrSetCachedValue(`api:usage:stats:${period}`, USAGE_STATS_CACHE_TTL_MS, () =>
      getUsageStats(period),
    );
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Failed to get usage stats:", error);
    return NextResponse.json({ error: "Failed to fetch usage stats" }, { status: 500 });
  }
}
