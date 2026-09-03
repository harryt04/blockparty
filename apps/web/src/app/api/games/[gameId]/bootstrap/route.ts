/**
 * GET /api/games/[gameId]/bootstrap - the authorized current state.
 * See ENG-003.
 *
 * Authenticates the seat FIRST, then returns the authorized snapshot, the
 * captured versions, `legalActions`, and `actionAvailability`. The game ID
 * locates the resource; it grants no authority. See SEC-002.
 */
import type { BootstrapResponse } from "@blockparty/contracts";
import { canonicalHashBundle, getBundle } from "@blockparty/game-content";
import { readSeatCapability } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { isProduction } from "@/server/env";
import { jsonOk } from "@/server/http/responses";
import type { GameDocument } from "@/server/games/create-game";
import { buildSeatProjection } from "@/server/projections/authorize";
import { jsonError } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  try {
    // The game ID locates the aggregate; the seat cookie supplies authority.
    // See SEC-002 and PROTO-004.
    const actor = await readSeatCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

    const database = getDb();
    const game = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (game === null) return jsonError("NOT_FOUND", { gameId });

    const bundle = getBundle(game.contentVersion, { production: isProduction });
    if (bundle === undefined || canonicalHashBundle(bundle) !== game.contentHash) {
      return jsonError("CONTENT_UNSUPPORTED", { gameId });
    }
    if (!game.snapshot.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }

    const snapshot = buildSeatProjection(game.snapshot, actor.seatId, {
      rules: { content: bundle, configuration: game.configuration },
      status: game.status,
      versions: {
        contentVersion: game.contentVersion,
        rulesSchemaVersion: game.rulesSchemaVersion,
        variantSchemaVersion: game.variantSchemaVersion,
        stateSchemaVersion: game.stateSchemaVersion,
        engineVersion: game.engineVersion,
      },
      configuration: game.configuration,
      expiresAt: game.expiresAt,
      sequence: game.lastSequence,
      hostSeatId: game.hostSeatId,
      seats: game.seats.map((seat) => ({
        seatId: seat.seatId,
        kind: seat.kind,
        ...(seat.name === undefined ? {} : { name: seat.name }),
        token: seat.token,
        isHost: seat.seatId === game.hostSeatId,
        connected:
          game.lobby.seats.find((candidate) => candidate.seatId === seat.seatId)?.connected ??
          false,
      })),
    });
    const response: BootstrapResponse = {
      snapshot,
      aggregateVersion: game.aggregateVersion,
      sequence: game.lastSequence,
      serverTime: new Date().toISOString(),
    };
    return jsonOk(response);
  } catch {
    return jsonError("SERVER_BUSY", { gameId });
  }
}
