/**
 * GET /api/games/[gameId]/sync - catch-up after a gap. See PROTO-004.
 *
 * Returns a contiguous authorized event range when the retained events cover
 * the client's position; otherwise a complete authorized snapshot with the
 * terminal sequence and version. Snapshot replacement is atomic in the client.
 *
 * The client's last sequence and version are a CACHE, not authority.
 */
import { SyncQuery } from "@blockparty/contracts";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { readSeatCapability } from "@/server/auth/session";
import { checkRateLimit } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import type { GameDocument } from "@/server/games/create-game";
import { recover, recoveryStore } from "@/server/sync/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const limit = checkRateLimit(request, "sync");
  if (!limit.ok) return jsonError(limit.code, { gameId, reason: limit.reason });

  const url = new URL(request.url);
  const hasSequence = url.searchParams.has("lastSequence");
  const hasVersion = url.searchParams.has("aggregateVersion");
  if (hasSequence !== hasVersion) return jsonError("INVALID_PAYLOAD", { gameId });
  const parsed = SyncQuery.safeParse({
    lastSequence: url.searchParams.get("lastSequence") ?? 0,
    aggregateVersion: url.searchParams.get("aggregateVersion") ?? 0,
  });
  if (!parsed.success) return jsonError("INVALID_PAYLOAD", { gameId });

  try {
    const actor = await readSeatCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

    const database = getDb();
    const game = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (game === null) return jsonError("NOT_FOUND", { gameId });
    if (game.status === "EXPIRED" || game.expiresAt <= new Date()) {
      return jsonError("GAME_EXPIRED", { gameId });
    }
    if (!game.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }

    const envelope = await recover(
      recoveryStore(database),
      game,
      actor.seatId,
      parsed.data.lastSequence,
      parsed.data.aggregateVersion,
    );
    if (envelope === undefined) return jsonError("CONTENT_UNSUPPORTED", { gameId });
    return jsonOk(envelope);
  } catch {
    return jsonError("SERVER_BUSY", { gameId });
  }
}
