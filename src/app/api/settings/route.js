import { NextResponse } from "next/server";
import { syncAuthGateStateFromSettings } from "@/lib/authGateState";
import { clearServerCache, getOrSetCachedValue } from "@/lib/serverCache";
import { emitWebBridgeConfigUpdate } from "@/lib/webBridgeControlPlane";

const SETTINGS_CACHE_TTL_MS = 10 * 1000;

export async function GET(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request, { allowLocal: true });
  if (authResponse) return authResponse;

  try {
    const payload = await getOrSetCachedValue("api:settings", SETTINGS_CACHE_TTL_MS, async () => {
      const { getSettings } = await import("@/lib/localDb");
      const settings = await getSettings();
      syncAuthGateStateFromSettings(settings);
      const { password, ...safeSettings } = settings;

      return {
        ...safeSettings,
        enableRequestLogs: process.env.ENABLE_REQUEST_LOGS === "true",
        enableTranslator: process.env.ENABLE_TRANSLATOR === "true",
        hasPassword: !!password,
        bootstrapRequired: !password,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { requireAuthenticatedAdmin, requireBootstrapComplete } = await import("@/lib/adminAuth");
  const bootstrapResponse = await requireBootstrapComplete(request);
  if (bootstrapResponse) return bootstrapResponse;

  const authResponse = await requireAuthenticatedAdmin(request, { allowLocal: true });
  if (authResponse) return authResponse;

  try {
    const [{ getSettings, updateSettings }, { applyOutboundProxyEnv }] = await Promise.all([
      import("@/lib/localDb"),
      import("@/lib/network/outboundProxy"),
    ]);
    const body = await request.json();

    // If updating password, hash it
    if (body.newPassword) {
      const bcrypt = await import("bcryptjs");
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        return NextResponse.json(
          { error: "Bootstrap setup must be completed before changing password" },
          { status: 409 },
        );
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      body.passwordUpdatedAt = new Date().toISOString();
      delete body.newPassword;
      delete body.currentPassword;
    }

    const settings = await updateSettings(body);
    syncAuthGateStateFromSettings(settings);
    clearServerCache();
    void emitWebBridgeConfigUpdate();

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }
    const { password, ...safeSettings } = settings;
    return NextResponse.json(safeSettings);
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
