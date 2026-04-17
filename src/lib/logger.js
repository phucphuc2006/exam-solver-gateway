const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = ["authorization", "token", "secret", "password", "cookie", "apiKey", "api_key", "keyValue"];

function normalizeLevel(value) {
  const key = String(value || "").toLowerCase();
  return LOG_LEVELS[key] ? key : null;
}

function getActiveLevel() {
  return normalizeLevel(process.env.LOG_LEVEL) || (process.env.NODE_ENV === "development" ? "debug" : "info");
}

function maskString(value) {
  if (typeof value !== "string" || value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function sanitize(value, parentKey = "") {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, parentKey));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => {
        const nextKey = key.toLowerCase();
        if (SENSITIVE_KEYS.some((sensitive) => nextKey.includes(sensitive.toLowerCase()))) {
          return [key, typeof entryValue === "string" ? maskString(entryValue) : "***"];
        }

        return [key, sanitize(entryValue, key)];
      }),
    );
  }

  if (typeof value === "string" && SENSITIVE_KEYS.some((sensitive) => parentKey.toLowerCase().includes(sensitive.toLowerCase()))) {
    return maskString(value);
  }

  return value;
}

function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[getActiveLevel()];
}

function formatPayload(payload) {
  if (payload === undefined) return "";
  if (typeof payload === "string") return payload;

  try {
    return JSON.stringify(sanitize(payload));
  } catch {
    return String(payload);
  }
}

function write(level, scope, message, payload) {
  if (!shouldLog(level)) return;

  const now = new Date().toISOString();
  const suffix = payload === undefined ? "" : ` ${formatPayload(payload)}`;
  const line = `[${now}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function createLogger(scope) {
  return {
    debug(message, payload) {
      write("debug", scope, message, payload);
    },
    info(message, payload) {
      write("info", scope, message, payload);
    },
    warn(message, payload) {
      write("warn", scope, message, payload);
    },
    error(message, payload) {
      write("error", scope, message, payload);
    },
  };
}
