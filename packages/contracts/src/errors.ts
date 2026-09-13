/**
 * Protocol error codes. See PROTO-002 in docs/engineering/realtime-and-data.md.
 *
 * Error responses carry a stable code and safe display copy. They never carry
 * capability material, raw payloads, private state, or the reason a lookup
 * failed in a way that reveals whether a private game exists (SEC-003).
 */
import { z } from "zod";
import { ProtocolVersion, RequestId, ServerTime } from "./common";

export const ErrorCode = z.enum([
  /** Schema or bounded input failed. Do not retry unchanged. */
  "INVALID_ENVELOPE",
  "INVALID_PAYLOAD",
  /** Missing or invalid capability, or the wrong seat. */
  "UNAUTHENTICATED",
  "FORBIDDEN",
  /** Resource unavailable or no longer retained. */
  "NOT_FOUND",
  "GAME_EXPIRED",
  /** expectedVersion differs. Request sync. */
  "STALE_VERSION",
  /** The engine rejects the action now. Refresh legal actions. */
  "ILLEGAL_ACTION",
  "PHASE_MISMATCH",
  /** Already committed. Treat the stored ACK as success. */
  "DUPLICATE_COMMAND",
  /** Retryable admission failure. Back off with jitter. */
  "RATE_LIMITED",
  "SERVER_BUSY",
  /** Client or game incompatible. */
  "PROTOCOL_UNSUPPORTED",
  "CONTENT_UNSUPPORTED",
  /** Unexpected server failure. Retry only with the same commandId. */
  "INTERNAL",
  /** Scaffolding only: the real path is not built yet. Remove before MILE-004. */
  "UNIMPLEMENTED",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Maps an error code to the HTTP status a Route Handler returns. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_ENVELOPE: 400,
  INVALID_PAYLOAD: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GAME_EXPIRED: 410,
  STALE_VERSION: 409,
  ILLEGAL_ACTION: 422,
  PHASE_MISMATCH: 409,
  DUPLICATE_COMMAND: 200,
  RATE_LIMITED: 429,
  SERVER_BUSY: 503,
  PROTOCOL_UNSUPPORTED: 426,
  CONTENT_UNSUPPORTED: 426,
  INTERNAL: 500,
  UNIMPLEMENTED: 501,
};

/** Whether a client may retry the same request unchanged. */
export const ERROR_RETRYABLE: Record<ErrorCode, boolean> = {
  INVALID_ENVELOPE: false,
  INVALID_PAYLOAD: false,
  UNAUTHENTICATED: false,
  FORBIDDEN: false,
  NOT_FOUND: false,
  GAME_EXPIRED: false,
  STALE_VERSION: false,
  ILLEGAL_ACTION: false,
  PHASE_MISMATCH: false,
  DUPLICATE_COMMAND: false,
  RATE_LIMITED: true,
  SERVER_BUSY: true,
  PROTOCOL_UNSUPPORTED: false,
  CONTENT_UNSUPPORTED: false,
  INTERNAL: true,
  UNIMPLEMENTED: false,
};

/**
 * The `game.error` transport envelope.
 * `message` is safe display copy, never a raw exception string.
 */
export const ErrorEnvelope = z
  .object({
    protocolVersion: ProtocolVersion,
    type: z.literal("game.error"),
    requestId: RequestId.optional(),
    serverTime: ServerTime,
    error: z
      .object({
        code: ErrorCode,
        message: z.string().max(280),
        /** Optional stable sub-reason for UI copy. Never free text from an exception. */
        reason: z.string().max(64).optional(),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
