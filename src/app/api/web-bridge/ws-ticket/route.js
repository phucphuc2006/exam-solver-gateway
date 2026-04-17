import { NextResponse } from "next/server";

import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import {
  ensureWebBridgeControlPlane,
  issueWebBridgeBrowserTicket,
} from "@/lib/webBridgeControlPlane";
import { buildWebBridgeEndpointInfo } from "@/lib/webBridgeServerConfig";

export async function POST(request) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    await ensureWebBridgeControlPlane();
    const ticket = await issueWebBridgeBrowserTicket();
    const endpoint = buildWebBridgeEndpointInfo({ request });

    return NextResponse.json({
      ok: true,
      ticket,
      websocket: endpoint,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to issue Web Bridge ticket" },
      { status: 503 },
    );
  }
}
