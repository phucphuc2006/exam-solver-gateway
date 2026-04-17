import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { disableTunnel } from "@/lib/tunnel/tunnelManager";

export async function POST() {
  try {
    const result = await disableTunnel();
    clearServerCache();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Tunnel disable error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
