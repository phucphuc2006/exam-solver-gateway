import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_STORAGE_NAME } from "@/shared/constants/app";

const RUNTIME_SECRETS_FILE = "runtime-secrets.json";

const PLACEHOLDER_VALUES = {
  JWT_SECRET: new Set(["", "change-me-to-a-long-random-secret", "ES Gateway-default-secret-change-me"]),
  API_KEY_SECRET: new Set(["", "nexusai-gateway-secret", "endpoint-proxy-api-key-secret"]),
  MACHINE_ID_SALT: new Set(["", "nexusai-salt", "endpoint-proxy-salt", "ES Gateway-tunnel-salt"]),
};

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasRuntimeOverride(key) {
  const value = normalizeValue(process.env[key]);
  return value && !PLACEHOLDER_VALUES[key].has(value);
}

function createSecret(size = 48) {
  return crypto.randomBytes(size).toString("base64url");
}

function getDefaultDataDir() {
  const homeDir = os.homedir();
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(homeDir, "AppData", "Roaming"),
      APP_STORAGE_NAME,
    );
  }
  return path.join(homeDir, `.${APP_STORAGE_NAME}`);
}

function readSecrets(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getRuntimeDataDir() {
  return process.env.DATA_DIR || getDefaultDataDir();
}

export function ensureRuntimeSecrets() {
  const dataDir = getRuntimeDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  const filePath = path.join(dataDir, RUNTIME_SECRETS_FILE);
  const persisted = fs.existsSync(filePath) ? readSecrets(filePath) : {};

  const nextSecrets = {
    JWT_SECRET: hasRuntimeOverride("JWT_SECRET")
      ? normalizeValue(process.env.JWT_SECRET)
      : normalizeValue(persisted.JWT_SECRET) || createSecret(48),
    API_KEY_SECRET: hasRuntimeOverride("API_KEY_SECRET")
      ? normalizeValue(process.env.API_KEY_SECRET)
      : normalizeValue(persisted.API_KEY_SECRET) || createSecret(32),
    MACHINE_ID_SALT: hasRuntimeOverride("MACHINE_ID_SALT")
      ? normalizeValue(process.env.MACHINE_ID_SALT)
      : normalizeValue(persisted.MACHINE_ID_SALT) || createSecret(24),
  };

  const needsWrite =
    nextSecrets.JWT_SECRET !== normalizeValue(persisted.JWT_SECRET) ||
    nextSecrets.API_KEY_SECRET !== normalizeValue(persisted.API_KEY_SECRET) ||
    nextSecrets.MACHINE_ID_SALT !== normalizeValue(persisted.MACHINE_ID_SALT);

  if (needsWrite) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          ...nextSecrets,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }

  process.env.JWT_SECRET = nextSecrets.JWT_SECRET;
  process.env.API_KEY_SECRET = nextSecrets.API_KEY_SECRET;
  process.env.MACHINE_ID_SALT = nextSecrets.MACHINE_ID_SALT;

  return nextSecrets;
}

export function getJwtSecret() {
  return ensureRuntimeSecrets().JWT_SECRET;
}

export function getApiKeySecret() {
  return ensureRuntimeSecrets().API_KEY_SECRET;
}

export function getMachineIdSalt() {
  return ensureRuntimeSecrets().MACHINE_ID_SALT;
}
