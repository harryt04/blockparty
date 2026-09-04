/**
 * GET /api/health/live - process liveness. See ENG-003.
 * Carries no game data and no secret.
 */
import type { HealthLiveResponse } from "@blockparty/contracts";
import { jsonOk } from "@/server/http/responses";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRequestTelemetry("GET /api/health/live", request, getLive);
}

async function getLive() {
  const response: HealthLiveResponse = {
    status: "ok",
    serverTime: new Date().toISOString(),
  };
  return jsonOk(response);
}
