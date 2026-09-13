import "server-only";

/**
 * Small process-local operational telemetry boundary. It intentionally has no
 * player/game inputs: callers provide only route, outcome, version, and
 * aggregate timing facts. A deployed collector can replace this seam later.
 * See OPS-006, OPS-008, SEC-004, and SEC-006.
 */
import { safeLog } from "../http/redaction";

export type MetricName =
  | "http_requests_total"
  | "http_errors_total"
  | "http_latency_ms"
  | "transactions_total"
  | "transaction_conflicts_total"
  | "transaction_latency_ms"
  | "sse_connections"
  | "sse_lag_ms"
  | "change_stream_recoveries_total"
  | "readiness_status"
  | "cleanup_runs_total"
  | "cleanup_failures_total"
  | "cleanup_games_expired_total"
  | "cleanup_games_deleted_total"
  | "mongo_pool_active_sessions"
  | "mongo_pool_utilization_percent"
  | "version_info";

type MetricKind = "counter" | "gauge" | "histogram";

const METRIC_KINDS: Readonly<Record<MetricName, MetricKind>> = {
  http_requests_total: "counter",
  http_errors_total: "counter",
  http_latency_ms: "histogram",
  transactions_total: "counter",
  transaction_conflicts_total: "counter",
  transaction_latency_ms: "histogram",
  sse_connections: "gauge",
  sse_lag_ms: "gauge",
  change_stream_recoveries_total: "counter",
  readiness_status: "gauge",
  cleanup_runs_total: "counter",
  cleanup_failures_total: "counter",
  cleanup_games_expired_total: "counter",
  cleanup_games_deleted_total: "counter",
  mongo_pool_active_sessions: "gauge",
  mongo_pool_utilization_percent: "gauge",
  version_info: "gauge",
};

const LABEL_KEYS = new Set([
  "route",
  "status",
  "outcome",
  "code",
  "state",
  "content_version",
  "protocol_version",
  "app_version",
  "pwa_cache_version",
  "rules_schema_version",
  "variant_schema_version",
  "state_schema_version",
  "engine_version",
]);
const LABEL_VALUE = /^[A-Za-z0-9._-]{1,64}$/u;
const HISTOGRAM_BUCKETS = [25, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000];

interface MetricSeries {
  readonly name: MetricName;
  readonly kind: MetricKind;
  readonly labels: Readonly<Record<string, string>>;
  count: number;
  sum: number;
  max: number;
  value: number;
  readonly buckets: number[];
}

export interface MetricSnapshot {
  readonly generatedAt: string;
  readonly series: readonly {
    readonly name: MetricName;
    readonly kind: MetricKind;
    readonly labels: Readonly<Record<string, string>>;
    readonly count: number;
    readonly sum: number;
    readonly max: number;
    readonly value: number;
    readonly buckets: readonly number[];
  }[];
}

const globalForTelemetry = globalThis as unknown as {
  __blockpartyTelemetry?: Map<string, MetricSeries>;
};

function metrics(): Map<string, MetricSeries> {
  globalForTelemetry.__blockpartyTelemetry ??= new Map();
  return globalForTelemetry.__blockpartyTelemetry;
}

function safeLabel(key: string, value: string): string | undefined {
  if (key === "route") {
    return /^[A-Za-z0-9._:/ -]{1,96}$/u.test(value) ? value : undefined;
  }
  return LABEL_VALUE.test(value) ? value : undefined;
}

function configuredVersion(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined ? fallback : (safeLabel(name, value) ?? fallback);
}

function safeLabels(
  labels: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!LABEL_KEYS.has(key)) continue;
    const safeValue = safeLabel(key, value);
    if (safeValue !== undefined) result[key] = safeValue;
  }
  return Object.freeze(result);
}

function seriesKey(name: MetricName, labels: Readonly<Record<string, string>>): string {
  return `${name}|${JSON.stringify(labels)}`;
}

function metric(name: MetricName, labels: Readonly<Record<string, string>>): MetricSeries {
  const key = seriesKey(name, labels);
  const existing = metrics().get(key);
  if (existing !== undefined) return existing;
  const created: MetricSeries = {
    name,
    kind: METRIC_KINDS[name],
    labels,
    count: 0,
    sum: 0,
    max: 0,
    value: 0,
    buckets: HISTOGRAM_BUCKETS.map(() => 0),
  };
  metrics().set(key, created);
  return created;
}

/** Records one bounded metric sample. Unknown or sensitive labels are ignored. */
export function recordMetric(
  name: MetricName,
  value = 1,
  labels: Readonly<Record<string, string>> = {},
): void {
  if (!Number.isFinite(value) || value < 0) return;
  const series = metric(name, safeLabels(labels));
  if (series.kind === "counter") {
    series.value = Math.min(Number.MAX_SAFE_INTEGER, series.value + value);
  } else if (series.kind === "gauge") {
    series.value = value;
  } else {
    series.count += 1;
    series.sum += value;
    series.max = Math.max(series.max, value);
    const bucket = HISTOGRAM_BUCKETS.findIndex((limit) => value <= limit);
    if (bucket >= 0) series.buckets[bucket] = (series.buckets[bucket] ?? 0) + 1;
  }
}

export function getMetricsSnapshot(): MetricSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    series: [...metrics().values()].map((series) => ({
      name: series.name,
      kind: series.kind,
      labels: series.labels,
      count: series.count,
      sum: series.sum,
      max: series.max,
      value: series.value,
      buckets: [...series.buckets],
    })),
  };
}

export function resetTelemetry(): void {
  metrics().clear();
}

function requestId(request: Request): string | undefined {
  const value = request.headers.get("x-request-id");
  return value !== null && /^[0-9a-f-]{16,64}$/iu.test(value) ? value : undefined;
}

export interface RequestTelemetryOptions {
  readonly route: string;
  readonly request: Request;
  readonly startedAt?: number;
  readonly status: number;
}

/** Emits one safe request log and request/error/latency metrics. */
export function observeRequest(options: RequestTelemetryOptions): void {
  const latencyMs = Math.max(0, Math.round(Date.now() - (options.startedAt ?? Date.now())));
  const labels = {
    route: options.route,
    status: String(options.status),
  };
  recordMetric("http_requests_total", 1, labels);
  if (options.status >= 500) recordMetric("http_errors_total", 1, labels);
  recordMetric("http_latency_ms", latencyMs, labels);
  recordVersionMetrics();
  safeLog("info", "http.request", {
    request_id: requestId(options.request),
    route: options.route,
    status: options.status,
    latency_ms: latencyMs,
    content_version: configuredVersion("CONTENT_VERSION", "unknown"),
    protocol_version: configuredVersion("PROTOCOL_VERSION", "unknown"),
    app_version: configuredVersion("APP_VERSION", "unknown"),
  });
}

/** Wraps a route without exposing request bodies, URLs, cookies, or errors. */
export async function withRequestTelemetry<T extends Response>(
  route: string,
  request: Request,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  let response: T | undefined;
  try {
    response = await operation();
    return response;
  } finally {
    observeRequest({ route, request, startedAt, status: response?.status ?? 500 });
  }
}

export type TransactionOutcome = "accepted" | "rejected" | "duplicate" | "conflict" | "failed";

export function observeTransaction(
  outcome: TransactionOutcome,
  latencyMs: number,
  code?: string,
): void {
  const labels = { outcome, ...(code === undefined ? {} : { code }) };
  recordMetric("transactions_total", 1, labels);
  if (outcome === "conflict") recordMetric("transaction_conflicts_total", 1, labels);
  recordMetric("transaction_latency_ms", Math.max(0, latencyMs), labels);
  safeLog("info", "transaction.complete", {
    outcome,
    latency_ms: Math.round(Math.max(0, latencyMs)),
    ...(code === undefined ? {} : { code }),
  });
}

export function observeSseConnections(count: number): void {
  recordMetric("sse_connections", Math.max(0, count));
}

export function observeSseLag(lagMs: number): void {
  recordMetric("sse_lag_ms", Math.min(60_000, Math.max(0, lagMs)));
}

export function observeChangeStreamRecovery(): void {
  recordMetric("change_stream_recoveries_total");
}

export function observeReadiness(status: "ok" | "not_configured" | "unreachable"): void {
  recordMetric(
    "readiness_status",
    status === "unreachable" ? 2 : status === "not_configured" ? 1 : 0,
  );
  safeLog("info", "readiness.check", { status });
}

export function observeCleanup(result: {
  readonly expiredGames: number;
  readonly deletedGames: number;
}): void {
  recordMetric("cleanup_runs_total");
  recordMetric("cleanup_games_expired_total", result.expiredGames);
  recordMetric("cleanup_games_deleted_total", result.deletedGames);
  safeLog("info", "cleanup.complete", {
    expired_games: result.expiredGames,
    deleted_games: result.deletedGames,
  });
}

export function observeCleanupFailure(): void {
  recordMetric("cleanup_failures_total");
  safeLog("error", "cleanup.failed");
}

export function observeMongoPool(activeSessions: number, maxSessions: number): void {
  const active = Math.max(0, Math.round(activeSessions));
  const max = Math.max(1, Math.round(maxSessions));
  recordMetric("mongo_pool_active_sessions", active);
  recordMetric("mongo_pool_utilization_percent", Math.min(100, Math.round((active / max) * 100)));
}

export function recordVersionMetrics(): void {
  recordMetric("version_info", 1, {
    content_version: configuredVersion("CONTENT_VERSION", "unknown"),
    protocol_version: configuredVersion("PROTOCOL_VERSION", "unknown"),
    app_version: configuredVersion("APP_VERSION", "unknown"),
    pwa_cache_version: configuredVersion("PWA_CACHE_VERSION", "unknown"),
  });
}

export interface AlertDefinition {
  readonly id: string;
  readonly metric: MetricName;
  readonly threshold: number;
  readonly owner: string;
  readonly runbook: string;
  readonly recovery: string;
}

export const ALERT_DEFINITIONS: readonly AlertDefinition[] = [
  {
    id: "readiness-unavailable",
    metric: "readiness_status",
    threshold: 2,
    owner: "web-operations",
    runbook: "docs/delivery/observability-runbook.md#readiness-unavailable",
    recovery: "Readiness reports ok for three consecutive probes.",
  },
  {
    id: "transaction-conflicts",
    metric: "transaction_conflicts_total",
    threshold: 10,
    owner: "web-operations",
    runbook: "docs/delivery/observability-runbook.md#transaction-conflicts",
    recovery: "Conflict count remains below the threshold in the next alert window.",
  },
  {
    id: "sse-lag",
    metric: "sse_lag_ms",
    threshold: 5_000,
    owner: "web-operations",
    runbook: "docs/delivery/observability-runbook.md#sse-lag",
    recovery: "Change-stream delivery lag returns below 5 seconds.",
  },
  {
    id: "mongo-pool-saturation",
    metric: "mongo_pool_utilization_percent",
    threshold: 90,
    owner: "web-operations",
    runbook: "docs/delivery/observability-runbook.md#mongo-pool-saturation",
    recovery: "Pool utilization returns below 80%.",
  },
  {
    id: "cleanup-failure",
    metric: "cleanup_failures_total",
    threshold: 1,
    owner: "web-operations",
    runbook: "docs/delivery/observability-runbook.md#cleanup-failure",
    recovery: "The next bounded cleanup run completes successfully.",
  },
];

export interface AlertState extends AlertDefinition {
  readonly active: boolean;
  readonly value: number;
}

/** Evaluates alert thresholds from the same snapshot used by a collector. */
export function evaluateAlerts(
  snapshot: MetricSnapshot = getMetricsSnapshot(),
): readonly AlertState[] {
  return ALERT_DEFINITIONS.map((definition) => {
    const matching = snapshot.series.filter((series) => series.name === definition.metric);
    const value = matching.reduce(
      (highest, series) => Math.max(highest, series.value, series.max),
      0,
    );
    return { ...definition, active: value >= definition.threshold, value };
  });
}
