import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { runLegacyMigration } from "@/lib/storage/sqlite/migrateLegacy";

export async function POST(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "storage.migrate", limit: 3, windowMs: 10 * 60 * 1000 },
    "Too many storage migration attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLegacyMigration({ force: body?.force === true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Storage migration failed" }, { status: 500 });
  }
}
