import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { redactGrokWebSession, validateAndStoreGrokWebSession } from "@/lib/grokWeb";
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
    { scope: "grok-web.session.validate", limit: 12, windowMs: 60_000 },
    "Too many Grok Web validation attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const session = await validateAndStoreGrokWebSession();
    clearServerCache();
    void emitWebBridgeSessionUpsert("grok-web", session);
    return NextResponse.json({ session: redactGrokWebSession(session) });
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.session) {
      clearServerCache();
      void emitWebBridgeSessionUpsert("grok-web", error.session);
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to validate Grok Web session",
        ...(error?.session ? { session: redactGrokWebSession(error.session) } : {}),
      },
      { status },
    );
  }
}
