import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { deleteGrokWebSession, getGrokWebSession, upsertGrokWebSession } from "@/lib/localDb";
import { redactGrokWebSession } from "@/lib/grokWeb";
import {
  emitWebBridgeSessionRemove,
  emitWebBridgeSessionUpsert,
} from "@/lib/webBridgeControlPlane";

export async function GET(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const session = await getGrokWebSession();
    return NextResponse.json({ session: redactGrokWebSession(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load Grok Web session" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const [{ requireAuthenticatedAdmin, requireBootstrapComplete }, { enforceRateLimit }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/rateLimit"),
  ]);

  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "grok-web.session.delete", limit: 10, windowMs: 60_000 },
    "Too many Grok Web disconnect attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    await deleteGrokWebSession();
    clearServerCache();
    void emitWebBridgeSessionRemove("grok-web");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete Grok Web session" },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const [{ requireAuthenticatedAdmin, requireBootstrapComplete }, { enforceRateLimit }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/rateLimit"),
  ]);

  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "grok-web.session.patch", limit: 20, windowMs: 60_000 },
    "Too many Grok Web session update attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const session = await getGrokWebSession();
    if (!session) {
      return NextResponse.json(
        { error: "Chưa có session Grok Web để cập nhật." },
        { status: 404 },
      );
    }

    const payload = await request.json().catch(() => null);
    const hasHistorySyncEnabled = typeof payload?.historySyncEnabled === "boolean";
    const hasSessionModeEnabled = typeof payload?.sessionModeEnabled === "boolean";
    const hasConversationRotationInterval = payload?.conversationRotationInterval !== undefined;

    if (!hasHistorySyncEnabled && !hasSessionModeEnabled && !hasConversationRotationInterval) {
      return NextResponse.json(
        { error: "Cần gửi ít nhất một setting hội thoại để cập nhật." },
        { status: 400 },
      );
    }

    if (payload?.historySyncEnabled !== undefined && !hasHistorySyncEnabled) {
      return NextResponse.json(
        { error: "historySyncEnabled phải là boolean." },
        { status: 400 },
      );
    }

    if (payload?.sessionModeEnabled !== undefined && !hasSessionModeEnabled) {
      return NextResponse.json(
        { error: "sessionModeEnabled phải là boolean." },
        { status: 400 },
      );
    }

    const nextRotationInterval = hasConversationRotationInterval
      ? Number(payload.conversationRotationInterval)
      : null;
    if (
      hasConversationRotationInterval
      && (!Number.isFinite(nextRotationInterval) || nextRotationInterval < 0 || !Number.isInteger(nextRotationInterval))
    ) {
      return NextResponse.json(
        { error: "conversationRotationInterval phải là số nguyên không âm." },
        { status: 400 },
      );
    }

    const sessionModeEnabled = hasSessionModeEnabled
      ? payload.sessionModeEnabled
      : session.sessionModeEnabled === true;

    const nextSession = await upsertGrokWebSession({
      ...session,
      historySyncEnabled: hasHistorySyncEnabled ? payload.historySyncEnabled : session.historySyncEnabled === true,
      sessionModeEnabled,
      conversationRotationInterval: hasConversationRotationInterval
        ? nextRotationInterval
        : Number(session.conversationRotationInterval ?? 0),
      conversationTurnCount: sessionModeEnabled ? Number(session.conversationTurnCount ?? 0) : 0,
      syncedConversationId: sessionModeEnabled ? session.syncedConversationId ?? null : null,
      syncedParentMessageId: sessionModeEnabled ? session.syncedParentMessageId ?? null : null,
      lastError: null,
      lastErrorAt: null,
    });

    clearServerCache();
    void emitWebBridgeSessionUpsert("grok-web", nextSession);
    return NextResponse.json({ session: redactGrokWebSession(nextSession) });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update Grok Web session" },
      { status: 500 },
    );
  }
}
