import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import {
  actionAvailability,
  legalActions,
  resolve,
  type BankState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, balance = 20_000): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const baseState = (overrides: Partial<GameState> = {}): GameState => {
  const seats = [seat("seat-a"), seat("seat-b")];
  const bank: BankState = {
    cash: 0,
    deedIds: PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId),
    improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
  };
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-legal-actions",
    aggregateVersion: 0,
    phase: "TurnStart",
    seats,
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank,
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
    ...overrides,
  };
};

describe("A15 legal action queries", () => {
  it("exposes only executable start and roll actions, with out-of-turn reasons", () => {
    const lobby = baseState({
      phase: "Lobby",
      activeSeatId: undefined,
      prioritySeatId: undefined,
    });
    expect(legalActions(lobby, "seat-a", RULES)).toEqual([{ type: "StartGame" }]);
    expect(legalActions(lobby, "seat-b", RULES)).toEqual([{ type: "StartGame" }]);

    const rolling = baseState({ phase: "AwaitRoll" });
    expect(legalActions(rolling, "seat-a", RULES)).toEqual([
      { type: "RollDice" },
      { type: "EndNoContest" },
    ]);
    expect(legalActions(rolling, "seat-b", RULES)).toEqual([{ type: "EndNoContest" }]);
    expect(actionAvailability(rolling, "seat-b", RULES)).toContainEqual({
      type: "RollDice",
      available: false,
      reasonCode: "OUT_OF_TURN",
      reason: "Waiting for the active seat to act.",
    });

    const ended = resolve(
      baseState(),
      { actorSeatId: "seat-a", command: { type: "EndTurn" } },
      RULES,
    );
    expect(ended).toMatchObject({
      ok: true,
      state: { phase: "AwaitRoll", activeSeatId: "seat-b", consecutiveMatchingRolls: 0 },
    });
    if (!ended.ok) throw new Error("expected the resolved turn to end");
    expect(ended.events.map((event) => event.type)).toEqual(["TurnEnded", "TurnStarted"]);

    const extraTurn = resolve(
      baseState({ phase: "ResolveMove", consecutiveMatchingRolls: 1 }),
      { actorSeatId: "seat-a", command: { type: "EndTurn" } },
      RULES,
    );
    expect(extraTurn).toMatchObject({
      ok: true,
      state: { phase: "AwaitRoll", activeSeatId: "seat-a", consecutiveMatchingRolls: 1 },
    });
  });

  it("reports the purchase boundary and keeps an unaffordable acquisition out of legalActions", () => {
    const pending = "d-sawhorse-lane";
    const offered = baseState({
      phase: "AwaitPurchase",
      seats: [seat("seat-a", 1_000), seat("seat-b")],
      pendingAcquisitionDeedId: pending,
    });
    expect(legalActions(offered, "seat-a", RULES)).toEqual([
      { type: "DeclineAcquisition", constraints: { deedId: pending } },
    ]);
    expect(actionAvailability(offered, "seat-a", RULES)).toContainEqual({
      type: "AcquireDeed",
      available: false,
      reasonCode: "INSUFFICIENT_FUNDS",
      reason: "There are not enough funds for this action.",
    });
  });

  it("exposes auction bid bounds from the current bid and balance", () => {
    const auction = baseState({
      phase: "AwaitAuction",
      pendingAuction: {
        deedId: "d-sawhorse-lane",
        highBid: 4_000,
        highBidderSeatId: "seat-b",
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
    });
    expect(legalActions(auction, "seat-a", RULES)).toEqual([
      {
        type: "PlaceAuctionBid",
        constraints: { minBid: 4_001, maxBid: 20_000 },
      },
      { type: "PassAuction" },
    ]);
    expect(legalActions(auction, "seat-b", RULES)).toEqual([]);
    expect(actionAvailability(auction, "seat-b", RULES)).toContainEqual({
      type: "PlaceAuctionBid",
      available: false,
      reasonCode: "AUCTION_PRIORITY_REQUIRED",
      reason: "Waiting for the current auction priority seat.",
    });
  });

  it("derives management actions through resolve, so every advertised action is accepted", () => {
    const deedId = "d-sawhorse-lane";
    const managed = baseState({
      phase: "TurnStart",
      seats: [{ ...seat("seat-a"), deedIds: [deedId] }, seat("seat-b")],
      deeds: baseState().deeds.map((deed) =>
        deed.deedId === deedId ? { ...deed, ownerSeatId: "seat-a" } : deed,
      ),
      bank: {
        cash: 0,
        deedIds: baseState().bank.deedIds.filter((id) => id !== deedId),
        improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
      },
    });
    const actions = legalActions(managed, "seat-a", RULES);
    expect(actions.some((action) => action.type === "MortgageDeed")).toBe(true);
    expect(
      actions.every((action) => {
        if (
          action.type === "MortgageDeed" ||
          action.type === "RedeemMortgage" ||
          action.type === "BuyImprovement" ||
          action.type === "SellImprovement" ||
          action.type === "RequestScarceImprovement"
        ) {
          const target = action.constraints?.deedId;
          return (
            typeof target === "string" &&
            resolve(
              managed,
              {
                actorSeatId: "seat-a",
                command: { type: action.type, deedId: target } as never,
              },
              RULES,
            ).ok
          );
        }
        return true;
      }),
    ).toBe(true);
  });
});
