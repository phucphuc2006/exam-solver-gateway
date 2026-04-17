import { NextResponse } from "next/server";
import { isLocalRequest } from "@/lib/requestContext";
import { readAuthGateState, syncAuthGateStateFromSettings } from "@/lib/authGateState";

export async function GET(request) {
  try {
    const cached = readAuthGateState();
    if (cached.updatedAt) {
      return NextResponse.json({
        needsSetup: cached.needsSetup,
        hasPassword: cached.hasPassword,
        localSetupAllowed: isLocalRequest(request),
      });
    }

    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const bootstrap = syncAuthGateStateFromSettings(settings);
    return NextResponse.json({
      needsSetup: bootstrap.needsSetup,
      hasPassword: bootstrap.hasPassword,
      localSetupAllowed: isLocalRequest(request),
    });
  } catch (error) {
    return NextResponse.json(
      {
        needsSetup: true,
        hasPassword: false,
        localSetupAllowed: isLocalRequest(request),
        error: error.message,
      },
      { status: 200 },
    );
  }
}
