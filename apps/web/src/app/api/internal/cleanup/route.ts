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
import { env } from "@/server/env";
import { jsonOk, notFound } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const configured = env.INTERNAL_CLEANUP_SECRET;
  // Unset disables the route outright.
  if (configured === undefined) return notFound();

  const presented = request.headers.get("x-internal-secret");
  if (presented === null || !safeEqual(presented, configured)) return notFound();

  // TODO(ENG-017): run the expiry transition and the bounded deletion batches.
  const response: CleanupResponse = {
    expiredGames: 0,
    deletedGames: 0,
    revokedCapabilities: 0,
    serverTime: new Date().toISOString(),
  };
  return jsonOk(response);
}
