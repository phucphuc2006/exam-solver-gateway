import { NextResponse } from "next/server";
import { clearServerCache } from "@/lib/serverCache";
import { deleteGeminiWebSession, getGeminiWebSession, upsertGeminiWebSession } from "@/lib/localDb";
import { redactGeminiWebSession } from "@/lib/geminiWeb";
import {
  emitWebBridgeSessionRemove,
  emitWebBridgeSessionUpsert,
} from "@/lib/webBridgeControlPlane";

function safeParseProviderData(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const session = await getGeminiWebSession();
    return NextResponse.json({ session: redactGeminiWebSession(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load Gemini Web session" },
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
    { scope: "gemini-web.session.delete", limit: 10, windowMs: 60_000 },
    "Too many Gemini Web disconnect attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    await deleteGeminiWebSession();
    clearServerCache();
    void emitWebBridgeSessionRemove("gemini-web");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete Gemini Web session" },
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
    { scope: "gemini-web.session.patch", limit: 20, windowMs: 60_000 },
    "Too many Gemini Web session update attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const session = await getGeminiWebSession();
    if (!session) {
      return NextResponse.json(
        { error: "Chưa có session Gemini Web để cập nhật." },
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

    const providerData = safeParseProviderData(session.providerDataJson);
    const sessionModeEnabled = hasSessionModeEnabled
      ? payload.sessionModeEnabled
      : session.sessionModeEnabled === true;
    const nextHistoryContextIds = sessionModeEnabled
      ? Array.isArray(providerData?.historyContextIds)
        ? providerData.historyContextIds
        : [
          session.syncedConversationId ?? "",
          session.syncedParentMessageId ?? "",
          "",
        ]
      : ["", "", ""];

    const nextSession = await upsertGeminiWebSession({
      ...session,
      historySyncEnabled: hasHistorySyncEnabled ? payload.historySyncEnabled : session.historySyncEnabled === true,
      sessionModeEnabled,
      conversationRotationInterval: hasConversationRotationInterval
        ? nextRotationInterval
        : Number(session.conversationRotationInterval ?? 0),
      conversationTurnCount: sessionModeEnabled ? Number(session.conversationTurnCount ?? 0) : 0,
      syncedConversationId: sessionModeEnabled
        ? session.syncedConversationId ?? nextHistoryContextIds[0] ?? null
        : null,
      syncedParentMessageId: sessionModeEnabled
        ? session.syncedParentMessageId ?? nextHistoryContextIds[1] ?? null
        : null,
      providerDataJson: JSON.stringify({
        ...(providerData && typeof providerData === "object" ? providerData : {}),
        historyContextIds: nextHistoryContextIds,
      }),
      lastError: null,
      lastErrorAt: null,
    });

    clearServerCache();
    void emitWebBridgeSessionUpsert("gemini-web", nextSession);
    return NextResponse.json({ session: redactGeminiWebSession(nextSession) });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update Gemini Web session" },
      { status: 500 },
    );
  }
}
