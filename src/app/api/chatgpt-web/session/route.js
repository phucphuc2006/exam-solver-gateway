import { NextResponse } from "next/server";
import { getChatgptWebSession, upsertChatgptWebSession } from "@/lib/localDb";
import { redactChatgptWebSession } from "@/lib/chatgptWeb";
import { clearServerCache, getOrSetCachedValue } from "@/lib/serverCache";
import {
  emitWebBridgeSessionRemove,
  emitWebBridgeSessionUpsert,
} from "@/lib/webBridgeControlPlane";

const CHATGPT_WEB_SESSION_CACHE_TTL_MS = 5_000;

export async function GET(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  try {
    const payload = await getOrSetCachedValue(
      "api:chatgpt-web:session",
      CHATGPT_WEB_SESSION_CACHE_TTL_MS,
      async () => {
        const session = await getChatgptWebSession();
        return {
          session: redactChatgptWebSession(session),
        };
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load ChatGPT Web session" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const [{ requireAuthenticatedAdmin, requireBootstrapComplete }, { enforceRateLimit }, { deleteChatgptWebSession }] = await Promise.all([
    import("@/lib/adminAuth"),
    import("@/lib/rateLimit"),
    import("@/lib/localDb"),
  ]);

  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request);
  if (authResponse) return authResponse;

  const limited = enforceRateLimit(
    request,
    { scope: "chatgpt-web.session.delete", limit: 10, windowMs: 60_000 },
    "Too many ChatGPT Web disconnect attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    await deleteChatgptWebSession();
    clearServerCache();
    void emitWebBridgeSessionRemove("chatgpt-web");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to delete ChatGPT Web session" },
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
    { scope: "chatgpt-web.session.patch", limit: 30, windowMs: 60_000 },
    "Too many ChatGPT Web session update attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const body = await request.json().catch(() => null);
    const hasHistorySyncEnabled = typeof body?.historySyncEnabled === "boolean";
    const hasSessionModeEnabled = typeof body?.sessionModeEnabled === "boolean";
    const hasConversationRotationInterval = body?.conversationRotationInterval !== undefined;

    if (!hasHistorySyncEnabled && !hasSessionModeEnabled && !hasConversationRotationInterval) {
      return NextResponse.json(
        { error: "At least one conversation setting must be provided" },
        { status: 400 },
      );
    }

    if (body?.historySyncEnabled !== undefined && !hasHistorySyncEnabled) {
      return NextResponse.json(
        { error: "historySyncEnabled must be a boolean" },
        { status: 400 },
      );
    }

    if (body?.sessionModeEnabled !== undefined && !hasSessionModeEnabled) {
      return NextResponse.json(
        { error: "sessionModeEnabled must be a boolean" },
        { status: 400 },
      );
    }

    const nextRotationInterval = hasConversationRotationInterval
      ? Number(body.conversationRotationInterval)
      : null;
    if (
      hasConversationRotationInterval
      && (!Number.isFinite(nextRotationInterval) || nextRotationInterval < 0 || !Number.isInteger(nextRotationInterval))
    ) {
      return NextResponse.json(
        { error: "conversationRotationInterval must be a non-negative integer" },
        { status: 400 },
      );
    }

    const session = await getChatgptWebSession();
    if (!session) {
      return NextResponse.json(
        { error: "ChatGPT Web session not found" },
        { status: 404 },
      );
    }

    const sessionModeEnabled = hasSessionModeEnabled
      ? body.sessionModeEnabled
      : session.sessionModeEnabled === true;

    const updatedSession = await upsertChatgptWebSession({
      ...session,
      historySyncEnabled: hasHistorySyncEnabled ? body.historySyncEnabled : session.historySyncEnabled === true,
      sessionModeEnabled,
      conversationRotationInterval: hasConversationRotationInterval
        ? nextRotationInterval
        : Number(session.conversationRotationInterval ?? 0),
      conversationTurnCount: sessionModeEnabled ? Number(session.conversationTurnCount ?? 0) : 0,
      syncedConversationId: sessionModeEnabled ? session.syncedConversationId ?? null : null,
      syncedParentMessageId: sessionModeEnabled ? session.syncedParentMessageId ?? null : null,
    });

    clearServerCache();
    void emitWebBridgeSessionUpsert("chatgpt-web", updatedSession);
    return NextResponse.json({
      ok: true,
      session: redactChatgptWebSession(updatedSession),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update ChatGPT Web session" },
      { status: 500 },
    );
  }
}
