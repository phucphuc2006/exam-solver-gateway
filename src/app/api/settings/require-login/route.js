import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { syncAuthGateStateFromSettings } from "@/lib/authGateState";

export async function GET() {
  try {
    const settings = await getSettings();
    syncAuthGateStateFromSettings(settings);
    const requireLogin = settings.requireLogin !== false;
    return NextResponse.json({
      requireLogin,
      bootstrapRequired: !settings.password,
    });
  } catch (error) {
    return NextResponse.json({ requireLogin: true, bootstrapRequired: true }, { status: 200 });
  }
}
