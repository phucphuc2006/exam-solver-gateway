import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { getDashboardOverviewData, getSidebarBootstrapData } from "@/lib/dashboardBootstrap";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const scope = new URL(request.url).searchParams.get("scope") || "all";

  try {
    if (scope === "sidebar") {
      return NextResponse.json({ sidebar: await getSidebarBootstrapData() });
    }

    if (scope === "overview") {
      return NextResponse.json(await getDashboardOverviewData());
    }

    const [sidebar, overview] = await Promise.all([
      getSidebarBootstrapData(),
      getDashboardOverviewData(),
    ]);

    return NextResponse.json({ sidebar, overview });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load dashboard bootstrap" },
      { status: 500 },
    );
  }
}
