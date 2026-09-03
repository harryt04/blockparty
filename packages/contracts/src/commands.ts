/**
 * Domain commands. See ENG-021 in docs/engineering/game-engine.md.
 *
 * Domain commands are PascalCase. The actor seat is NEVER taken from the
 * payload: the server derives it from the authenticated capability and ignores
 * any client-supplied identity, seat, phase, or host claim (SEC-002).
 *
 * SCAFFOLD: payload shapes are minimal. Each is filled in by its rules ticket.
 */
import { z } from "zod";
import { NonNegativeMoney, SeatId } from "./common";
import { RulesConfiguration } from "./variants";

const DeedId = z.string().min(1).max(64);
const ChoiceId = z.string().min(1).max(64);
const CardId = z.string().min(1).max(64);
const TradeId = z.string().min(1).max(64);

// --- Lobby and host commands ----------------------------------------------

export const ConfigureRules = z
  .object({ type: z.literal("ConfigureRules"), configuration: RulesConfiguration })
  .strict();

export const AddBotSeat = z.object({ type: z.literal("AddBotSeat") }).strict();

export const RemoveSeat = z.object({ type: z.literal("RemoveSeat"), seatId: SeatId }).strict();

export const StartGame = z.object({ type: z.literal("StartGame") }).strict();

// --- Turn commands ---------------------------------------------------------

export const RollDice = z.object({ type: z.literal("RollDice") }).strict();

export const AcquireDeed = z.object({ type: z.literal("AcquireDeed"), deedId: DeedId }).strict();

export const DeclineAcquisition = z
  .object({ type: z.literal("DeclineAcquisition"), deedId: DeedId })
  .strict();

export const EndTurn = z.object({ type: z.literal("EndTurn") }).strict();

// --- Auction commands ------------------------------------------------------

export const PlaceAuctionBid = z
  .object({ type: z.literal("PlaceAuctionBid"), amount: NonNegativeMoney })
  .strict();

export const PassAuction = z.object({ type: z.literal("PassAuction") }).strict();

// --- Asset management ------------------------------------------------------

export const MortgageDeed = z.object({ type: z.literal("MortgageDeed"), deedId: DeedId }).strict();

export const RedeemMortgage = z
  .object({ type: z.literal("RedeemMortgage"), deedId: DeedId })
  .strict();

export const BuyImprovement = z
  .object({ type: z.literal("BuyImprovement"), deedId: DeedId })
  .strict();

export const SellImprovement = z
  .object({ type: z.literal("SellImprovement"), deedId: DeedId })
  .strict();

/** Declares a one-level demand when finite inventory is contested. ENG-025. */
export const RequestScarceImprovement = z
  .object({ type: z.literal("RequestScarceImprovement"), deedId: DeedId })
  .strict();

// --- Obligations and elimination -------------------------------------------

export const PayObligation = z.object({ type: z.literal("PayObligation") }).strict();

export const DeclareBankruptcy = z.object({ type: z.literal("DeclareBankruptcy") }).strict();

// --- Trade -----------------------------------------------------------------

/**
 * Trades are escrow-free proposals with no future promises and no deferred
 * consideration. Acceptance revalidates every precondition. See ENG-025.
 */
const TradeSide = z
  .object({
    cash: NonNegativeMoney,
    deedIds: z.array(DeedId).max(64),
    detentionReleaseCardIds: z.array(CardId).max(8),
  })
  .strict();

export const ProposeTrade = z
  .object({
    type: z.literal("ProposeTrade"),
    counterpartySeatId: SeatId,
    offered: TradeSide,
    requested: TradeSide,
  })
  .strict();

export const AcceptTrade = z.object({ type: z.literal("AcceptTrade"), tradeId: TradeId }).strict();

export const RejectTrade = z.object({ type: z.literal("RejectTrade"), tradeId: TradeId }).strict();

export const CancelTrade = z.object({ type: z.literal("CancelTrade"), tradeId: TradeId }).strict();

// --- Pending choices -------------------------------------------------------

export const ChoosePendingOption = z
  .object({
    type: z.literal("ChoosePendingOption"),
    choiceId: ChoiceId,
    optionId: z.string().min(1).max(64),
  })
  .strict();

// --- Recovery and termination ----------------------------------------------
// Each of these runs only at a safe command boundary. See PROTO-003.

export const ReplaceSeatWithBot = z
  .object({ type: z.literal("ReplaceSeatWithBot"), seatId: SeatId })
  .strict();

export const ApproveSeatReclaim = z
  .object({ type: z.literal("ApproveSeatReclaim"), seatId: SeatId })
  .strict();

export const TransferHost = z
  .object({ type: z.literal("TransferHost"), toSeatId: SeatId })
  .strict();

export const EndNoContest = z.object({ type: z.literal("EndNoContest") }).strict();

// --- The union -------------------------------------------------------------

export const Command = z.discriminatedUnion("type", [
  ConfigureRules,
  AddBotSeat,
  RemoveSeat,
  StartGame,
  RollDice,
  AcquireDeed,
  DeclineAcquisition,
  EndTurn,
  PlaceAuctionBid,
  PassAuction,
  MortgageDeed,
  RedeemMortgage,
  BuyImprovement,
  SellImprovement,
  RequestScarceImprovement,
  PayObligation,
  DeclareBankruptcy,
  ProposeTrade,
  AcceptTrade,
  RejectTrade,
  CancelTrade,
  ChoosePendingOption,
  ReplaceSeatWithBot,
  ApproveSeatReclaim,
  TransferHost,
  EndNoContest,
]);
export type Command = z.infer<typeof Command>;
export type CommandType = Command["type"];

/**
 * A command the server has bound to an actor seat. The engine receives this,
 * never the raw request. The seat comes from the capability, not the client.
 */
export type ActorScopedCommand = {
  readonly actorSeatId: SeatId;
  readonly command: Command;
};

/** Commands only the host capability may issue. See SEC-002. */
export const HOST_ONLY_COMMANDS = [
  "ConfigureRules",
  "AddBotSeat",
  "RemoveSeat",
  "StartGame",
  "ReplaceSeatWithBot",
  "ApproveSeatReclaim",
  "TransferHost",
  "EndNoContest",
] as const satisfies readonly CommandType[];

/**
 * The command-type names as a standalone schema, for projections that
 * reference an action by name (`legalActions`, `actionAvailability`).
 */
export const CommandTypeSchema = z.enum([
  "ConfigureRules",
  "AddBotSeat",
  "RemoveSeat",
  "StartGame",
  "RollDice",
  "AcquireDeed",
  "DeclineAcquisition",
  "EndTurn",
  "PlaceAuctionBid",
  "PassAuction",
  "MortgageDeed",
  "RedeemMortgage",
  "BuyImprovement",
  "SellImprovement",
  "RequestScarceImprovement",
  "PayObligation",
  "DeclareBankruptcy",
  "ProposeTrade",
  "AcceptTrade",
  "RejectTrade",
  "CancelTrade",
  "ChoosePendingOption",
  "ReplaceSeatWithBot",
  "ApproveSeatReclaim",
  "TransferHost",
  "EndNoContest",
]);

/** Compile-time proof that CommandTypeSchema lists every Command variant. */
const _commandTypesAreExhaustive: CommandType extends z.infer<typeof CommandTypeSchema>
  ? z.infer<typeof CommandTypeSchema> extends CommandType
    ? true
    : never
  : never = true;
void _commandTypesAreExhaustive;
