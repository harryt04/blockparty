/**
 * GET /api/games/[gameId]/bootstrap - the authorized current state.
 * See ENG-003.
 *
 * Authenticates the seat FIRST, then returns the authorized snapshot, the
 * captured versions, `legalActions`, and `actionAvailability`. The game ID
 * locates the resource; it grants no authority. See SEC-002.
 */
import type { BootstrapResponse } from "@blockparty/contracts";
import { jsonOk } from "@/server/http/responses";
import { stubSnapshot } from "@/server/stub-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;

  // TODO(SEC-002): authenticate the seat capability and return UNAUTHENTICATED
  // when it is missing, revoked, expired, or scoped to a different game.
  //
  //   const actor = await readSeatCapability(gameId);
  //   if (actor === undefined) return jsonError("UNAUTHENTICATED");
  //
  // TODO(PROTO-004): load the aggregate and build the seat projection.

  const snapshot = stubSnapshot(gameId);
  const response: BootstrapResponse = {
    snapshot,
    aggregateVersion: snapshot.aggregateVersion,
    sequence: snapshot.sequence,
    serverTime: new Date().toISOString(),
  };
  return jsonOk(response);
}
