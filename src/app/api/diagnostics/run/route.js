import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { runManualDiagnostic } from "@/lib/diagnostics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { clearServerCache } from "@/lib/serverCache";

export async function POST(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "diagnostics.run", limit: 20, windowMs: 5 * 60 * 1000 },
    "Too many diagnostics requests",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const body = await request.json();
    const result = await runManualDiagnostic(request, body);
    clearServerCache();
    return NextResponse.json({ result });
  } catch (error) {
    const message = error?.message || "Failed to run diagnostic";
    const status = message === "Connection not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
