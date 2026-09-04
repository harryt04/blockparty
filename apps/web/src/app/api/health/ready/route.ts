/**
 * GET /api/health/ready - dependency and migration readiness. See ENG-003.
 *
 * Reports a coarse status only. It never names a host, a credential, a
 * connection string, or a driver error. See SEC-004.
 *
 * With no database configured this reports `degraded` rather than throwing, so
 * the app boots and serves every page with zero infrastructure.
 */
import type { HealthReadyResponse } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE, validateBundle } from "@blockparty/game-content";
import { pingDatabase } from "@/server/db/client";
import { isProduction } from "@/server/env";
import { jsonOk } from "@/server/http/responses";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRequestTelemetry("GET /api/health/ready", request, getReady);
}

async function getReady() {
  const database = await pingDatabase();
  const bundle = validateBundle(PLACEHOLDER_BUNDLE, { production: isProduction });

  const status: HealthReadyResponse["status"] =
    database === "ok" && bundle.valid
      ? "ready"
      : database === "unreachable"
        ? "unavailable"
        : "degraded";

  const response: HealthReadyResponse = {
    status,
    serverTime: new Date().toISOString(),
    checks: {
      database,
      contentBundle: bundle.valid ? "ok" : "invalid",
    },
  };
  return jsonOk(response, { status: status === "unavailable" ? 503 : 200 });
}
