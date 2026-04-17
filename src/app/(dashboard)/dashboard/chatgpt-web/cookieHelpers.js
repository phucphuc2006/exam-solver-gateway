// ── ChatGPT Web Page — Cookie import/normalization helpers ──

export function normalizeImportedCookie(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const name = String(candidate.name || candidate.key || "").trim();
  const value = String(candidate.value ?? candidate.content ?? "").trim();
  if (!name || !value) {
    return null;
  }

  const expirationRaw = candidate.expirationDate ?? candidate.expires ?? candidate.expiry ?? null;
  const expirationDate = expirationRaw === null || expirationRaw === undefined || expirationRaw === ""
    ? null
    : Number(expirationRaw);

  return {
    name,
    value,
    domain: String(candidate.domain || "chatgpt.com").trim() || "chatgpt.com",
    path: String(candidate.path || "/").trim() || "/",
    secure: candidate.secure !== false,
    httpOnly: candidate.httpOnly === true,
    expirationDate: Number.isFinite(expirationDate) ? expirationDate : null,
  };
}

export function normalizeImportedCookies(list = []) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((entry) => normalizeImportedCookie(entry)).filter(Boolean);
}

export function parseCookieHeaderString(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq <= 0) return null;
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
        domain: "chatgpt.com",
        path: "/",
      };
    })
    .filter(Boolean);
}

export function extractImportedCookies(payload) {
  if (Array.isArray(payload)) {
    return normalizeImportedCookies(payload);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidates = [];
  if (Array.isArray(payload.cookies)) {
    candidates.push(payload.cookies);
  }

  if (typeof payload.cookiesJson === "string" && payload.cookiesJson.trim()) {
    try {
      const parsed = JSON.parse(payload.cookiesJson);
      if (Array.isArray(parsed)) {
        candidates.push(parsed);
      }
    } catch {
    }
  }

  for (const candidate of candidates) {
    const cookies = normalizeImportedCookies(candidate);
    if (cookies.length > 0) {
      return cookies;
    }
  }

  return [];
}

export function looksLikeCookieHeaderValue(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw || /\bcurl\b/i.test(raw) || /^bearer\s+\S+/i.test(raw)) {
    return false;
  }

  return raw.includes("=") && (raw.includes(";") || raw.startsWith("__Secure-") || raw.startsWith("oai-"));
}
