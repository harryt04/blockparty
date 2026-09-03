/**
 * GET /api/health/live - process liveness. See ENG-003.
 * Carries no game data and no secret.
 */
import type { HealthLiveResponse } from "@blockparty/contracts";
import { jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const response: HealthLiveResponse = {
    status: "ok",
    serverTime: new Date().toISOString(),
  };
  return jsonOk(response);
}
