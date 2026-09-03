/**
 * GET /api/games/[gameId]/sync - catch-up after a gap. See PROTO-004.
 *
 * Returns a contiguous authorized event range when the retained events cover
 * the client's position; otherwise a complete authorized snapshot with the
 * terminal sequence and version. Snapshot replacement is atomic in the client.
 *
 * The client's last sequence and version are a CACHE, not authority.
 */
import { PROTOCOL_VERSION, SyncQuery } from "@blockparty/contracts";
import type { SnapshotEnvelope } from "@blockparty/contracts";
import { checkRateLimit } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import { stubSnapshot } from "@/server/stub-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;

  const limit = checkRateLimit(request, "sync");
  if (!limit.ok) return jsonError(limit.code, { gameId, reason: limit.reason });

  const url = new URL(request.url);
  const parsed = SyncQuery.safeParse({
    lastSequence: url.searchParams.get("lastSequence") ?? 0,
    aggregateVersion: url.searchParams.get("aggregateVersion") ?? 0,
  });
  if (!parsed.success) return jsonError("INVALID_PAYLOAD", { gameId });

  // TODO(PROTO-004): authenticate the seat, then decide between a contiguous
  // game.events range and a full game.snapshot based on retained events.
  const snapshot = stubSnapshot(gameId);
  const envelope: SnapshotEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    type: "game.snapshot",
    gameId,
    serverTime: new Date().toISOString(),
    aggregateVersion: snapshot.aggregateVersion,
    sequence: snapshot.sequence,
    snapshot,
  };
  return jsonOk(envelope);
}
