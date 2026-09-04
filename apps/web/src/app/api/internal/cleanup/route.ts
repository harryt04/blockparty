/**
 * POST /api/internal/cleanup - scheduled retention cleanup. See ENG-017.
 *
 * NEVER a player operation. The scheduler calls it with a shared secret in the
 * `x-internal-secret` header. A missing or wrong secret returns the same 404 a
 * nonexistent route would, so the endpoint cannot be discovered.
 *
 * The real job atomically moves due active games to EXPIRED, journals the
 * transition, revokes invitation, seat, and host capabilities, then deletes
 * expired data in bounded idempotent batches. Completed games stay read-only
 * until due.
 */
import type { CleanupResponse } from "@blockparty/contracts";
import { safeEqual } from "@/server/auth/capabilities";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { env } from "@/server/env";
import { jsonError, jsonOk, notFound } from "@/server/http/responses";
import { checkOrigin, checkPayloadSize, checkRateLimit } from "@/server/http/guards";
import { retentionStore, runRetentionCleanup } from "@/server/retention/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const size = checkPayloadSize(request);
  if (!size.ok) return jsonError(size.code, { reason: size.reason });
  const configured = env.INTERNAL_CLEANUP_SECRET;
  // Unset disables the route outright.
  if (configured === undefined) return notFound();

  const presented = request.headers.get("x-internal-secret");
  if (presented === null || !safeEqual(presented, configured)) return notFound();
  const origin = checkOrigin(request);
  if (!origin.ok) return jsonError(origin.code, { reason: origin.reason });
  const limit = checkRateLimit(request, "internal");
  if (!limit.ok) return jsonError(limit.code, { reason: limit.reason });

  const now = new Date();
  try {
    const result = await runRetentionCleanup({
      database: retentionStore(getDb()),
      transaction: withMongoTransaction,
      now,
    });
    const response: CleanupResponse = { ...result, serverTime: now.toISOString() };
    return jsonOk(response);
  } catch {
    // The scheduler can safely retry the same bounded job. Do not expose
    // driver details or whether a particular game exists. See SEC-004.
    return jsonError("SERVER_BUSY");
  }
}
