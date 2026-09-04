/**
 * POST /api/games/[gameId]/commands - the ONLY authoritative mutation path.
 * See ENG-003 and ENG-015.
 */
import { CommandEnvelope, HOST_ONLY_COMMANDS, PROTOCOL_VERSION } from "@blockparty/contracts";
import type { CommandAckEnvelope } from "@blockparty/contracts";
import { readHostCapability, readReclaimClaim, readSeatCapability } from "@/server/auth/session";
import { handleCommand } from "@/server/commands/handle-command";
import { COOKIE_NAMES, COOKIE_OPTIONS } from "@/server/auth/capabilities";
import { checkJsonContentType, checkRequestBodySize, guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";
import { withRequestTelemetry } from "@/server/observability/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  return withRequestTelemetry("POST /api/games/:gameId/commands", request, () =>
    postCommand(request, params),
  );
}

async function postCommand(request: Request, params: Promise<{ gameId: string }>) {
  const { gameId } = await params;
  const size = await checkRequestBodySize(request);
  if (!size.ok) return jsonError(size.code, { reason: size.reason });
  const contentType = checkJsonContentType(request);
  if (!contentType.ok) return jsonError(contentType.code, { gameId, reason: contentType.reason });

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

  // Host authority is separate from the seat command capability and is
  // selected by the server from the command type. SEC-002, ENG-015.
  const requiresHost = (HOST_ONLY_COMMANDS as readonly string[]).includes(envelope.payload.type);
  let actor;
  try {
    actor = requiresHost
      ? await readHostCapability(gameId)
      : envelope.payload.type === "RequestSeatReclaim"
        ? await readReclaimClaim(gameId)
        : await readSeatCapability(gameId);
  } catch {
    return jsonError("SERVER_BUSY", { gameId, requestId: envelope.requestId });
  }
  if (actor === undefined) {
    return jsonError("UNAUTHENTICATED", { gameId, requestId: envelope.requestId });
  }

  const outcome = await handleCommand(envelope, actor);
  if (!outcome.ok) {
    return jsonError(outcome.code, {
      gameId,
      requestId: envelope.requestId,
      reason: outcome.reason,
    });
  }
  const ack: CommandAckEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    type: "game.commandAck",
    requestId: envelope.requestId,
    gameId,
    serverTime: new Date().toISOString(),
    commandId: outcome.commandId,
    accepted: true,
    aggregateVersion: outcome.aggregateVersion,
    firstSequence: outcome.firstSequence,
    lastSequence: outcome.lastSequence,
  };
  const response = jsonOk(ack, { status: 202 });
  if (outcome.seatCapability !== undefined) {
    response.cookies.set(COOKIE_NAMES.seat, outcome.seatCapability, COOKIE_OPTIONS);
  }
  return response;
}
