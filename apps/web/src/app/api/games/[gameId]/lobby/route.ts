/**
 * GET /api/games/[gameId]/lobby - the authenticated lobby projection.
 *
 * The lobby carries the opaque admission path and host affordance, so it is
 * separate from the in-game snapshot projection. The seat cookie authorizes
 * the read; the game ID alone never does. See PRD-FUN-002/005 and UX-012.
 */
import { LobbyProjection } from "@blockparty/contracts";
import { readSeatCapability } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { jsonError, jsonOk } from "@/server/http/responses";
import type { GameDocument } from "@/server/games/create-game";
import { buildLobbyProjection } from "@/server/projections/authorize";
import { subscriberCount } from "@/server/sse/registry";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  return withRequestTelemetry("GET /api/games/:gameId/lobby", request, () => getLobby(params));
}

async function getLobby(params: Promise<{ gameId: string }>) {
  const { gameId } = await params;
  const actor = await readSeatCapability(gameId);
  if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

  try {
    const game = await getDb().collection<GameDocument>(COLLECTIONS.games).findOne({ _id: gameId });
    if (game === null) return jsonError("NOT_FOUND", { gameId });
    if (game.expiresAt <= new Date() || game.status === "EXPIRED") {
      return jsonError("GAME_EXPIRED", { gameId });
    }
    if (!game.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }
    if (game.status !== "LOBBY") return jsonError("PHASE_MISMATCH", { gameId });

    const seats = game.seats.map((seat) => ({
      seatId: seat.seatId,
      ...(seat.name === undefined ? {} : { name: seat.name }),
      kind: seat.kind,
      status: seat.status,
      token: seat.token,
      isHost: seat.seatId === game.hostSeatId,
      connected:
        seat.kind === "bot" ||
        subscriberCount(gameId, seat.seatId) > 0 ||
        (game.lobby.seats.find((candidate) => candidate.seatId === seat.seatId)?.connected ??
          false),
      isSelf: seat.seatId === actor.seatId,
    }));
    const lobby = buildLobbyProjection({
      gameId: game._id,
      status: "LOBBY",
      ...(game.name === undefined ? {} : { name: game.name }),
      seatCount: game.seatCount,
      configuration: game.configuration,
      versions: game.lobby.versions,
      seats,
      viewerSeatId: actor.seatId,
      viewerIsHost: actor.seatId === game.hostSeatId,
      invitePath: game.lobby.invitePath,
      canStart: game.seats.every((seat) => seat.kind !== "open"),
      ...(game.seats.every((seat) => seat.kind !== "open")
        ? {}
        : { startBlockedReason: "Every seat must be filled by a person or bot." }),
      expiresAt: game.expiresAt,
    });
    return jsonOk(LobbyProjection.parse(lobby));
  } catch {
    return jsonError("SERVER_BUSY", { gameId });
  }
}
