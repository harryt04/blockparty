import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluateAlerts,
  getMetricsSnapshot,
  observeChangeStreamRecovery,
  observeCleanup,
  observeCleanupFailure,
  observeMongoPool,
  observeReadiness,
  observeSseConnections,
  observeSseLag,
  observeTransaction,
  recordMetric,
  recordVersionMetrics,
  resetTelemetry,
  withRequestTelemetry,
} from "../src/server/observability/telemetry";

afterEach(() => {
  resetTelemetry();
  vi.restoreAllMocks();
});

describe("operational telemetry boundary", () => {
  it("covers request, transaction, SSE, readiness, cleanup, pool, and version series", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await withRequestTelemetry(
      "GET /api/health/ready",
      new Request("http://localhost/api/health/ready", {
        headers: { "x-request-id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      }),
      async () => new Response(null, { status: 200 }),
    );
    expect(response.status).toBe(200);

    observeTransaction("accepted", 18);
    observeTransaction("conflict", 22, "STALE_VERSION");
    observeSseConnections(3);
    observeSseLag(120);
    observeChangeStreamRecovery();
    observeReadiness("ok");
    observeCleanup({ expiredGames: 2, deletedGames: 1 });
    observeMongoPool(4, 20);
    recordVersionMetrics();

    const snapshot = getMetricsSnapshot();
    const names = new Set(snapshot.series.map((series) => series.name));
    expect(names).toEqual(
      new Set([
        "http_requests_total",
        "http_latency_ms",
        "transactions_total",
        "transaction_conflicts_total",
        "transaction_latency_ms",
        "sse_connections",
        "sse_lag_ms",
        "change_stream_recoveries_total",
        "readiness_status",
        "cleanup_runs_total",
        "cleanup_games_expired_total",
        "cleanup_games_deleted_total",
        "mongo_pool_active_sessions",
        "mongo_pool_utilization_percent",
        "version_info",
      ]),
    );
    expect(snapshot.series.find((series) => series.name === "http_requests_total")?.count).toBe(0);
    expect(snapshot.series.find((series) => series.name === "http_requests_total")?.value).toBe(1);
    expect(infoSpy).toHaveBeenCalled();
  });

  it("drops sensitive labels and keeps canaries out of metric snapshots and logs", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    recordMetric("http_requests_total", 1, {
      route: "GET /api/health/live",
      token: "capability-canary",
      game_id: "game-canary",
      malformed: "invite-canary",
    });
    recordMetric("transactions_total", 1, { outcome: "accepted", code: "SAFE_CODE" });
    const serialized = JSON.stringify(getMetricsSnapshot());
    expect(serialized).not.toContain("canary");
    expect(serialized).toContain("GET /api/health/live");
    expect(String(infoSpy.mock.calls[0]?.[0] ?? "")).not.toContain("canary");
  });

  it("fires actionable alerts and returns to green after the observed condition recovers", () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      observeTransaction("conflict", 10, "STALE_VERSION");
    }
    observeReadiness("unreachable");
    observeSseLag(6_000);
    observeMongoPool(19, 20);
    observeCleanupFailure();

    const fired = new Map(evaluateAlerts().map((alert) => [alert.id, alert]));
    expect([...fired.values()].every((alert) => alert.active)).toBe(true);
    expect(
      [...fired.values()].every((alert) => alert.runbook.includes("observability-runbook")),
    ).toBe(true);

    observeReadiness("ok");
    observeSseLag(0);
    observeMongoPool(1, 20);
    const recovered = new Map(evaluateAlerts().map((alert) => [alert.id, alert]));
    expect(recovered.get("readiness-unavailable")?.active).toBe(false);
    expect(recovered.get("sse-lag")?.active).toBe(false);
    expect(recovered.get("mongo-pool-saturation")?.active).toBe(false);
    expect(recovered.get("transaction-conflicts")?.active).toBe(true);
    expect(recovered.get("cleanup-failure")?.active).toBe(true);
  });
});
