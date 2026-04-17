export { proxy } from "./dashboardGuard";

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/api/shutdown",
    "/api/settings/database",
    "/api/provider-nodes/validate",
  ],
};
