import crypto from "node:crypto";

const SIMULATED = {
  agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
};

function randomFloat(min, max) {
  return (Math.random() * (max - min) + min).toFixed(4);
}

export function solveSentinelChallenge(seed, difficulty) {
  const normalizedSeed = String(seed || "").trim();
  const normalizedDifficulty = String(difficulty || "").trim();
  if (!normalizedSeed || !normalizedDifficulty) {
    throw new Error("Missing sentinel proof-of-work seed or difficulty.");
  }

  const cores = [8, 12, 16, 24];
  const screens = [3000, 4000, 6000];
  const core = cores[crypto.randomInt(0, cores.length)];
  const screen = screens[crypto.randomInt(0, screens.length)];
  const now = new Date(Date.now() - 8 * 3600 * 1000);
  const parseTime = now.toUTCString().replace("GMT", "GMT+0100 (Central European Time)");
  const config = [core + screen, parseTime, 4294705152, 0, SIMULATED.agent];
  const diffLen = normalizedDifficulty.length / 2;

  for (let index = 0; index < 100000; index += 1) {
    config[3] = index;
    const base = Buffer.from(JSON.stringify(config)).toString("base64");
    const hashValue = crypto.createHash("sha3-512")
      .update(normalizedSeed + base)
      .digest("hex");

    if (hashValue.substring(0, diffLen) <= normalizedDifficulty) {
      return `gAAAAAB${base}`;
    }
  }

  const fallbackBase = Buffer.from(`"${normalizedSeed}"`).toString("base64");
  return `gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D${fallbackBase}`;
}

export function generateFakeSentinelToken() {
  const config = [
    crypto.randomInt(3000, 6000),
    new Date().toUTCString().replace("GMT", "GMT+0100 (Central European Time)"),
    4294705152,
    0,
    SIMULATED.agent,
    "de",
    "de",
    401,
    "mediaSession",
    "location",
    "scrollX",
    randomFloat(1000, 5000),
    crypto.randomUUID(),
    "",
    12,
    Date.now(),
  ];

  return `gAAAAAC${Buffer.from(JSON.stringify(config)).toString("base64")}`;
}

export function extractCookieValueFromSetCookie(setCookieHeaders = [], cookieName) {
  const normalizedName = String(cookieName || "").trim();
  if (!normalizedName) {
    return "";
  }

  for (const header of Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]) {
    const raw = String(header || "");
    const match = raw.match(new RegExp(`(?:^|[;,]\\s*)${normalizedName}=([^;]+)`));
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}
