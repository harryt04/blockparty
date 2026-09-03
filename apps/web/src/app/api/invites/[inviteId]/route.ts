/**
 * GET /api/invites/[inviteId] - invite availability for the join gate.
 * See UX-011.
 *
 * The response reveals nothing about a private room beyond whether joining is
 * possible. Every failure returns the same generic shape so invite existence
 * cannot be probed. See SEC-003.
 */
import { STANDARD_CONFIGURATION, type InviteStatusResponse } from "@blockparty/contracts";
import { checkRateLimit } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const limit = checkRateLimit(request, "join");
  if (!limit.ok) return jsonError(limit.code, { reason: limit.reason });

  const { inviteId } = await params;
  if (inviteId.length === 0) return jsonError("NOT_FOUND");

  // TODO(SEC-002): look the invite up, check status, use policy, and expiry.
  // Return the same INVALID shape for unknown, expired, and malformed.
  const response: InviteStatusResponse = {
    status: "OPEN",
    gameName: "Placeholder lobby",
    openSeatCount: 2,
    seatCount: 4,
    configuration: STANDARD_CONFIGURATION,
  };
  return jsonOk(response);
}
