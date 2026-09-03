import "server-only";

/**
 * Route Handler response helpers.
 *
 * Every error carries a stable code and safe display copy. A raw exception
 * string, a stack, a payload, a capability, or private state never reaches a
 * response body. See SEC-004.
 */
import {
  ERROR_HTTP_STATUS,
  ERROR_RETRYABLE,
  PROTOCOL_VERSION,
  type ErrorCode,
  type ErrorEnvelope,
} from "@blockparty/contracts";
import { NextResponse } from "next/server";

/** Safe display copy per code. Never interpolate a caught exception here. */
const SAFE_MESSAGES: Record<ErrorCode, string> = {
  INVALID_ENVELOPE: "That request was not in a form the server accepts.",
  INVALID_PAYLOAD: "Some of that information was not valid.",
  UNAUTHENTICATED: "You need to join this game before you can act.",
  FORBIDDEN: "That action is not available to your seat.",
  NOT_FOUND: "That game or invite is not available.",
  GAME_EXPIRED: "This game is no longer available.",
  STALE_VERSION: "The game moved on. Refreshing to the current state.",
  ILLEGAL_ACTION: "That action is not legal right now.",
  PHASE_MISMATCH: "The game is at a different point than your screen showed.",
  DUPLICATE_COMMAND: "That action was already recorded.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  SERVER_BUSY: "The server is busy. Try again shortly.",
  PROTOCOL_UNSUPPORTED: "This app version is out of date. Reload to continue.",
  CONTENT_UNSUPPORTED: "This game uses content this server cannot read.",
  INTERNAL: "Something went wrong on our side.",
  UNIMPLEMENTED: "That part of the game is not built yet.",
};

export function jsonOk<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init?.headers },
  });
}

export function jsonError(
  code: ErrorCode,
  options: { gameId?: string; requestId?: string; reason?: string } = {},
): NextResponse {
  const envelope: ErrorEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    type: "game.error",
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    serverTime: new Date().toISOString(),
    error: {
      code,
      message: SAFE_MESSAGES[code],
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
      retryable: ERROR_RETRYABLE[code],
    },
  };
  return NextResponse.json(envelope, {
    status: ERROR_HTTP_STATUS[code],
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * A deliberately generic not-found. Invite and game lookups use this so a
 * private room's existence cannot be probed. See SEC-003.
 */
export function notFound(): NextResponse {
  return jsonError("NOT_FOUND");
}
