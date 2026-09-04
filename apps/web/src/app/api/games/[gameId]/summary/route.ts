/**
 * GET /api/games/[gameId]/summary - the authorized terminal projection.
 *
 * A completed game remains readable until retention cleanup, but its
 * authoritative snapshot and capabilities never cross this boundary. See
 * PRD-FUN-015, UX-019, and PROTO-004.
 */
import type { SummaryResponse } from "@blockparty/contracts";
import { canonicalHashBundle, getBundle } from "@blockparty/game-content";
import { readGameCapability } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { isProduction } from "@/server/env";
import { jsonError, jsonOk } from "@/server/http/responses";
import type { GameEventDocument } from "@/server/commands/handle-command";
import type { GameDocument } from "@/server/games/create-game";
import { projectionSeats, readPublicEvents } from "@/server/sync/recovery";
import { buildSummaryProjection } from "@/server/projections/authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ gameId: string }>;
  },
) {
  const { gameId } = await params;

  try {
    const actor = await readGameCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

    const database = getDb();
    const game = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (game === null) return jsonError("NOT_FOUND", { gameId });
    if (game.expiresAt <= new Date()) return jsonError("GAME_EXPIRED", { gameId });
    if (game.status !== "COMPLETED" && game.status !== "NO_CONTEST") {
      return jsonError("ILLEGAL_ACTION", { gameId, reason: "GAME_NOT_COMPLETE" });
    }
    if (!game.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }

    const bundle = getBundle(game.contentVersion, { production: isProduction });
    if (bundle === undefined || canonicalHashBundle(bundle) !== game.contentHash) {
      return jsonError("CONTENT_UNSUPPORTED", { gameId });
    }

    const publicEvents = await readPublicEvents(
      database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
      gameId,
    );
    const summary = buildSummaryProjection({
      gameId,
      status: game.status,
      state: game.snapshot,
      configuration: game.configuration,
      durationSeconds: Math.max(
        0,
        Math.floor((game.lastAuthoritativeActionAt.getTime() - game.createdAt.getTime()) / 1000),
      ),
      expiresAt: game.expiresAt,
      seats: projectionSeats(game),
      publicEvents,
    });
    const response: SummaryResponse = {
      summary,
      serverTime: new Date().toISOString(),
    };
    return jsonOk(response);
  } catch {
    return jsonError("SERVER_BUSY", { gameId });
  }
}
