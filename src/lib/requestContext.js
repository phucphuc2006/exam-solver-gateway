function firstHeaderValue(value) {
  if (!value) return "";
  return value.split(",")[0].trim();
}

export function getRequestHost(request) {
  const host = request.headers.get("host") || "";
  return host.split(":")[0].trim().toLowerCase();
}

export function getClientIp(request) {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-for")) ||
    firstHeaderValue(request.headers.get("x-real-ip")) ||
    firstHeaderValue(request.headers.get("cf-connecting-ip")) ||
    ""
  );
}

export function isLocalRequest(request) {
  const host = getRequestHost(request);
  const ip = getClientIp(request);
  const localValues = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  return localValues.has(host) || localValues.has(ip);
}
