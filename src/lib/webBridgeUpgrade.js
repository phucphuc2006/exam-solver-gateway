import { buildWebBridgeEndpointInfo } from "@/lib/webBridgeServerConfig";

export function createWebBridgeUpgradeRequiredResponse({ request, model = "", publicBaseUrl = "" }) {
  const endpoint = buildWebBridgeEndpointInfo({ request, publicBaseUrl });
  const normalizedModel = String(model || "").trim();
  const message = normalizedModel
    ? `Model ${normalizedModel} chi ho tro WebSocket transport.`
    : "Web Bridge chi ho tro WebSocket transport.";

  return Response.json(
    {
      error: {
        message: `${message} Hay ket noi qua ${endpoint.wsUrl}.`,
        type: "invalid_request_error",
        code: "websocket_upgrade_required",
      },
      websocket: endpoint,
    },
    {
      status: 426,
      headers: {
        "Access-Control-Allow-Origin": "*",
        Upgrade: "websocket",
      },
    },
  );
}
