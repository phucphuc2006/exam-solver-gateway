import { NextResponse } from "next/server";

async function authorizeRequest(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  return requireAuthenticatedAdmin(request, { allowLocal: true });
}

export async function GET(request) {
  const authResponse = await authorizeRequest(request);
  if (authResponse) return authResponse;

  try {
    const { exportDb } = await import("@/lib/localDb");
    const payload = await exportDb();
    return NextResponse.json(payload);
  } catch (error) {
    console.log("Error exporting database:", error);
    return NextResponse.json({ error: "Failed to export database" }, { status: 500 });
  }
}

export async function POST(request) {
  const authResponse = await authorizeRequest(request);
  if (authResponse) return authResponse;

  try {
    const [{ importDb, getSettings }, { applyOutboundProxyEnv }] = await Promise.all([
      import("@/lib/localDb"),
      import("@/lib/network/outboundProxy"),
    ]);
    const payload = await request.json();
    await importDb(payload);

    // Ensure proxy settings take effect immediately after a DB import.
    try {
      const settings = await getSettings();
      applyOutboundProxyEnv(settings);
    } catch (err) {
      console.warn("[Settings][DatabaseImport] Failed to re-apply outbound proxy env:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error importing database:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to import database" },
      { status: 400 }
    );
  }
}
