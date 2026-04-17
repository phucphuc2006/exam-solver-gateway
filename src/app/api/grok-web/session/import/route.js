import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { upsertGrokWebSession } from "@/lib/localDb";
import { normalizeGrokWebConnectPayload, redactGrokWebSession } from "@/lib/grokWeb";
import { emitWebBridgeSessionUpsert } from "@/lib/webBridgeControlPlane";

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
    { scope: "grok-web.session.import", limit: 8, windowMs: 60_000 },
    "Too many Grok Web import attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const payload = await request.json();
    const normalized = normalizeGrokWebConnectPayload(payload);
    const session = await upsertGrokWebSession(normalized);
    clearServerCache();
    void emitWebBridgeSessionUpsert("grok-web", session);
    return NextResponse.json({ session: redactGrokWebSession(session) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to import Grok Web session" },
      { status: 400 },
    );
  }
}
