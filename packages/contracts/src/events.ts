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
import { RulesConfiguration } from "./variants";

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

export const RulesConfiguredPayload = z
  .object({
    configuration: RulesConfiguration,
    contentHash: z.string().min(1).max(128),
  })
  .strict();
export type RulesConfiguredPayload = z.infer<typeof RulesConfiguredPayload>;

/** Stable bot explanation vocabulary. Never use display copy or free text. ENG-026. */
export const BotActionCategory = z.enum([
  "settle-obligation",
  "acquire-deed",
  "bid-auction",
  "improve-district",
  "propose-trade",
  "resolve-choice",
  "end-or-pass",
  "safe-fallback",
]);
export type BotActionCategory = z.infer<typeof BotActionCategory>;

export const BotDecisionReasonCode = z.enum([
  "OBLIGATION_SETTLEMENT_READY",
  "LIQUIDATE_FOR_OBLIGATION",
  "ACQUIRE_WITH_RESERVE",
  "DECLINE_BELOW_RESERVE",
  "BID_BELOW_VALUATION",
  "PASS_ABOVE_VALUATION",
  "IMPROVE_WITH_RESERVE",
  "IMMEDIATE_TRADE_AVAILABLE",
  "DETENTION_RELEASE_CHOICE",
  "SAFE_END_OR_PASS",
  "SAFE_LEGAL_FALLBACK",
]);
export type BotDecisionReasonCode = z.infer<typeof BotDecisionReasonCode>;

const BotFactorKey = z.enum(["balance", "reserve", "candidateCount", "valuation", "bid"]);

/**
 * A bot rationale event. Bounded public numeric factors and stable enums only:
 * never free text, seed, deck order, or private capability. ENG-026.
 */
export const BotDecisionExplainedPayload = z
  .object({
    actionCategory: BotActionCategory,
    reasonCode: BotDecisionReasonCode,
    factors: z
      .partialRecord(BotFactorKey, z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))
      .optional(),
  })
  .strict();
export type BotDecisionExplainedPayload = z.infer<typeof BotDecisionExplainedPayload>;
