import { extractWebBridgeProviderFromModel } from "@/shared/constants/webBridge";

const WEB_BRIDGE_OPENAI_PROTOCOL = "nexus-wb-openai.v1";
const DEFAULT_WS_PATH = "/ws/bridge";

function normalizeProtocolList(protocols = []) {
  return Array.isArray(protocols)
    ? protocols.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

function buildRelativeWsUrl(origin = "", path = DEFAULT_WS_PATH) {
  if (!origin) {
    return path;
  }

  try {
    const url = new URL(origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return path;
  }
}

function resolveAbsoluteWsUrl(rawUrl = "", origin = "") {
  const normalized = String(rawUrl || "").trim();
  if (!normalized) {
    return buildRelativeWsUrl(origin);
  }

  if (/^wss?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (!origin) {
    return normalized;
  }

  try {
    const base = new URL(origin);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return new URL(normalized, base).toString();
  } catch {
    return normalized;
  }
}

function appendTicketToWsUrl(rawUrl, ticketToken) {
  if (!ticketToken) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    url.searchParams.set("ticket", ticketToken);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function buildFallbackWebBridgeConfig(origin = "") {
  return {
    wsUrl: buildRelativeWsUrl(origin),
    protocols: [WEB_BRIDGE_OPENAI_PROTOCOL],
    port: 21420,
    publicPath: DEFAULT_WS_PATH,
    controlPath: "/ws/control",
    status: null,
  };
}

function getTextFromChunkPayload(payload) {
  return String(
    payload?.choices?.[0]?.delta?.content
      || payload?.delta?.content
      || payload?.delta?.text
      || payload?.text
      || "",
  );
}

function getTextFromCompletedPayload(payload) {
  return String(
    payload?.choices?.[0]?.message?.content
      || payload?.message?.content
      || payload?.output_text
      || payload?.text
      || "",
  );
}

function parseWebSocketError(event) {
  if (event instanceof Error) {
    return event.message || "WebSocket request failed.";
  }

  if (typeof event === "string" && event.trim()) {
    return event.trim();
  }

  return "WebSocket request failed.";
}

export function normalizeWebBridgeBootstrap(payload = {}, origin = "") {
  const fallback = buildFallbackWebBridgeConfig(origin);
  const nextWebBridge = payload?.webBridge && typeof payload.webBridge === "object"
    ? payload.webBridge
    : {};

  return {
    requireApiKey: payload?.requireApiKey === true,
    keys: Array.isArray(payload?.keys) ? payload.keys : [],
    tunnel: payload?.tunnel || { enabled: false, publicUrl: "" },
    webBridge: {
      ...fallback,
      ...nextWebBridge,
      wsUrl: String(nextWebBridge?.wsUrl || fallback.wsUrl),
      protocols: normalizeProtocolList(nextWebBridge?.protocols || fallback.protocols),
    },
  };
}

export function getWebBridgePublicEndpointUrl({ bootstrap, origin = "" } = {}) {
  const nextBootstrap = normalizeWebBridgeBootstrap(bootstrap, origin);
  return resolveAbsoluteWsUrl(nextBootstrap.webBridge.wsUrl, origin);
}

export function ensureWebBridgeModel(model = "", provider = "") {
  const normalizedModel = String(model || "").trim();
  const normalizedProvider = String(provider || "").trim();
  if (!normalizedModel || !normalizedProvider) {
    return normalizedModel;
  }

  return extractWebBridgeProviderFromModel(normalizedModel)
    ? normalizedModel
    : `${normalizedProvider}/${normalizedModel}`;
}

export function shouldUseWebBridgeWs(requestBody = {}) {
  return Boolean(extractWebBridgeProviderFromModel(requestBody?.model));
}

export function buildWebBridgeWsCliExample({
  endpointUrl = "",
  requireApiKey = false,
  apiKey = "",
  exampleModel = "",
  stream = false,
  promptText = "Hello from the Web Bridge",
} = {}) {
  const lines = [
    "npx wscat -c \\",
    `  '${endpointUrl}' \\`,
    `  -s '${WEB_BRIDGE_OPENAI_PROTOCOL}' \\`,
  ];

  if (requireApiKey) {
    lines.push(`  -H 'Authorization: Bearer ${apiKey || "sk-your-gateway-key"}'`);
  } else {
    const lastLine = lines[lines.length - 1];
    lines[lines.length - 1] = lastLine.replace(/ \\\\$/, "");
  }

  lines.push("");
  lines.push("> {");
  lines.push('>   "type": "request.create",');
  lines.push(`>   "model": "${String(exampleModel || "chatgpt-web/auto")}",`);
  lines.push(`>   "stream": ${stream ? "true" : "false"},`);
  lines.push('>   "messages": [');
  lines.push(">     {");
  lines.push('>       "role": "user",');
  lines.push(`>       "content": ${JSON.stringify(promptText)}`);
  lines.push(">     }");
  lines.push(">   ]");
  lines.push("> }");

  return lines.join("\n");
}

async function issueWebBridgeTicket() {
  const response = await fetch("/api/web-bridge/ws-ticket", {
    method: "POST",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Failed to issue Web Bridge ticket.");
  }

  return payload;
}

export async function runWebBridgeWsRequest({
  requestBody,
  bootstrap,
  origin = "",
  onOutput = null,
  onMetrics = null,
  onEvent = null,
} = {}) {
  const nextBootstrap = normalizeWebBridgeBootstrap(bootstrap, origin);
  const ticketPayload = await issueWebBridgeTicket();
  const ticketToken = ticketPayload?.ticket?.token || ticketPayload?.ticket || "";
  const endpoint = ticketPayload?.websocket || ticketPayload?.websocket?.webBridge || ticketPayload?.websocket || nextBootstrap.webBridge;
  const endpointUrl = resolveAbsoluteWsUrl(
    String(endpoint?.wsUrl || nextBootstrap.webBridge.wsUrl || ""),
    origin,
  );
  const socketUrl = appendTicketToWsUrl(endpointUrl, ticketToken);
  const requestId = globalThis.crypto?.randomUUID?.() || `wb_${Date.now()}`;
  const payload = {
    type: "request.create",
    request_id: requestId,
    ...requestBody,
  };

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl, WEB_BRIDGE_OPENAI_PROTOCOL);
    let settled = false;
    let aggregatedOutput = "";
    let lastMetrics = null;

    const finishWithError = (message) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
      }
      reject(new Error(message || "WebSocket request failed."));
    };

    const finishWithResult = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
      }
      resolve(result);
    };

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(payload));
    });

    socket.addEventListener("message", (event) => {
      let parsed;
      try {
        parsed = JSON.parse(String(event.data || ""));
      } catch {
        return;
      }

      onEvent?.(parsed);

      switch (parsed?.type) {
        case "response.metrics": {
          const metrics = parsed?.metrics && typeof parsed.metrics === "object"
            ? parsed.metrics
            : null;
          if (metrics) {
            lastMetrics = metrics;
            onMetrics?.(metrics);
          }
          return;
        }
        case "response.chunk": {
          const chunkData = parsed?.chunk || parsed?.data;
          const deltaText = getTextFromChunkPayload(chunkData);
          if (deltaText) {
            aggregatedOutput += deltaText;
            onOutput?.(aggregatedOutput, {
              final: false,
              requestId,
              chunk: chunkData,
            });
          }
          return;
        }
        case "response.completed": {
          const responsePayload = (parsed?.response || parsed?.data) && typeof (parsed?.response || parsed?.data) === "object"
            ? (parsed?.response || parsed?.data)
            : null;
          const finalText = getTextFromCompletedPayload(responsePayload) || aggregatedOutput;
          onOutput?.(finalText, {
            final: true,
            requestId,
            response: responsePayload,
          });
          finishWithResult({
            requestId,
            output: finalText,
            payload: responsePayload,
            metrics: parsed?.metrics || lastMetrics,
          });
          return;
        }
        case "response.error": {
          finishWithError(
            parsed?.error?.message
              || parsed?.message
              || parsed?.error
              || "Web Bridge request failed.",
          );
          return;
        }
        default:
          return;
      }
    });

    socket.addEventListener("error", (event) => {
      finishWithError(parseWebSocketError(event));
    });

    socket.addEventListener("close", (event) => {
      if (!settled) {
        const message = event.code === 1000
          ? "WebSocket connection closed before completion."
          : `WebSocket closed unexpectedly (${event.code}).`;
        finishWithError(message);
      }
    });
  });
}
