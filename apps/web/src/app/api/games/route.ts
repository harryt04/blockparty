/**
 * POST /api/games - create a private game. See ENG-003, PRD-FUN-001, UX-010.
 *
 * The real handler selects immutable content and rules versions, generates the
 * secret 256-bit seed, issues SEPARATE host and seat capabilities as cookies,
 * and returns only the opaque invite path. A capability never appears in the
 * response body or in a URL.
 */
import { CreateGameRequest, type CreateGameResponse } from "@blockparty/contracts";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import { isProduction } from "@/server/env";
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
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withRequestTelemetry("POST /api/games", request, () => createGame(request));
}

async function createGame(request: Request) {
  const size = await checkRequestBodySize(request);
  if (!size.ok) return jsonError(size.code, { reason: size.reason });
  const contentType = checkJsonContentType(request);
  if (!contentType.ok) return jsonError(contentType.code, { reason: contentType.reason });
  const guard = guardMutation(request, "create");
  if (!guard.ok) return jsonError(guard.code, { reason: guard.reason });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_ENVELOPE");
  }

  const parsed = CreateGameRequest.safeParse(body);
  if (!parsed.success) return jsonError("INVALID_PAYLOAD");

  try {
    const database = getDb();
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
      return jsonError("CONTENT_UNSUPPORTED");
    }
    return jsonError("SERVER_BUSY");
  }
}
