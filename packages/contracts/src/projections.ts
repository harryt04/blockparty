/**
 * Authorized projections: what one seat is allowed to see.
 *
 * These schemas define the presentation seam. They must NOT contain seed
 * material, PRNG state, future deck order, raw capabilities, token hashes,
 * host or reclaim credentials, or another seat's private state. The server
 * never serializes an internal full-state object to a client. See PROTO-004.
 *
 * Field names are the canonical wire layer (`deedId`, `district`, `detention`).
 * The UI maps them to display names. See docs/product/glossary.md.
 */
import { z } from "zod";
import {
  AggregateVersion,
  CapturedVersions,
  DisplayName,
  GameId,
  GameStatus,
  Money,
  NonNegativeMoney,
  Phase,
  SeatId,
  SeatKind,
  SeatStatus,
  Sequence,
  ServerTime,
} from "./common";
import { CommandTypeSchema } from "./commands";
import { RulesConfiguration } from "./variants";

/** Non-color-carrying identity for a seat. See DS-020 and DS-041. */
export const SeatToken = z
  .object({
    /** Stable index 1-6, mapped to a `player-N` color role by the UI. */
    colorIndex: z.int().min(1).max(6),
    /** Distinct silhouette key. Color is never the only cue. */
    shape: z.enum(["barricade", "cooler", "boombox", "hydrant", "flyer", "stoop"]),
    /** Pattern key, for grayscale and forced-colors modes. */
    pattern: z.enum(["solid", "stripe", "dot", "cross", "chevron", "grid"]),
  })
  .strict();
export type SeatToken = z.infer<typeof SeatToken>;

export const SeatProjection = z
  .object({
    seatId: SeatId,
    /** Absent for an open seat. */
    name: DisplayName.optional(),
    kind: SeatKind,
    status: SeatStatus,
    token: SeatToken.optional(),
    /** Public balance. Present once the game starts. */
    balance: Money.optional(),
    /** Route index of this seat's token. */
    position: z.int().min(0).optional(),
    detained: z.boolean().optional(),
    /** Count only. Card identities stay private until played. */
    detentionReleaseCardCount: z.int().min(0).optional(),
    deedIds: z.array(z.string().max(64)).max(128).optional(),
    isHost: z.boolean(),
    /** Ephemeral presence. Not a game-rule field. See PROTO-003. */
    connected: z.boolean(),
    /** True only for the seat this projection is addressed to. */
    isSelf: z.boolean(),
  })
  .strict();
export type SeatProjection = z.infer<typeof SeatProjection>;

export const SpaceCategory = z.enum([
  "start",
  "deed",
  "eventDraw",
  "fee",
  "rest",
  "detention",
  "sendToDetention",
]);
export type SpaceCategory = z.infer<typeof SpaceCategory>;

export const DeedCategory = z.enum(["district", "transit", "utility"]);
export type DeedCategory = z.infer<typeof DeedCategory>;

export const BoardSpaceProjection = z
  .object({
    spaceId: z.string().min(1).max(64),
    /** Position along the route. The route is winding, not a grid. DS-001. */
    routeIndex: z.int().min(0),
    /** Original space name from the content bundle. */
    name: z.string().min(1).max(64),
    category: SpaceCategory,
    deedCategory: DeedCategory.optional(),
    districtId: z.string().max(64).optional(),
    ownerSeatId: SeatId.optional(),
    mortgaged: z.boolean().optional(),
    improvementLevel: z.int().min(0).optional(),
    /** Public price, when the rules make it public. */
    price: NonNegativeMoney.optional(),
    /** Seats standing here now. */
    occupantSeatIds: z.array(SeatId).max(6),
  })
  .strict();
export type BoardSpaceProjection = z.infer<typeof BoardSpaceProjection>;

/**
 * A command this seat may execute right now, with bounded parameters.
 * Advisory for the UI. The server revalidates every submitted payload. ENG-023.
 */
export const LegalAction = z
  .object({
    type: CommandTypeSchema,
    /** Bounded parameters, such as a minimum and maximum auction bid. */
    constraints: z.record(z.string().max(32), z.union([z.number(), z.string(), z.boolean()])).optional(),
  })
  .strict();
export type LegalAction = z.infer<typeof LegalAction>;

/**
 * A relevant blocked action with a stable reason code and safe display copy.
 * This never grants authority. See PRD-FUN-009 and ENG-023.
 */
export const ActionAvailability = z
  .object({
    type: CommandTypeSchema,
    available: z.literal(false),
    reasonCode: z.string().max(64),
    /** Plain-language reason for the disabled control. See UX-016. */
    reason: z.string().max(160),
  })
  .strict();
export type ActionAvailability = z.infer<typeof ActionAvailability>;

/** Ephemeral presence. Never changes game state. See PROTO-003. */
export const PresenceEvent = z
  .object({
    seatId: SeatId,
    state: z.enum(["connected", "disconnected", "reconnected"]),
  })
  .strict();
export type PresenceEvent = z.infer<typeof PresenceEvent>;

export const AuctionProjection = z
  .object({
    deedId: z.string().min(1).max(64),
    highBid: NonNegativeMoney.optional(),
    highBidderSeatId: SeatId.optional(),
    minimumNextBid: NonNegativeMoney,
    prioritySeatId: SeatId,
    passedSeatIds: z.array(SeatId).max(6),
  })
  .strict();
export type AuctionProjection = z.infer<typeof AuctionProjection>;

export const ObligationProjection = z
  .object({
    amount: NonNegativeMoney,
    creditorSeatId: SeatId.optional(),
    reasonCode: z.string().max(64),
    reason: z.string().max(160),
  })
  .strict();
export type ObligationProjection = z.infer<typeof ObligationProjection>;

/**
 * The complete authorized snapshot for one seat. The database snapshot is
 * always authoritative; this is a projection of it.
 */
export const GameSnapshotProjection = z
  .object({
    gameId: GameId,
    status: GameStatus,
    phase: Phase,
    aggregateVersion: AggregateVersion,
    sequence: Sequence,
    versions: CapturedVersions,
    configuration: RulesConfiguration,
    /** Seat this projection is authorized for. */
    viewerSeatId: SeatId.optional(),
    activeSeatId: SeatId.optional(),
    prioritySeatId: SeatId.optional(),
    seats: z.array(SeatProjection).max(6),
    board: z.array(BoardSpaceProjection).max(128),
    auction: AuctionProjection.optional(),
    obligation: ObligationProjection.optional(),
    /** Present only when a variant enables it. See VAR-001. */
    jackpot: NonNegativeMoney.optional(),
    legalActions: z.array(LegalAction).max(64),
    actionAvailability: z.array(ActionAvailability).max(64),
    /** True while a required actor is disconnected. See PRD-FUN-014. */
    paused: z.boolean(),
    expiresAt: ServerTime,
  })
  .strict();
export type GameSnapshotProjection = z.infer<typeof GameSnapshotProjection>;

/** The lobby view, before a game starts. */
export const LobbyProjection = z
  .object({
    gameId: GameId,
    status: GameStatus,
    name: z.string().max(48).optional(),
    seatCount: z.int().min(2).max(6),
    seats: z.array(SeatProjection).max(6),
    configuration: RulesConfiguration,
    versions: CapturedVersions,
    viewerSeatId: SeatId.optional(),
    viewerIsHost: z.boolean(),
    /** Relative path only. The invite ID is opaque and carries no capability. */
    invitePath: z.string().max(256).optional(),
    canStart: z.boolean(),
    startBlockedReason: z.string().max(160).optional(),
    expiresAt: ServerTime,
  })
  .strict();
export type LobbyProjection = z.infer<typeof LobbyProjection>;

/** The completion view. See UX-019 and PRD-FUN-015. */
export const SummaryProjection = z
  .object({
    gameId: GameId,
    status: GameStatus,
    finishReason: z.enum(["WINNER", "NO_WINNER", "NO_CONTEST", "EXPIRED"]),
    winnerSeatId: SeatId.optional(),
    standings: z
      .array(
        z
          .object({
            seatId: SeatId,
            name: DisplayName.optional(),
            rank: z.int().min(1),
            finalBalance: Money,
            token: SeatToken.optional(),
          })
          .strict(),
      )
      .max(6),
    configuration: RulesConfiguration,
    durationSeconds: z.int().min(0),
    expiresAt: ServerTime,
  })
  .strict();
export type SummaryProjection = z.infer<typeof SummaryProjection>;
