import { NextResponse } from "next/server";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { getChartData } from "@/lib/usageDb";

const VALID_PERIODS = new Set(["24h", "7d", "30d", "60d"]);
const USAGE_CHART_CACHE_TTL_MS = 15 * 1000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";

    if (!VALID_PERIODS.has(period)) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const data = await getOrSetCachedValue(`api:usage:chart:${period}`, USAGE_CHART_CACHE_TTL_MS, () =>
      getChartData(period),
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get chart data:", error);
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 });
  }
}
