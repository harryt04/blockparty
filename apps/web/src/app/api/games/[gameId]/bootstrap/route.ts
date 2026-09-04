/**
 * GET /api/games/[gameId]/bootstrap - the authorized current state.
 * See ENG-003.
 *
 * Authenticates the seat or separate reclaim claim FIRST, then returns the authorized snapshot, the
 * captured versions, `legalActions`, and `actionAvailability`. The game ID
 * locates the resource; it grants no authority. See SEC-002.
 */
import type { BootstrapResponse } from "@blockparty/contracts";
import { readGameCapability } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { jsonOk } from "@/server/http/responses";
import type { GameDocument } from "@/server/games/create-game";
import { capturedRuleSet } from "@/server/games/captured-rules";
import { buildSeatProjection } from "@/server/projections/authorize";
import { jsonError } from "@/server/http/responses";
import { subscriberCount } from "@/server/sse/registry";
import type { GameEventDocument } from "@/server/commands/handle-command";
import { readPublicEvents } from "@/server/sync/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  try {
    // The game ID locates the aggregate; the seat or reclaim cookie supplies authority.
    // See SEC-002 and PROTO-004.
    const actor = await readGameCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

    const database = getDb();
    const game = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (game === null) return jsonError("NOT_FOUND", { gameId });

    const rules = capturedRuleSet(game);
    if (rules === undefined) {
      return jsonError("CONTENT_UNSUPPORTED", { gameId });
    }
    if (!game.snapshot.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }

    const publicEvents = await readPublicEvents(
      database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
      gameId,
    );

    const snapshot = buildSeatProjection(game.snapshot, actor.seatId, {
      rules,
      status: game.status,
      versions: {
        contentVersion: game.contentVersion,
        rulesSchemaVersion: game.rulesSchemaVersion,
        variantSchemaVersion: game.variantSchemaVersion,
        stateSchemaVersion: game.stateSchemaVersion,
        engineVersion: game.engineVersion,
      },
      configuration: rules.configuration,
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
          seat.kind === "bot" ||
          subscriberCount(gameId, seat.seatId) > 0 ||
          (game.lobby.seats.find((candidate) => candidate.seatId === seat.seatId)?.connected ??
            false),
      })),
      paused: game.paused ?? false,
      publicEvents,
      viewerCapabilityKind: actor.kind === "reclaim" ? "reclaim" : "seat",
      safeBoundary:
        game.snapshot.effectQueue.length === 0 && game.snapshot.pendingChoice === undefined,
      pendingSeatReclaimId: game.pendingSeatReclaimId,
      pendingHostClaimSeatId: game.pendingHostClaimSeatId,
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
