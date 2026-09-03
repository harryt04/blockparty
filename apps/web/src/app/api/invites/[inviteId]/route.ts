/**
 * GET /api/invites/[inviteId] - invite availability for the join gate.
 * See UX-011.
 *
 * The response reveals nothing about a private room beyond whether joining is
 * possible. Every failure returns the same generic shape so invite existence
 * cannot be probed. See SEC-003.
 */
import { InviteId } from "@blockparty/contracts";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import type { GameDocument, InvitationDocument } from "@/server/games/create-game";
import { getInviteStatus } from "@/server/games/join-game";
import { checkRateLimit } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const limit = checkRateLimit(request, "join");
  if (!limit.ok) return jsonError(limit.code, { reason: limit.reason });

  const { inviteId } = await params;
  if (!InviteId.safeParse(inviteId).success) return jsonOk({ status: "INVALID" });

  try {
    const database = getDb();
    const response = await getInviteStatus(
      {
        invitations: database.collection<InvitationDocument>(COLLECTIONS.invitations),
        games: database.collection<GameDocument>(COLLECTIONS.games),
      },
      inviteId,
    );
    return jsonOk(response);
  } catch {
    return jsonError("SERVER_BUSY");
  }
}
