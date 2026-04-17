import { NextResponse } from "next/server";
import { redactChatgptWebSession, validateAndStoreChatgptWebSession } from "@/lib/chatgptWeb";
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
    { scope: "chatgpt-web.session.validate", limit: 12, windowMs: 60_000 },
    "Too many ChatGPT Web validation attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const session = await validateAndStoreChatgptWebSession();
    clearServerCache();
    void emitWebBridgeSessionUpsert("chatgpt-web", session);
    return NextResponse.json({ session: redactChatgptWebSession(session) });
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.session) {
      clearServerCache();
      void emitWebBridgeSessionUpsert("chatgpt-web", error.session);
    }

    return NextResponse.json(
      {
        error: error.message || "Failed to validate ChatGPT Web session",
        ...(error?.session ? { session: redactChatgptWebSession(error.session) } : {}),
      },
      { status },
    );
  }
}
