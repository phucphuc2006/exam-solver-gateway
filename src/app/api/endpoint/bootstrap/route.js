import { NextResponse } from "next/server";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { getOrSetCachedValue } from "@/lib/serverCache";
import { buildWebBridgeEndpointInfo } from "@/lib/webBridgeServerConfig";
import {
  ensureWebBridgeControlPlane,
  getWebBridgeControlPlaneStatus,
} from "@/lib/webBridgeControlPlane";

const ENDPOINT_BOOTSTRAP_CACHE_TTL_MS = 30 * 1000;

export async function GET(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const payload = await getOrSetCachedValue(
      "api:endpoint:bootstrap",
      ENDPOINT_BOOTSTRAP_CACHE_TTL_MS,
      async () => {
        const [{ getSettings, getApiKeys }, { getTunnelStatus }] = await Promise.all([
          import("@/lib/localDb"),
          import("@/lib/tunnel/tunnelManager"),
        ]);

        const [settings, keys, tunnelStatus] = await Promise.all([
          getSettings(),
          getApiKeys(),
          getTunnelStatus(),
        ]);

        await ensureWebBridgeControlPlane().catch(() => {});
        const webBridgeStatus = getWebBridgeControlPlaneStatus();
        const webBridgeEndpoint = buildWebBridgeEndpointInfo({
          request,
          publicBaseUrl: tunnelStatus?.publicUrl || "",
        });

        return {
          requireApiKey: settings.requireApiKey === true,
          keys,
          tunnel: {
            enabled: tunnelStatus?.enabled === true,
            tunnelUrl: tunnelStatus?.tunnelUrl || "",
            publicUrl: tunnelStatus?.publicUrl || "",
            shortId: tunnelStatus?.shortId || "",
          },
          webBridge: {
            ...webBridgeEndpoint,
            status: webBridgeStatus,
          },
        };
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load endpoint bootstrap" }, { status: 500 });
  }
}
