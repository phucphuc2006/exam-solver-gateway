import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey } from "@/lib/localDb";
import { requireAuthenticatedAdmin, requireBootstrapComplete } from "@/lib/adminAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { clearServerCache } from "@/lib/serverCache";
import { emitWebBridgeApiKeysUpdate } from "@/lib/webBridgeControlPlane";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key
export async function PUT(request, { params }) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "keys.update", limit: 20, windowMs: 60_000 },
    "Too many API key update attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await updateApiKey(id, updateData);
    clearServerCache();
    void emitWebBridgeApiKeysUpdate();

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "keys.delete", limit: 10, windowMs: 60_000 },
    "Too many API key deletion attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    clearServerCache();
    void emitWebBridgeApiKeysUpdate();

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
