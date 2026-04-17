import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { readAuthGateState } from "@/lib/authGateState";
import { getJwtSecret } from "@/lib/serverRuntimeConfig";
import { isLocalRequest } from "@/lib/requestContext";
 
function getSecret() {
  return new TextEncoder().encode(getJwtSecret());
}

const ALWAYS_PROTECTED = ["/api/shutdown", "/api/settings/database"];
const PROTECTED_API_PATHS = ["/api/settings", "/api/keys", "/api/providers/client", "/api/provider-nodes/validate"];

async function hasValidToken(request) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const gateState = readAuthGateState();

  // Always protected - allow localhost or valid JWT only
  if (ALWAYS_PROTECTED.some((p) => pathname.startsWith(p))) {
    if (isLocalRequest(request) || await hasValidToken(request))
      return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protect sensitive API endpoints (bypass if localhost or requireLogin = false)
  if (PROTECTED_API_PATHS.some((p) => pathname.startsWith(p))) {
    if (pathname === "/api/settings/require-login") return NextResponse.next();
    if (isLocalRequest(request) || await hasValidToken(request) || gateState.requireLogin === false) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  // Protect all dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (await hasValidToken(request)) {
      return NextResponse.next();
    }

    if (!gateState.needsSetup && gateState.requireLogin === false) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL(gateState.needsSetup ? "/login?setup=1" : "/login", request.url));
  }

  // Redirect / to /dashboard if logged in, or /dashboard if it's the root
  if (pathname === "/") {
    if (!gateState.needsSetup && gateState.requireLogin === false) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
