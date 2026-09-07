/**
 * POST /api/internal/retire-placeholders - staged placeholder retirement.
 * The scheduler/operator must explicitly choose dry-run or execute. See
 * PRD-FUN-024 and ENG-031.
 */
import {
  PlaceholderRetirementRequest,
  type PlaceholderRetirementResponse,
} from "@blockparty/contracts";
import { safeEqual } from "@/server/auth/capabilities";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { env } from "@/server/env";
import {
  checkJsonContentType,
  checkOrigin,
  checkRateLimit,
  checkRequestBodySize,
} from "@/server/http/guards";
import { jsonError, jsonOk, notFound } from "@/server/http/responses";
import {
  placeholderRetirementStore,
  runPlaceholderRetirement,
} from "@/server/retention/placeholder-retirement";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withRequestTelemetry("POST /api/internal/retire-placeholders", request, () =>
    runRetirement(request),
  );
}

async function runRetirement(request: Request) {
  const bodySize = await checkRequestBodySize(request);
  if (!bodySize.ok) return jsonError(bodySize.code, { reason: bodySize.reason });
  const contentType = checkJsonContentType(request);
  if (!contentType.ok) return jsonError(contentType.code, { reason: contentType.reason });

  const configured = env.INTERNAL_CLEANUP_SECRET;
  if (configured === undefined) return notFound();
  const presented = request.headers.get("x-internal-secret");
  if (presented === null || !safeEqual(presented, configured)) return notFound();

  const origin = checkOrigin(request);
  if (!origin.ok) return jsonError(origin.code, { reason: origin.reason });
  const limit = checkRateLimit(request, "internal");
  if (!limit.ok) return jsonError(limit.code, { reason: limit.reason });

  let input: PlaceholderRetirementRequest;
  try {
    input = PlaceholderRetirementRequest.parse(await request.json());
  } catch {
    return jsonError("INVALID_PAYLOAD", { reason: "INVALID_RETIREMENT_MODE" });
  }

  try {
    const now = new Date();
    const result = await runPlaceholderRetirement({
      mode: input.mode,
      database: placeholderRetirementStore(getDb()),
      transaction: withMongoTransaction,
      now,
    });
    const response: PlaceholderRetirementResponse = { ...result, serverTime: now.toISOString() };
    return jsonOk(response);
  } catch {
    return jsonError("SERVER_BUSY");
  }
}
