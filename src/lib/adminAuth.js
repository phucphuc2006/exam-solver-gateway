import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { getSettings } from "@/lib/localDb";
import { isLocalRequest } from "./requestContext.js";
import { getJwtSecret } from "./serverRuntimeConfig.js";

const encoder = new TextEncoder();

function getSecret() {
  return encoder.encode(getJwtSecret());
}

export async function hasValidSession(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function requireAuthenticatedAdmin(request, { allowLocal = true } = {}) {
  if (allowLocal && isLocalRequest(request)) {
    return null;
  }

  if (await hasValidSession(request)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function issueAuthToken() {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(getSecret());
}

export function getAuthCookieOptions(request) {
  const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttpsRequest = forwardedProto === "https";
  const useSecureCookie = forceSecureCookie || isHttpsRequest;

  return {
    httpOnly: true,
    secure: useSecureCookie,
    sameSite: "lax",
    path: "/",
  };
}

export async function getBootstrapState() {
  const settings = await getSettings();
  return {
    needsSetup: !settings.password,
    hasPassword: !!settings.password,
  };
}

export async function requireBootstrapComplete(request, { allowLocalSetup = false } = {}) {
  const { needsSetup } = await getBootstrapState();

  if (!needsSetup) {
    return null;
  }

  if (allowLocalSetup && isLocalRequest(request)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Bootstrap setup required",
      bootstrapRequired: true,
    },
    { status: 409 },
  );
}
