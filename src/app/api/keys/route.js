import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { emitWebBridgeApiKeysUpdate } from "@/lib/webBridgeControlPlane";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request, { allowLocal: true });
  if (authResponse) return authResponse;

  try {
    const { getApiKeys } = await import("@/lib/localDb");
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  const [{ requireAuthenticatedAdmin, requireBootstrapComplete }, { enforceRateLimit }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/rateLimit"),
  ]);
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "keys.create", limit: 10, windowMs: 60_000 },
    "Too many API key creation attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const [{ createApiKey }, { getConsistentMachineId }] = await Promise.all([
      import("@/lib/localDb"),
      import("@/shared/utils/machineId"),
    ]);
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name, machineId);
    clearServerCache();
    void emitWebBridgeApiKeysUpdate();

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
