/**
 * HTTP request and response schemas, one per Route Handler in ENG-003.
 *
 * No request or response carries a capability value. Capabilities travel as
 * secure cookies and never appear in a URL, body, log, or analytics event.
 * See SEC-002.
 */
import { z } from "zod";
import {
  AggregateVersion,
  DisplayName,
  GameId,
  InviteId,
  SeatCount,
  SeatId,
  Sequence,
  ServerTime,
} from "./common";
import { RulesConfiguration, RulesPreset } from "./variants";
import {
  GameSnapshotProjection,
  LobbyProjection,
  SeatToken,
  SummaryProjection,
} from "./projections";

// --- POST /api/games -------------------------------------------------------

export const CreateGameRequest = z
  .object({
    /** Optional, length-limited room name. Never a personal name. */
    name: z.string().trim().max(48).optional(),
    seatCount: SeatCount,
    /** Seats filled by the single MVP bot difficulty. */
    botSeatCount: z.int().min(0).max(5),
    preset: RulesPreset,
    configuration: RulesConfiguration,
    /** The 13+ notice must be acknowledged before creation. See SEC-005. */
    acknowledged13Plus: z.literal(true),
  })
  .strict()
  .refine((value) => value.botSeatCount < value.seatCount, {
    message: "At least one seat must stay open for a human",
    path: ["botSeatCount"],
  })
  .refine((value) => value.preset === value.configuration.preset, {
    message: "The request preset must match the resolved configuration.",
    path: ["preset"],
  });
export type CreateGameRequest = z.infer<typeof CreateGameRequest>;

export const CreateGameResponse = z
  .object({
    gameId: GameId,
    /** Relative invite path. The invite ID is opaque and grants admission only. */
    invitePath: z.string().max(256),
    lobby: LobbyProjection,
  })
  .strict();
export type CreateGameResponse = z.infer<typeof CreateGameResponse>;

// --- GET /api/invites/[inviteId] -------------------------------------------

/**
 * Invite availability for the join gate. The response reveals nothing about a
 * private room beyond whether joining is possible, and uses a generic shape
 * for every failure so invite existence cannot be probed. See SEC-003.
 */
export const InviteStatusResponse = z
  .object({
    status: z.enum(["OPEN", "FULL", "STARTED", "ENDED", "INVALID"]),
    /** Present only when status is OPEN. */
    gameName: z.string().max(48).optional(),
    openSeatCount: z.int().min(0).max(6).optional(),
    seatCount: SeatCount.optional(),
    configuration: RulesConfiguration.optional(),
  })
  .strict();
export type InviteStatusResponse = z.infer<typeof InviteStatusResponse>;

// --- POST /api/invites/[inviteId]/join -------------------------------------

export const JoinGameRequest = z
  .object({
    name: DisplayName,
    token: SeatToken,
    acknowledged13Plus: z.literal(true),
  })
  .strict();
export type JoinGameRequest = z.infer<typeof JoinGameRequest>;

/**
 * The seat capability is issued as a Set-Cookie header, never in this body.
 */
export const JoinGameResponse = z
  .object({
    gameId: GameId,
    seatId: SeatId,
    lobby: LobbyProjection,
  })
  .strict();
export type JoinGameResponse = z.infer<typeof JoinGameResponse>;

// --- GET /api/games/[gameId]/bootstrap -------------------------------------

export const BootstrapResponse = z
  .object({
    snapshot: GameSnapshotProjection,
    aggregateVersion: AggregateVersion,
    sequence: Sequence,
    serverTime: ServerTime,
  })
  .strict();
export type BootstrapResponse = z.infer<typeof BootstrapResponse>;

// --- GET /api/games/[gameId]/summary --------------------------------------

export const SummaryResponse = z
  .object({
    summary: SummaryProjection,
    serverTime: ServerTime,
  })
  .strict();
export type SummaryResponse = z.infer<typeof SummaryResponse>;

// --- GET /api/games/[gameId]/sync ------------------------------------------

export const SyncQuery = z
  .object({
    lastSequence: z.coerce.number().int().min(0),
    aggregateVersion: z.coerce.number().int().min(0),
  })
  .strict();
export type SyncQuery = z.infer<typeof SyncQuery>;

// --- Health ----------------------------------------------------------------

/** Liveness. Carries no game data and no secret. See ENG-003. */
export const HealthLiveResponse = z
  .object({ status: z.literal("ok"), serverTime: ServerTime })
  .strict();
export type HealthLiveResponse = z.infer<typeof HealthLiveResponse>;

/**
 * Readiness reports dependency and migration state. It names no host,
 * credential, or connection string.
 */
export const HealthReadyResponse = z
  .object({
    status: z.enum(["ready", "degraded", "unavailable"]),
    serverTime: ServerTime,
    checks: z
      .object({
        database: z.enum(["ok", "not_configured", "unreachable"]),
        contentBundle: z.enum(["ok", "invalid"]),
      })
      .strict(),
  })
  .strict();
export type HealthReadyResponse = z.infer<typeof HealthReadyResponse>;

// --- POST /api/internal/cleanup --------------------------------------------

/** Scheduled retention cleanup. Never a player operation. See ENG-017. */
export const CleanupResponse = z
  .object({
    expiredGames: z.int().min(0),
    deletedGames: z.int().min(0),
    revokedCapabilities: z.int().min(0),
    serverTime: ServerTime,
  })
  .strict();
export type CleanupResponse = z.infer<typeof CleanupResponse>;

/** InviteId is re-exported so route handlers validate the path parameter. */
export { InviteId };
