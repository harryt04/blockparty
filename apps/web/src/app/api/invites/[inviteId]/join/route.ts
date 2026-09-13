/**
 * POST /api/invites/[inviteId]/join - claim an open seat. See UX-011,
 * PRD-FUN-003.
 *
 * An invite ADMITS. It never operates an occupied seat and never grants host
 * authority. On success the server issues the seat capability as a cookie; the
 * response body carries no capability material. See SEC-002.
 */
import { InviteId, JoinGameRequest, type JoinGameResponse } from "@blockparty/contracts";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import type {
  AuditDocument,
  CapabilityDocument,
  GameDocument,
  InvitationDocument,
} from "@/server/games/create-game";
import {
  claimSeatInTransaction,
  JoinNameUnavailableError,
  JoinUnavailableError,
  setJoinCookies,
} from "@/server/games/join-game";
import { checkJsonContentType, checkRequestBodySize, guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  return withRequestTelemetry("POST /api/invites/:inviteId/join", request, () =>
    joinInvite(request, params),
  );
}

async function joinInvite(request: Request, params: Promise<{ inviteId: string }>) {
  const size = await checkRequestBodySize(request);
  if (!size.ok) return jsonError(size.code, { reason: size.reason });
  const contentType = checkJsonContentType(request);
  if (!contentType.ok) return jsonError(contentType.code, { reason: contentType.reason });
  const guard = guardMutation(request, "join");
  if (!guard.ok) return jsonError(guard.code, { reason: guard.reason });

  const { inviteId } = await params;
  if (!InviteId.safeParse(inviteId).success) return jsonError("NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_ENVELOPE");
  }

  const parsed = JoinGameRequest.safeParse(body);
  if (!parsed.success) return jsonError("INVALID_PAYLOAD");

  try {
    const database = getDb();
    const joined = await withMongoTransaction((session) =>
      claimSeatInTransaction(
        {
          games: database.collection<GameDocument>(COLLECTIONS.games),
          invitations: database.collection<InvitationDocument>(COLLECTIONS.invitations),
          capabilities: database.collection<CapabilityDocument>(COLLECTIONS.capabilities),
          auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
        },
        session,
        inviteId,
        parsed.data,
      ),
    );

    const responseBody: JoinGameResponse = {
      gameId: joined.gameId,
      seatId: joined.seatId,
      lobby: joined.lobby,
    };
    const response = jsonOk(responseBody);
    setJoinCookies(response, joined.capabilities);
    return response;
  } catch (error) {
    if (error instanceof JoinNameUnavailableError) return jsonError("INVALID_PAYLOAD");
    if (error instanceof JoinUnavailableError) return jsonError("NOT_FOUND");
    return jsonError("SERVER_BUSY");
  }
}
