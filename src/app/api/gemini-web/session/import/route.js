import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { upsertGeminiWebSession } from "@/lib/localDb";
import { normalizeGeminiWebConnectPayload, redactGeminiWebSession } from "@/lib/geminiWeb";
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
    { scope: "gemini-web.session.import", limit: 8, windowMs: 60_000 },
    "Too many Gemini Web import attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const payload = await request.json();
    const normalized = normalizeGeminiWebConnectPayload(payload);
    const session = await upsertGeminiWebSession(normalized);
    clearServerCache();
    void emitWebBridgeSessionUpsert("gemini-web", session);
    return NextResponse.json({ session: redactGeminiWebSession(session) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to import Gemini Web session" },
      { status: 400 },
    );
  }
}
