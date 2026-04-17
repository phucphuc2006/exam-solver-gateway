import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { getDiagnosticResults } from "@/lib/storage/sqlite/repositories";

const DIAGNOSTICS_RESULTS_CACHE_TTL_MS = 20 * 1000;

export async function GET(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const url = new URL(request.url);
    const searchKey = url.searchParams.toString() || "all";
    const payload = await getOrSetCachedValue(
      `api:diagnostics:results:${searchKey}`,
      DIAGNOSTICS_RESULTS_CACHE_TTL_MS,
      async () => {
        const results = await getDiagnosticResults({
          connectionId: url.searchParams.get("connectionId") || undefined,
          model: url.searchParams.get("model") || undefined,
          modality: url.searchParams.get("modality") || undefined,
          source: url.searchParams.get("source") || undefined,
        });

        const latestFlags = [];
        const seen = new Set();

        for (const result of results) {
          const capabilityFlag = result.metadata?.capabilityFlag || result.modality;
          const key = `${result.connectionId}:${result.model}:${capabilityFlag}`;
          if (seen.has(key)) continue;
          seen.add(key);
          latestFlags.push({
            connectionId: result.connectionId,
            provider: result.provider,
            model: result.model,
            modality: result.modality,
            capabilityFlag,
            supported: result.supported,
            lastTestedAt: result.lastTestedAt,
            latencyMs: result.latencyMs,
            summary: result.summary,
          });
        }

        return { results, latestFlags };
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to fetch diagnostics" }, { status: 500 });
  }
}
