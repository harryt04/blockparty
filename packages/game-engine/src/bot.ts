/**
 * Deterministic MVP bot policy. See ENG-026, PRD-FUN-011, and CONTENT-010.
 *
 * The policy accepts an explicitly public state projection and the already
 * advertised legal actions. It never reads the engine PRNG, deck cursors,
 * capabilities, or a clock. Recorded draws are an optional deterministic
 * tie-break input, so a replay can reproduce the same choice without future
 * randomness.
 */
import type {
  BotActionCategory,
  BotDecisionReasonCode,
  Command,
  LegalAction,
  Phase,
  SeatId,
} from "@blockparty/contracts";
import type { GameState, RuleSet } from "./index";
import { BotDecisionExplainedPayload } from "@blockparty/contracts";

export interface BotPublicSeat {
  readonly seatId: SeatId;
  readonly kind: "human" | "bot" | "open";
  readonly status: "active" | "eliminated";
  readonly balance: number;
  readonly position: number;
  readonly deedIds: readonly string[];
  readonly detained: boolean;
  readonly detentionTurnsRemaining: number;
  readonly detentionReleaseCardCount: number;
}

export interface BotPublicDeed {
  readonly deedId: string;
  readonly ownerSeatId?: SeatId;
  readonly mortgaged: boolean;
  readonly improvementLevel: number;
}

export interface BotPublicState {
  readonly phase: Phase;
  readonly activeSeatId?: SeatId;
  readonly prioritySeatId?: SeatId;
  readonly seats: readonly BotPublicSeat[];
  readonly deeds: readonly BotPublicDeed[];
  readonly bankCash: number;
  readonly jackpot?: number;
  readonly lastRoll?: readonly [number, number];
  readonly pendingAcquisitionDeedId?: string;
  readonly pendingAuctionDeedId?: string;
  readonly pendingImprovementDeedId?: string;
  readonly pendingTradeId?: string;
  readonly obligationAmount?: number;
  readonly startingCash: number;
  readonly deedPrices: Readonly<Record<string, number>>;
  readonly improvementCosts: Readonly<Record<string, number>>;
}

export interface BotDecision {
  readonly command: Command;
  readonly event: {
    readonly type: "BotDecisionExplained";
    readonly eventVersion: 1;
    readonly actorSeatId: SeatId;
    readonly payload: BotDecisionExplainedPayload;
  };
}

interface Candidate {
  readonly action: LegalAction;
  readonly command: Command;
  readonly category: BotActionCategory;
  readonly reasonCode: BotDecisionReasonCode;
  readonly priority: number;
  readonly stableKey: string;
  readonly factors: Readonly<Record<string, number>>;
}

/** Strip private engine data before giving a state to a bot. */
export function toBotPublicState(state: GameState, rules: RuleSet): BotPublicState {
  return Object.freeze({
    phase: state.phase,
    activeSeatId: state.activeSeatId,
    prioritySeatId: state.prioritySeatId,
    seats: Object.freeze(
      state.seats.map((seat) =>
        Object.freeze({
          seatId: seat.seatId,
          kind: seat.kind,
          status: seat.status,
          balance: seat.balance,
          position: seat.position,
          deedIds: Object.freeze([...seat.deedIds]),
          detained: seat.detained,
          detentionTurnsRemaining: seat.detentionTurnsRemaining,
          detentionReleaseCardCount: seat.detentionReleaseCardIds.length,
        }),
      ),
    ),
    deeds: Object.freeze(state.deeds.map((deed) => Object.freeze({ ...deed }))),
    bankCash: state.bank.cash,
    ...(state.jackpot === undefined ? {} : { jackpot: state.jackpot }),
    ...(state.lastRoll === undefined ? {} : { lastRoll: state.lastRoll }),
    ...(state.pendingAcquisitionDeedId === undefined
      ? {}
      : { pendingAcquisitionDeedId: state.pendingAcquisitionDeedId }),
    ...(state.pendingAuction === undefined
      ? {}
      : { pendingAuctionDeedId: state.pendingAuction.deedId }),
    ...(state.pendingImprovementAuction?.demands[0] === undefined
      ? {}
      : { pendingImprovementDeedId: state.pendingImprovementAuction.demands[0].deedId }),
    ...(state.pendingTrade === undefined ? {} : { pendingTradeId: state.pendingTrade.tradeId }),
    ...(state.obligation === undefined ? {} : { obligationAmount: state.obligation.amount }),
    startingCash: rules.content.economy.startingCash,
    deedPrices: Object.freeze(
      Object.fromEntries(rules.content.deeds.map((deed) => [deed.deedId, deed.price])),
    ),
    improvementCosts: Object.freeze(
      Object.fromEntries(
        rules.content.deeds.flatMap((deed) =>
          deed.improvementCost === undefined ? [] : [[deed.deedId, deed.improvementCost]],
        ),
      ),
    ),
  });
}

function constraint(action: LegalAction, key: string): string | number | boolean | undefined {
  return action.constraints?.[key];
}

function stringConstraint(action: LegalAction, key: string): string | undefined {
  const value = constraint(action, key);
  return typeof value === "string" ? value : undefined;
}

function auctionValuation(state: BotPublicState): number {
  if (state.pendingAuctionDeedId !== undefined) {
    return state.deedPrices[state.pendingAuctionDeedId] ?? 0;
  }
  if (state.pendingImprovementDeedId !== undefined) {
    return state.improvementCosts[state.pendingImprovementDeedId] ?? 0;
  }
  return 0;
}

function commandForAction(
  state: BotPublicState,
  actorSeatId: SeatId,
  action: LegalAction,
): Command | undefined {
  const deedId = stringConstraint(action, "deedId");
  switch (action.type) {
    case "AcquireDeed":
    case "DeclineAcquisition":
    case "MortgageDeed":
    case "RedeemMortgage":
    case "BuyImprovement":
    case "SellImprovement":
    case "RequestScarceImprovement":
      return deedId === undefined ? undefined : { type: action.type, deedId };
    case "PlaceAuctionBid": {
      const minBid = constraint(action, "minBid");
      const maxBid = constraint(action, "maxBid");
      if (typeof minBid !== "number" || typeof maxBid !== "number" || minBid > maxBid) {
        return undefined;
      }
      const valuation = auctionValuation(state) || Number.MAX_SAFE_INTEGER;
      const amount = Math.min(maxBid, Math.max(minBid, valuation - 1));
      return amount >= minBid && amount <= maxBid ? { type: "PlaceAuctionBid", amount } : undefined;
    }
    case "ChoosePendingOption": {
      const choiceId = stringConstraint(action, "choiceId");
      const optionId = stringConstraint(action, "optionId");
      return choiceId === undefined || optionId === undefined
        ? undefined
        : { type: "ChoosePendingOption", choiceId, optionId };
    }
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade": {
      const tradeId = stringConstraint(action, "tradeId");
      return tradeId === undefined ? undefined : { type: action.type, tradeId };
    }
    case "ProposeTrade": {
      const counterpartySeatId = stringConstraint(action, "counterpartySeatId");
      const actor = state.seats.find((seat) => seat.seatId === actorSeatId);
      const counterparty = state.seats.find((seat) => seat.seatId === counterpartySeatId);
      if (counterpartySeatId === undefined || actor === undefined || counterparty === undefined) {
        return undefined;
      }
      const offered = { cash: 0, deedIds: [] as string[], detentionReleaseCardIds: [] as string[] };
      const requested = {
        cash: 0,
        deedIds: [] as string[],
        detentionReleaseCardIds: [] as string[],
      };
      if (actor.balance > 1) offered.cash = 1;
      else if (actor.deedIds[0] !== undefined) offered.deedIds = [actor.deedIds[0]];
      else return undefined;
      if (counterparty.balance > 0) requested.cash = 1;
      else if (counterparty.deedIds[0] !== undefined) requested.deedIds = [counterparty.deedIds[0]];
      else return undefined;
      return { type: "ProposeTrade", counterpartySeatId, offered, requested };
    }
    case "RollDice":
    case "EndTurn":
    case "PassAuction":
    case "PayObligation":
    case "DeclareBankruptcy":
    case "StartGame":
    case "EndNoContest":
      return { type: action.type };
    case "ConfigureRules":
    case "AddBotSeat":
    case "RemoveSeat":
    case "ReplaceSeatWithBot":
    case "RequestSeatReclaim":
    case "ApproveSeatReclaim":
    case "TransferHost":
      return undefined;
  }
}

function actionCandidate(
  state: BotPublicState,
  actorSeatId: SeatId,
  action: LegalAction,
): Candidate | undefined {
  const command = commandForAction(state, actorSeatId, action);
  if (command === undefined) return undefined;
  const seat = state.seats.find((candidate) => candidate.seatId === actorSeatId);
  const balance = seat?.balance ?? 0;
  const reserve = Math.max(1, Math.floor(state.startingCash / 5));
  const deedId = stringConstraint(action, "deedId");
  const price = deedId === undefined ? 0 : (state.deedPrices[deedId] ?? 0);
  const cost = deedId === undefined ? 0 : (state.improvementCosts[deedId] ?? 0);
  const factors = { balance, reserve, candidateCount: 1 };
  switch (action.type) {
    case "PayObligation":
      return {
        action,
        command,
        category: "settle-obligation",
        reasonCode: "OBLIGATION_SETTLEMENT_READY",
        priority: 0,
        stableKey: "PayObligation",
        factors,
      };
    case "SellImprovement":
    case "MortgageDeed":
      return {
        action,
        command,
        category: "settle-obligation",
        reasonCode: "LIQUIDATE_FOR_OBLIGATION",
        priority: 1,
        stableKey: `${action.type}:${deedId ?? ""}`,
        factors,
      };
    case "DeclareBankruptcy":
      return {
        action,
        command,
        category: "settle-obligation",
        reasonCode: "LIQUIDATE_FOR_OBLIGATION",
        priority: 2,
        stableKey: "DeclareBankruptcy",
        factors,
      };
    case "AcquireDeed":
      return balance - price >= reserve
        ? {
            action,
            command,
            category: "acquire-deed",
            reasonCode: "ACQUIRE_WITH_RESERVE",
            priority: 10,
            stableKey: `${action.type}:${deedId ?? ""}`,
            factors: { ...factors, valuation: price },
          }
        : undefined;
    case "DeclineAcquisition":
      return {
        action,
        command,
        category: "acquire-deed",
        reasonCode: "DECLINE_BELOW_RESERVE",
        priority: 11,
        stableKey: `${action.type}:${deedId ?? ""}`,
        factors: { ...factors, valuation: price },
      };
    case "PlaceAuctionBid": {
      const amount = (command as { type: "PlaceAuctionBid"; amount: number }).amount;
      return {
        action,
        command,
        category: "bid-auction",
        reasonCode: "BID_BELOW_VALUATION",
        priority: 20,
        stableKey: `${action.type}:${amount}`,
        factors: {
          ...factors,
          valuation: auctionValuation(state),
          bid: amount,
        },
      };
    }
    case "PassAuction":
      return {
        action,
        command,
        category: "bid-auction",
        reasonCode: "PASS_ABOVE_VALUATION",
        priority: 21,
        stableKey: "PassAuction",
        factors,
      };
    case "BuyImprovement":
      return balance - cost >= reserve
        ? {
            action,
            command,
            category: "improve-district",
            reasonCode: "IMPROVE_WITH_RESERVE",
            priority: 30,
            stableKey: `${action.type}:${deedId ?? ""}`,
            factors: { ...factors, valuation: cost },
          }
        : undefined;
    case "ProposeTrade":
      return state.pendingTradeId === undefined && state.obligationAmount !== undefined
        ? {
            action,
            command,
            category: "propose-trade",
            reasonCode: "IMMEDIATE_TRADE_AVAILABLE",
            priority: 40,
            stableKey: JSON.stringify(command),
            factors,
          }
        : undefined;
    case "ChoosePendingOption":
      return {
        action,
        command,
        category: "resolve-choice",
        reasonCode: "DETENTION_RELEASE_CHOICE",
        priority: 50,
        stableKey: JSON.stringify(command),
        factors,
      };
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade":
      return {
        action,
        command,
        category: "resolve-choice",
        reasonCode: "IMMEDIATE_TRADE_AVAILABLE",
        priority: 51,
        stableKey: JSON.stringify(command),
        factors,
      };
    case "EndTurn":
    case "StartGame":
      return {
        action,
        command,
        category: "end-or-pass",
        reasonCode: "SAFE_END_OR_PASS",
        priority: 90,
        stableKey: action.type,
        factors,
      };
    case "EndNoContest":
      return undefined;
    case "RollDice":
      return {
        action,
        command,
        category: "end-or-pass",
        reasonCode: "SAFE_END_OR_PASS",
        priority: 80,
        stableKey: action.type,
        factors,
      };
    default:
      return {
        action,
        command,
        category: "safe-fallback",
        reasonCode: "SAFE_LEGAL_FALLBACK",
        priority: 100,
        stableKey: JSON.stringify(command),
        factors,
      };
  }
}

/** Select exactly one advertised legal action and explain the selection. */
export function chooseBotAction(
  state: BotPublicState,
  actorSeatId: SeatId,
  legal: readonly LegalAction[],
  recordedDraws: readonly number[] = [],
): BotDecision | undefined {
  const candidates = legal
    .map((action) => actionCandidate(state, actorSeatId, action))
    .filter((candidate): candidate is Candidate => candidate !== undefined)
    .sort(
      (left, right) =>
        left.priority - right.priority || left.stableKey.localeCompare(right.stableKey),
    );
  if (candidates.length === 0) return undefined;
  const bestPriority = candidates[0]?.priority ?? 0;
  const tied = candidates.filter((candidate) => candidate.priority === bestPriority);
  const draw = recordedDraws.at(-1) ?? 0;
  const selected = tied[Math.abs(draw) % tied.length] ?? tied[0];
  if (selected === undefined) return undefined;
  const eventPayload = BotDecisionExplainedPayload.parse({
    actionCategory: selected.category,
    reasonCode: selected.reasonCode,
    factors: selected.factors,
  });
  return {
    command: selected.command,
    event: {
      type: "BotDecisionExplained",
      eventVersion: 1,
      actorSeatId,
      payload: eventPayload,
    },
  };
}

/** The single MVP difficulty; callers cannot select another policy. */
export const BotPolicy = Object.freeze({ chooseAction: chooseBotAction });
