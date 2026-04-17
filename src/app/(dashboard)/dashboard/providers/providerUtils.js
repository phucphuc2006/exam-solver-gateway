import PropTypes from "prop-types";
import { Badge } from "@/shared/components";
import { getErrorCode, getRelativeTime } from "@/shared/utils";

export function getStatusDisplay(connected, error, errorCode) {
  const parts = [];
  if (connected > 0) {
    parts.push(
      <Badge key="connected" variant="success" size="sm" dot>
        {connected} Connected
      </Badge>,
    );
  }
  if (error > 0) {
    const errText = errorCode
      ? `${error} Error (${errorCode})`
      : `${error} Error`;
    parts.push(
      <Badge key="error" variant="error" size="sm" dot>
        {errText}
      </Badge>,
    );
  }
  if (parts.length === 0) {
    return <span className="text-text-muted">No connections</span>;
  }
  return parts;
}

export function getConnectionErrorTag(connection) {
  if (!connection) return null;

  const explicitType = connection.lastErrorType;
  if (explicitType === "runtime_error") return "RUNTIME";
  if (
    explicitType === "upstream_auth_error" ||
    explicitType === "auth_missing" ||
    explicitType === "token_refresh_failed" ||
    explicitType === "token_expired"
  )
    return "AUTH";
  if (explicitType === "upstream_rate_limited") return "429";
  if (explicitType === "upstream_unavailable") return "5XX";
  if (explicitType === "network_error") return "NET";

  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400)
    return String(numericCode);

  const fromMessage = getErrorCode(connection.lastError);
  if (fromMessage === "401" || fromMessage === "403") return "AUTH";
  if (fromMessage && fromMessage !== "ERR") return fromMessage;

  const msg = (connection.lastError || "").toLowerCase();
  if (
    msg.includes("runtime") ||
    msg.includes("not runnable") ||
    msg.includes("not installed")
  )
    return "RUNTIME";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized")
  )
    return "AUTH";

  return "ERR";
}

export function getProviderStats(connections, providerId, authType) {
  const providerConnections = connections.filter(
    (c) => c.provider === providerId && c.authType === authType,
  );

  const getEffectiveStatus = (conn) => {
    const isCooldown = Object.entries(conn).some(
      ([k, v]) =>
        k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
    );
    return conn.testStatus === "unavailable" && !isCooldown
      ? "active"
      : conn.testStatus;
  };

  const connected = providerConnections.filter((c) => {
    const status = getEffectiveStatus(c);
    return status === "active" || status === "success";
  }).length;

  const errorConns = providerConnections.filter((c) => {
    const status = getEffectiveStatus(c);
    return (
      status === "error" || status === "expired" || status === "unavailable"
    );
  });

  const error = errorConns.length;
  const total = providerConnections.length;
  const allDisabled =
    total > 0 && providerConnections.every((c) => c.isActive === false);

  const latestError = errorConns.sort(
    (a, b) => new Date(b.lastErrorAt || 0) - new Date(a.lastErrorAt || 0),
  )[0];
  const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
  const errorTime = latestError?.lastErrorAt
    ? getRelativeTime(latestError.lastErrorAt)
    : null;

  return { connected, error, total, errorCode, errorTime, allDisabled };
}
