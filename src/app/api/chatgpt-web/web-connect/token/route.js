import { NextResponse } from "next/server";
import { createWebConnectToken } from "@/app/api/chatgpt-web/web-connect/route";

export async function POST(request) {
  const [{ requireAuthenticatedAdmin, requireBootstrapComplete }] = await Promise.all([
    import("@/lib/adminAuth"),
  ]);

  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const token = createWebConnectToken();
  return NextResponse.json({ token });
}
