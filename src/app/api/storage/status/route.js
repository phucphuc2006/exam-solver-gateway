import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { getStorageMigrationStatus } from "@/lib/storage/sqlite/migrateLegacy";

const STORAGE_STATUS_CACHE_TTL_MS = 20 * 1000;

export async function GET(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const status = await getOrSetCachedValue("api:storage:status", STORAGE_STATUS_CACHE_TTL_MS, () =>
      getStorageMigrationStatus(),
    );
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to read storage status" }, { status: 500 });
  }
}
