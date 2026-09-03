/**
 * POST /api/games - create a private game. See ENG-003, PRD-FUN-001, UX-010.
 *
 * The real handler selects immutable content and rules versions, generates the
 * secret 256-bit seed, issues SEPARATE host and seat capabilities as cookies,
 * and returns only the opaque invite path. A capability never appears in the
 * response body or in a URL.
 */
import { CreateGameRequest, type CreateGameResponse } from "@blockparty/contracts";
import { guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import { stubLobby } from "@/server/stub-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  // TODO(ENG-003): create the game aggregate in one transaction; generate the
  // secret seed with node:crypto; capture the content, rules, variant, state,
  // and engine versions; create the invitation; issue the host and seat
  // capabilities as Set-Cookie headers; set the rolling 30-day expiry.
  const gameId = "00000000-0000-4000-8000-000000000000";
  const response: CreateGameResponse = {
    gameId,
    invitePath: "/join/placeholder-invite-id-not-real",
    lobby: stubLobby(gameId),
  };
  return jsonOk(response, { status: 201 });
}
