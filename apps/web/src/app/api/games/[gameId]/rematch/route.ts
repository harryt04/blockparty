/**
 * POST /api/games/[gameId]/rematch - create a fresh private game from
 * explicit participant and variant choices. The old game's capabilities are
 * never reused. See UX-019, PRD-FUN-015, and SEC-002.
 */
import { CreateGameRequest, type CreateGameResponse } from "@blockparty/contracts";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { isProduction } from "@/server/env";
import { readGameCapability } from "@/server/auth/session";
import {
  createGameInTransaction,
  setCreationCookies,
  type AuditDocument,
  type CapabilityDocument,
  type GameDocument,
  type HostCapabilityDocument,
  type InvitationDocument,
} from "@/server/games/create-game";
import { checkJsonContentType, checkRequestBodySize, guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const size = await checkRequestBodySize(request);
  if (!size.ok) return jsonError(size.code, { gameId, reason: size.reason });
  const contentType = checkJsonContentType(request);
  if (!contentType.ok) return jsonError(contentType.code, { gameId, reason: contentType.reason });
  const guard = guardMutation(request, "create");
  if (!guard.ok) return jsonError(guard.code, { gameId, reason: guard.reason });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_ENVELOPE", { gameId });
  }
  const parsed = CreateGameRequest.safeParse(body);
  if (!parsed.success) return jsonError("INVALID_PAYLOAD", { gameId });

  try {
    const actor = await readGameCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

    const database = getDb();
    const previous = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (previous === null) return jsonError("NOT_FOUND", { gameId });
    if (previous.expiresAt <= new Date()) return jsonError("GAME_EXPIRED", { gameId });
    if (previous.status !== "COMPLETED" && previous.status !== "NO_CONTEST") {
      return jsonError("ILLEGAL_ACTION", { gameId, reason: "GAME_NOT_COMPLETE" });
    }
    if (!previous.seats.some((seat) => seat.seatId === actor.seatId)) {
      return jsonError("FORBIDDEN", { gameId });
    }

    const created = await withMongoTransaction((session) =>
      createGameInTransaction(
        {
          games: database.collection<GameDocument>(COLLECTIONS.games),
          invitations: database.collection<InvitationDocument>(COLLECTIONS.invitations),
          capabilities: database.collection<CapabilityDocument>(COLLECTIONS.capabilities),
          hostCapabilities: database.collection<HostCapabilityDocument>(
            COLLECTIONS.hostCapabilities,
          ),
          auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
        },
        session,
        parsed.data,
        new Date(),
        { production: isProduction },
      ),
    );

    const responseBody: CreateGameResponse = {
      gameId: created.lobby.gameId,
      invitePath: created.lobby.invitePath!,
      lobby: created.lobby,
    };
    const response = jsonOk(responseBody, { status: 201 });
    setCreationCookies(response, created.capabilities);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_UNSUPPORTED") {
      return jsonError("CONTENT_UNSUPPORTED", { gameId });
    }
    return jsonError("SERVER_BUSY", { gameId });
  }
}
