/**
 * Domain events. See ENG-021 and PRD-FUN-008.
 *
 * Events are PascalCase and semantic (`DiceRolled`, `RentPaid`), never a
 * complete state replacement. The server assigns `sequence` and
 * `aggregateVersion` after the engine resolves; the engine does not.
 *
 * An event never carries seed material, PRNG state, future deck order, raw
 * capabilities, token hashes, or unauthorized private state. See PROTO-004.
 */
import { z } from "zod";
import { AggregateVersion, GameId, SeatId, Sequence, ServerTime } from "./common";

/**
 * Every domain event type the MVP emits. Payload schemas are added by the
 * ticket that implements each rule; the name list is the stable part.
 */
export const DomainEventType = z.enum([
  // Lobby and lifecycle
  "GameCreated",
  "RulesConfigured",
  "SeatClaimed",
  "SeatOpened",
  "BotSeatAdded",
  "GameStarted",
  "GameCompleted",
  "GameEndedNoContest",
  "GameExpired",
  // Turn flow
  "TurnStarted",
  "DiceRolled",
  "TokenMoved",
  "StartPaymentCollected",
  "PendingChoiceCreated",
  "PendingChoiceResolved",
  "TurnEnded",
  // Deeds and improvements
  "DeedAcquired",
  "AcquisitionDeclined",
  "DeedMortgaged",
  "MortgageRedeemed",
  "DeedTransferred",
  "ImprovementBought",
  "ImprovementSold",
  "ScarceImprovementRequested",
  "ScarceImprovementAwarded",
  // Auction
  "AuctionOpened",
  "AuctionBidPlaced",
  "AuctionPassed",
  "AuctionClosed",
  // Money and obligations
  "RentPaid",
  "FeePaid",
  "BankPaymentCollected",
  "PlayerPaymentCollected",
  "ObligationCreated",
  "ObligationSettled",
  "JackpotFunded",
  "JackpotPaid",
  // Cards and detention
  "CardDrawn",
  "CardDiscarded",
  "DetentionEntered",
  "DetentionReleased",
  "DetentionReleaseCardGranted",
  "DetentionReleaseCardUsed",
  // Trade
  "TradeProposed",
  "TradeAccepted",
  "TradeRejected",
  "TradeCancelled",
  "TradeStaled",
  // Elimination
  "BankruptcyDeclared",
  "SeatEliminated",
  // Recovery
  "SeatReplacedWithBot",
  "SeatReclaimRequested",
  "SeatReclaimApproved",
  "HostTransferred",
  "PlayPaused",
  "PlayResumed",
  // Bots
  "BotDecisionExplained",
]);
export type DomainEventType = z.infer<typeof DomainEventType>;

/**
 * The journal envelope around one domain event.
 * `(gameId, sequence)` is unique. See ENG-016.
 */
export const DomainEvent = z
  .object({
    gameId: GameId,
    sequence: Sequence,
    aggregateVersion: AggregateVersion,
    type: DomainEventType,
    /** Per-event-type payload version, for the ENG-027 upcasters. */
    eventVersion: z.int().min(1),
    /** Seat the event is attributed to. Absent for system transitions. */
    actorSeatId: SeatId.optional(),
    occurredAt: ServerTime,
    /** SCAFFOLD: typed per event type by the ticket that implements it. */
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export type DomainEvent = z.infer<typeof DomainEvent>;

/**
 * A bot rationale event. Bounded public numeric factors and a stable reason
 * code only: never free text, seed, deck order, or private capability. ENG-026.
 */
export const BotDecisionExplainedPayload = z
  .object({
    actionCategory: z.string().max(64),
    reasonCode: z.string().max(64),
    factors: z.record(z.string().max(32), z.number()).optional(),
  })
  .strict();
export type BotDecisionExplainedPayload = z.infer<typeof BotDecisionExplainedPayload>;
