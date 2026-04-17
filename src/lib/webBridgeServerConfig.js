import crypto from "node:crypto";

import {
  WEB_BRIDGE_PROTOCOLS,
} from "@/shared/constants/webBridge";

const DEFAULT_WEB_BRIDGE_PORT = 21420;
const DEFAULT_PUBLIC_PATH = "/ws/bridge";
const DEFAULT_CONTROL_PATH = "/ws/control";

function getGlobalState() {
  if (!global.__webBridgeServerConfig) {
    global.__webBridgeServerConfig = {
      internalSecret: process.env.WEB_BRIDGE_INTERNAL_SECRET || `wb-${crypto.randomUUID()}`,
    };
  }

  return global.__webBridgeServerConfig;
}

export function getWebBridgePort() {
  const parsed = Number(process.env.WEB_BRIDGE_PORT || DEFAULT_WEB_BRIDGE_PORT);
  return Number.isFinite(parsed) ? parsed : DEFAULT_WEB_BRIDGE_PORT;
}

export function getWebBridgeNodePort() {
  const parsed = Number(process.env.PORT || 21088);
  return Number.isFinite(parsed) ? parsed : 21088;
}

export function getWebBridgeNodeBaseUrl() {
  return process.env.WEB_BRIDGE_NODE_BASE_URL || `http://127.0.0.1:${getWebBridgeNodePort()}`;
}

export function getWebBridgeInternalSecret() {
  const state = getGlobalState();
  return state.internalSecret;
}

export function getWebBridgeControlWsUrl() {
  return `ws://127.0.0.1:${getWebBridgePort()}${DEFAULT_CONTROL_PATH}`;
}

export function getWebBridgeHealthUrl() {
  return `http://127.0.0.1:${getWebBridgePort()}/healthz`;
}

function toWsProtocol(protocol) {
  return protocol === "https:" ? "wss:" : "ws:";
}

export function buildWebBridgePublicWsUrl({ request = null, publicBaseUrl = "", path = DEFAULT_PUBLIC_PATH } = {}) {
  const rawBase = String(publicBaseUrl || "").trim();
  if (rawBase) {
    const url = new URL(rawBase);
    url.protocol = toWsProtocol(url.protocol);
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  if (request?.url) {
    const url = new URL(request.url);
    url.protocol = toWsProtocol(url.protocol);
    url.port = String(getWebBridgePort());
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  return `ws://127.0.0.1:${getWebBridgePort()}${path}`;
}

export function buildWebBridgeEndpointInfo({ request = null, publicBaseUrl = "" } = {}) {
  return {
    wsUrl: buildWebBridgePublicWsUrl({ request, publicBaseUrl }),
    protocols: WEB_BRIDGE_PROTOCOLS,
    port: getWebBridgePort(),
    publicPath: DEFAULT_PUBLIC_PATH,
    controlPath: DEFAULT_CONTROL_PATH,
  };
}
