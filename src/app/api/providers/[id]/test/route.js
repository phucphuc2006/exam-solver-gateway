import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { testSingleConnection } from "./testUtils.js";

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "providers.test.single", limit: 10, windowMs: 60_000 },
    "Too many provider test attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const { id } = await params;
    const result = await testSingleConnection(id);

    if (result.error === "Connection not found") {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
