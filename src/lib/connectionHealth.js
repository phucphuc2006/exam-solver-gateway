const LATENCY_ALPHA = 0.3;
const MAX_ERROR_PENALTY = 0.95;

function toFiniteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function computeLatencyEwma(currentValue, sampleValue) {
  const sample = toFiniteNumber(sampleValue, 0);
  if (sample <= 0) return currentValue ?? null;

  const current = toFiniteNumber(currentValue, 0);
  if (current <= 0) return sample;

  return Math.round((current * (1 - LATENCY_ALPHA)) + (sample * LATENCY_ALPHA));
}

export function getNextErrorPenalty(currentValue, success) {
  const current = toFiniteNumber(currentValue, 0);
  if (success) {
    return Math.max(0, Number((current * 0.5).toFixed(3)));
  }
  return Math.min(MAX_ERROR_PENALTY, Number((current + 0.2).toFixed(3)));
}

export function buildConnectionHealthUpdate(connection, { success, latencyMs = null, occurredAt = new Date().toISOString() }) {
  const update = {
    healthErrorPenalty: getNextErrorPenalty(connection?.healthErrorPenalty, success),
  };

  if (latencyMs !== null && Number.isFinite(Number(latencyMs)) && Number(latencyMs) > 0) {
    update.healthLatencyEwmaMs = computeLatencyEwma(connection?.healthLatencyEwmaMs, latencyMs);
  }

  if (success) {
    update.lastSuccessAt = occurredAt;
  } else {
    update.lastFailureAt = occurredAt;
  }

  return update;
}

export function getConnectionHealthScore(connection) {
  const errorPenalty = Math.min(MAX_ERROR_PENALTY, Math.max(0, toFiniteNumber(connection?.healthErrorPenalty, 0)));
  const latencyMs = toFiniteNumber(connection?.healthLatencyEwmaMs, 0);
  const latencyFactor = latencyMs > 0
    ? Math.max(0.35, 1 - (Math.min(latencyMs, 4000) / 5000))
    : 1;
  const lastFailureAt = connection?.lastFailureAt ? new Date(connection.lastFailureAt).getTime() : 0;
  const lastSuccessAt = connection?.lastSuccessAt ? new Date(connection.lastSuccessAt).getTime() : 0;
  const recencyFactor = lastFailureAt > lastSuccessAt ? 0.8 : 1;

  return Math.max(0.1, Number((latencyFactor * (1 - errorPenalty) * recencyFactor).toFixed(3)));
}
