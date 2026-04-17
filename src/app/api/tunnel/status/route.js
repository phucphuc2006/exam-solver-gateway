import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getTunnelStatus } = await import("@/lib/tunnel/tunnelManager");
    const status = await getTunnelStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Tunnel status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
