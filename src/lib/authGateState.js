import fs from "node:fs";
import path from "node:path";
import { getRuntimeDataDir } from "@/lib/serverRuntimeConfig";

const AUTH_GATE_FILE_NAME = "auth-gate-state.json";
const CACHE_TTL_MS = 5_000;

const DEFAULT_AUTH_GATE_STATE = {
  requireLogin: true,
  hasPassword: false,
  needsSetup: true,
  updatedAt: null,
};

const AUTH_GATE_CACHE = globalThis.__nexusAuthGateStateCache || {
  value: null,
  readAt: 0,
};

if (!globalThis.__nexusAuthGateStateCache) {
  globalThis.__nexusAuthGateStateCache = AUTH_GATE_CACHE;
}

function getAuthGateFilePath() {
  return path.join(getRuntimeDataDir(), AUTH_GATE_FILE_NAME);
}

function normalizeAuthGateState(input = {}) {
  const requireLogin = input.requireLogin !== false;
  const hasPassword = input.hasPassword === true;

  return {
    requireLogin,
    hasPassword,
    needsSetup: input.needsSetup === true || !hasPassword,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function readAuthGateState() {
  if (AUTH_GATE_CACHE.value && Date.now() - AUTH_GATE_CACHE.readAt < CACHE_TTL_MS) {
    return AUTH_GATE_CACHE.value;
  }

  try {
    const filePath = getAuthGateFilePath();
    if (!fs.existsSync(filePath)) {
      return DEFAULT_AUTH_GATE_STATE;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeAuthGateState(parsed);
    AUTH_GATE_CACHE.value = normalized;
    AUTH_GATE_CACHE.readAt = Date.now();
    return normalized;
  } catch {
    return DEFAULT_AUTH_GATE_STATE;
  }
}

export function writeAuthGateState(nextState) {
  const normalized = normalizeAuthGateState(nextState);
  const filePath = getAuthGateFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
  AUTH_GATE_CACHE.value = normalized;
  AUTH_GATE_CACHE.readAt = Date.now();
  return normalized;
}

export function syncAuthGateStateFromSettings(settings = {}) {
  return writeAuthGateState({
    requireLogin: settings.requireLogin !== false,
    hasPassword: Boolean(settings.password),
    needsSetup: !settings.password,
  });
}
