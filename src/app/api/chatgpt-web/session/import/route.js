import { NextResponse } from "next/server";
import { upsertChatgptWebSession } from "@/lib/localDb";
import { normalizeChatgptWebCaptureBundle, redactChatgptWebSession } from "@/lib/chatgptWeb";
import { clearServerCache } from "@/lib/serverCache";
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
    { scope: "chatgpt-web.session.import", limit: 8, windowMs: 60_000 },
    "Too many ChatGPT Web import attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const payload = await request.json();
    const normalized = normalizeChatgptWebCaptureBundle(payload);
    const session = await upsertChatgptWebSession(normalized);
    clearServerCache();
    void emitWebBridgeSessionUpsert("chatgpt-web", session);
    return NextResponse.json({ session: redactChatgptWebSession(session) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to import ChatGPT Web session" },
      { status: 400 },
    );
  }
}
