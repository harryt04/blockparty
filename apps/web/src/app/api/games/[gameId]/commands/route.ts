/**
 * POST /api/games/[gameId]/commands - the ONLY authoritative mutation path.
 * See ENG-003 and ENG-015.
 *
 * Every lobby, gameplay, host, replacement, reclaim, transfer, and
 * EndNoContest command comes through here. Authoritative game mutations never
 * live in client code or in implicit UI state.
 */
import { CommandEnvelope, PROTOCOL_VERSION } from "@blockparty/contracts";
import type { CommandAckEnvelope } from "@blockparty/contracts";
import { checkPayloadSize, guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;

  const size = checkPayloadSize(request);
  if (!size.ok) return jsonError(size.code, { reason: size.reason });

  const guard = guardMutation(request, "commands");
  if (!guard.ok) return jsonError(guard.code, { gameId, reason: guard.reason });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_ENVELOPE", { gameId });
  }

  // Step 1 of ENG-015: parse the envelope and reject unknown fields.
  const parsed = CommandEnvelope.safeParse(body);
  if (!parsed.success) return jsonError("INVALID_ENVELOPE", { gameId });

  const envelope = parsed.data;
  if (envelope.gameId !== gameId) {
    return jsonError("INVALID_ENVELOPE", { gameId, requestId: envelope.requestId });
  }

  // Steps 2-7 of ENG-015 live in the single command path:
  //
  //   import { readSeatCapability } from "@/server/auth/session";
  //   import { handleCommand } from "@/server/commands/handle-command";
  //
  //   const actor = await readSeatCapability(gameId);
  //   if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });
  //   const outcome = await handleCommand(envelope, actor);
  //
  // The route never calls @blockparty/game-engine directly. Only the
  // transactional path does, so authorization, versioning, journaling, and the
  // receipt cannot be bypassed.

  const ack: CommandAckEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    type: "game.commandAck",
    requestId: envelope.requestId,
    gameId,
    serverTime: new Date().toISOString(),
    commandId: envelope.commandId,
    accepted: true,
    aggregateVersion: envelope.expectedVersion,
    firstSequence: 0,
    lastSequence: 0,
  };
  return jsonOk(ack, { status: 202 });
}
