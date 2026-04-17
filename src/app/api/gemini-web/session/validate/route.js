import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { redactGeminiWebSession, validateAndStoreGeminiWebSession } from "@/lib/geminiWeb";
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
    { scope: "gemini-web.session.validate", limit: 12, windowMs: 60_000 },
    "Too many Gemini Web validation attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const session = await validateAndStoreGeminiWebSession();
    clearServerCache();
    void emitWebBridgeSessionUpsert("gemini-web", session);
    return NextResponse.json({ session: redactGeminiWebSession(session) });
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.session) {
      clearServerCache();
      void emitWebBridgeSessionUpsert("gemini-web", error.session);
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to validate Gemini Web session",
        ...(error?.session ? { session: redactGeminiWebSession(error.session) } : {}),
      },
      { status },
    );
  }
}
