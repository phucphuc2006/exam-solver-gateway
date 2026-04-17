import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getAuthCookieOptions, getBootstrapState, issueAuthToken } from "@/lib/adminAuth";
import { syncAuthGateStateFromSettings } from "@/lib/authGateState";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function POST(request) {
  const limited = enforceRateLimit(
    request,
    { scope: "auth.login", limit: 5, windowMs: 60_000 },
    "Too many login attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const { password } = await request.json();
    const bootstrap = await getBootstrapState();
    if (bootstrap.needsSetup) {
      return NextResponse.json(
        { error: "Bootstrap setup required", bootstrapRequired: true },
        { status: 409 },
      );
    }

    const settings = await getSettings();
    syncAuthGateStateFromSettings(settings);
    const storedHash = settings.password;

    let isValid = false;
    if (storedHash) {
      isValid = await bcrypt.compare(password, storedHash);
    }

    if (isValid) {
      const token = await issueAuthToken();
      const cookieStore = await cookies();
      cookieStore.set("auth_token", token, getAuthCookieOptions(request));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
