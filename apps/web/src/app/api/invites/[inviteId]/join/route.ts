/**
 * POST /api/invites/[inviteId]/join - claim an open seat. See UX-011,
 * PRD-FUN-003.
 *
 * An invite ADMITS. It never operates an occupied seat and never grants host
 * authority. On success the server issues the seat capability as a cookie; the
 * response body carries no capability material. See SEC-002.
 */
import { JoinGameRequest, type JoinGameResponse } from "@blockparty/contracts";
import { guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import { stubLobby } from "@/server/stub-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const guard = guardMutation(request, "join");
  if (!guard.ok) return jsonError(guard.code, { reason: guard.reason });

  const { inviteId } = await params;
  if (inviteId.length === 0) return jsonError("NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_ENVELOPE");
  }

  const parsed = JoinGameRequest.safeParse(body);
  if (!parsed.success) return jsonError("INVALID_PAYLOAD");

  // TODO(ENG-003): validate admission, confirm the name is unique among active
  // seats by normalized case-insensitive comparison, claim an open seat in one
  // transaction, issue the seat capability cookie, and return the authorized
  // lobby projection.
  const gameId = "00000000-0000-4000-8000-000000000000";
  const response: JoinGameResponse = {
    gameId,
    seatId: "seat-1",
    lobby: stubLobby(gameId),
  };
  return jsonOk(response);
}
