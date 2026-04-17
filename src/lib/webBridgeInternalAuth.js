import { getWebBridgeInternalSecret } from "@/lib/webBridgeServerConfig";

const INTERNAL_SECRET_HEADER = "x-web-bridge-internal-secret";

export function getWebBridgeInternalSecretHeaderName() {
  return INTERNAL_SECRET_HEADER;
}

export function isInternalWebBridgeRequest(request) {
  if (!request?.headers?.get) {
    return false;
  }

  const secret = String(request.headers.get(INTERNAL_SECRET_HEADER) || "").trim();
  return Boolean(secret) && secret === getWebBridgeInternalSecret();
}
