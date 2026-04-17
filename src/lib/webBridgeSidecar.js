import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  getWebBridgeHealthUrl,
  getWebBridgeInternalSecret,
  getWebBridgeNodeBaseUrl,
  getWebBridgePort,
} from "@/lib/webBridgeServerConfig";

const SIDE_CAR_BOOT_TIMEOUT_MS = 15_000;
const SIDE_CAR_HEALTH_RETRY_MS = 500;
const LOG_PREFIX = "[WEB_BRIDGE_RUST]";

function getRuntimeState() {
  if (!global.__webBridgeSidecarState) {
    global.__webBridgeSidecarState = {
      child: null,
      bootPromise: null,
      lastError: null,
      startedAt: null,
      mode: "",
    };
  }

  return global.__webBridgeSidecarState;
}

function getProjectRoot() {
  return process.cwd();
}

function getBinaryCandidates() {
  const root = getProjectRoot();
  const extension = process.platform === "win32" ? ".exe" : "";
  return [
    process.env.WEB_BRIDGE_RUST_BIN || "",
    path.join(root, "bridge-rs", "target", "release", `web-bridge-rs${extension}`),
    path.join(root, "bridge-rs", "target", "debug", `web-bridge-rs${extension}`),
  ].filter(Boolean);
}

function resolveSpawnSpec() {
  for (const candidate of getBinaryCandidates()) {
    if (fs.existsSync(candidate)) {
      return {
        command: candidate,
        args: [],
        cwd: path.dirname(candidate),
        mode: "binary",
      };
    }
  }

  const cargoToml = path.join(getProjectRoot(), "bridge-rs", "Cargo.toml");
  if (!fs.existsSync(cargoToml)) {
    throw new Error("Rust bridge source does not exist yet.");
  }

  return {
    command: process.env.CARGO_BIN || "cargo",
    args: ["run", "--manifest-path", cargoToml],
    cwd: getProjectRoot(),
    mode: "cargo",
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = SIDE_CAR_BOOT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(getWebBridgeHealthUrl(), {
        method: "GET",
        cache: "no-store",
      });
      if (response.ok) {
        return true;
      }

      lastError = new Error(`Health probe returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(SIDE_CAR_HEALTH_RETRY_MS);
  }

  throw lastError || new Error("Timed out waiting for Rust bridge health.");
}

function attachLogging(child) {
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) {
      console.log(`${LOG_PREFIX} ${text}`);
    }
  });

  child.stderr?.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) {
      console.error(`${LOG_PREFIX} ${text}`);
    }
  });
}

export async function ensureWebBridgeSidecarReady() {
  const state = getRuntimeState();

  if (state.bootPromise) {
    return state.bootPromise;
  }

  try {
    await waitForHealth(1_000);
    state.lastError = null;
    state.mode = state.mode || "external";
    return;
  } catch {
  }

  if (state.child && state.child.exitCode === null) {
    state.bootPromise = waitForHealth()
      .finally(() => {
        state.bootPromise = null;
      });
    return state.bootPromise;
  }

  const spec = resolveSpawnSpec();
  const env = {
    ...process.env,
    WEB_BRIDGE_PORT: String(getWebBridgePort()),
    WEB_BRIDGE_NODE_BASE_URL: getWebBridgeNodeBaseUrl(),
    WEB_BRIDGE_INTERNAL_SECRET: getWebBridgeInternalSecret(),
    RUST_LOG: process.env.RUST_LOG || "info",
  };

  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  state.child = child;
  state.startedAt = new Date().toISOString();
  state.mode = spec.mode;
  state.lastError = null;

  attachLogging(child);

  child.on("exit", (code, signal) => {
    state.child = null;
    state.lastError = `Rust bridge exited (${signal || code || "unknown"})`;
  });

  child.on("error", (error) => {
    state.lastError = error.message || String(error);
  });

  state.bootPromise = waitForHealth()
    .catch((error) => {
      state.lastError = error.message || String(error);
      throw error;
    })
    .finally(() => {
      state.bootPromise = null;
    });

  return state.bootPromise;
}

export function getWebBridgeSidecarStatus() {
  const state = getRuntimeState();
  return {
    running: Boolean((state.child && state.child.exitCode === null) || state.mode === "external"),
    startedAt: state.startedAt,
    lastError: state.lastError,
    mode: state.mode,
  };
}
