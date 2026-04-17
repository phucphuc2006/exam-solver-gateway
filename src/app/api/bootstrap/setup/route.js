import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthCookieOptions, getBootstrapState, issueAuthToken } from "@/lib/adminAuth";
import { updateSettings } from "@/lib/localDb";
import { syncAuthGateStateFromSettings } from "@/lib/authGateState";
import { isLocalRequest } from "@/lib/requestContext";
import { enforceRateLimit } from "@/lib/rateLimit";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Bootstrap setup is only allowed from localhost" }, { status: 403 });
  }

  const limited = enforceRateLimit(
    request,
    { scope: "bootstrap.setup", limit: 3, windowMs: 10 * 60 * 1000 },
    "Too many bootstrap attempts",
  );
  if (limited.response) {
    return limited.response;
  }

  try {
    const bootstrap = await getBootstrapState();
    if (!bootstrap.needsSetup) {
      return NextResponse.json({ error: "Bootstrap setup has already been completed" }, { status: 409 });
    }

    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Password confirmation does not match" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const settings = await updateSettings({
      password: passwordHash,
      requireLogin: true,
      bootstrapCompletedAt: now,
      passwordUpdatedAt: now,
    });
    syncAuthGateStateFromSettings(settings);

    const token = await issueAuthToken();
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, getAuthCookieOptions(request));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
