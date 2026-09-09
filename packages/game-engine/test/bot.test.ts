import { describe, expect, it } from "vitest";
import {
  BotDecisionExplainedPayload,
  STANDARD_CONFIGURATION,
  type LegalAction,
} from "@blockparty/contracts";
import { CLASSIC_BUNDLE, PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  chooseBotAction,
  legalActions,
  runBotSoak,
  toBotPublicState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };
const CLASSIC_RULES: RuleSet = { content: CLASSIC_BUNDLE, configuration: STANDARD_CONFIGURATION };

const stateFor = (balance = 100_000): GameState => {
  const seat = (seatId: string): SeatState => ({
    seatId,
    kind: "bot",
    status: "active",
    balance,
    position: 0,
    deedIds: [],
    detained: false,
    detentionTurnsRemaining: 0,
    detentionReleaseCardIds: [],
  });
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "bot-test",
    aggregateVersion: 0,
    phase: "AwaitRoll",
    seats: [seat("seat-a"), seat("seat-b")],
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank: {
      cash: 0,
      deedIds: PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId),
      improvementInventory: PLACEHOLDER_BUNDLE.economy.improvementInventory,
    },
    consecutiveMatchingRolls: 0,
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

const classicTradeState = (): GameState => {
  const actorDeeds = ["deed-brasswick-lane", "deed-cinderbloom-way"];
  const counterpartyDeeds = ["deed-whisperwell-walk", "deed-bellspire-avenue"];
  const owned = new Set([...actorDeeds, ...counterpartyDeeds]);
  return {
    stateSchemaVersion: "2.0.0",
    contentVersion: CLASSIC_BUNDLE.contentVersion,
    gameId: "classic-bot-trade",
    aggregateVersion: 0,
    phase: "TurnStart",
    seats: [
      {
        seatId: "seat-a",
        kind: "bot",
        status: "active",
        balance: 100_000,
        position: 0,
        deedIds: actorDeeds,
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
      {
        seatId: "seat-b",
        kind: "bot",
        status: "active",
        balance: 100_000,
        position: 0,
        deedIds: counterpartyDeeds,
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
    ],
    deeds: CLASSIC_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      ownerSeatId: actorDeeds.includes(deed.deedId)
        ? "seat-a"
        : counterpartyDeeds.includes(deed.deedId)
          ? "seat-b"
          : undefined,
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank: {
      cash: 0,
      deedIds: CLASSIC_BUNDLE.deeds
        .map((deed) => deed.deedId)
        .filter((deedId) => !owned.has(deedId)),
      improvementInventory: CLASSIC_BUNDLE.economy.improvementInventory,
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

describe("BotPolicy", () => {
  it("chooses only an advertised action and emits bounded stable rationale", () => {
    const state = stateFor();
    const actions = legalActions(state, "seat-a", RULES);
    const decision = chooseBotAction(toBotPublicState(state, RULES), "seat-a", actions);

    expect(decision?.command).toEqual({ type: "RollDice" });
    expect(actions.some((action) => action.type === decision?.command.type)).toBe(true);
    expect(BotDecisionExplainedPayload.parse(decision?.event.payload)).toEqual({
      actionCategory: "end-or-pass",
      reasonCode: "SAFE_END_OR_PASS",
      factors: { balance: 100_000, reserve: 30_000, candidateCount: 1 },
    });
    expect(JSON.stringify(decision)).not.toContain("prng");
    expect(JSON.stringify(decision)).not.toContain("seed");
  });

  it("uses stable keys and recorded draws for deterministic ties", () => {
    const state = toBotPublicState(stateFor(), RULES);
    const actions: readonly LegalAction[] = [
      { type: "AcquireDeed", constraints: { deedId: "d-sawhorse-lane" } },
      { type: "AcquireDeed", constraints: { deedId: "d-chalk-arrow-walk" } },
    ];
    const first = chooseBotAction(state, "seat-a", actions, [3]);
    const second = chooseBotAction(state, "seat-a", [...actions].reverse(), [3]);

    expect(first).toEqual(second);
    expect(first?.command).toEqual({ type: "AcquireDeed", deedId: "d-sawhorse-lane" });
  });

  it("falls back to the safe advertised roll when no higher heuristic applies", () => {
    const state = toBotPublicState(stateFor(), RULES);
    const decision = chooseBotAction(state, "seat-a", [
      { type: "EndNoContest" },
      { type: "RollDice" },
    ]);

    expect(decision?.command).toEqual({ type: "RollDice" });
  });

  it("values scarce-improvement bids from public content data", () => {
    const state = {
      ...toBotPublicState(stateFor(), RULES),
      pendingImprovementDeedId: "d-sawhorse-lane",
    };
    const decision = chooseBotAction(state, "seat-a", [
      { type: "PlaceAuctionBid", constraints: { minBid: 1, maxBid: 15_000 } },
    ]);

    expect(decision?.command).toEqual({ type: "PlaceAuctionBid", amount: 9_999 });
    expect(decision?.event.payload).toMatchObject({ reasonCode: "BID_BELOW_VALUATION" });
  });

  it("proposes a legal cross-district swap toward completed sets", () => {
    const state = classicTradeState();
    const actions = legalActions(state, "seat-a", CLASSIC_RULES);
    const decision = chooseBotAction(toBotPublicState(state, CLASSIC_RULES), "seat-a", actions);

    expect(decision?.command).toEqual({
      type: "ProposeTrade",
      counterpartySeatId: "seat-b",
      offered: {
        cash: 0,
        deedIds: ["deed-brasswick-lane"],
        detentionReleaseCardIds: [],
      },
      requested: {
        cash: 0,
        deedIds: ["deed-bellspire-avenue"],
        detentionReleaseCardIds: [],
      },
    });
    expect(decision?.event.payload.reasonCode).toBe("IMMEDIATE_TRADE_AVAILABLE");
  });

  it("runs the reproducible 5,000-game matrix and records soak evidence", () => {
    const report = runBotSoak();

    expect(report.gameCount).toBe(5_000);
    expect(report.games).toHaveLength(5_000);
    expect(new Set(report.games.map((game) => game.seed)).size).toBe(5_000);
    expect(new Set(report.games.map((game) => game.seatCount))).toEqual(new Set([2, 3, 4, 5, 6]));
    expect(
      report.games.every((game) => game.contentVersion === CLASSIC_BUNDLE.contentVersion),
    ).toBe(true);
    expect(new Set(report.games.flatMap((game) => game.enabledToggles))).toEqual(
      new Set([
        "restSpaceJackpot",
        "doubleStartOnExactLanding",
        "noAuctionAfterDeclinedAcquisition",
        "noIncomeWhileDetained",
        "bonusForMatchingOnes",
        "startingAssetsDealt",
        "relaxedEvenBuilding",
        "unlimitedImprovementInventory",
      ]),
    );
    expect(report.games.every((game) => game.rejectedCommands === 0)).toBe(true);
    expect(report.games.every((game) => game.durationCommands <= report.maxCommandsPerGame)).toBe(
      true,
    );
    expect(report.stalledGames).toBe(report.games.filter((game) => game.stalled).length);
    expect(report.games[0]).toMatchObject({
      gameIndex: 0,
      preset: "standard",
      enabledToggles: [],
      seed: "000000001f62a5e82b6eb1f4377abd004386c90c4f92d5185b9ee12467aaed30",
    });
  }, 420_000);

  it("completes a seeded classic game at every supported seat count", () => {
    const report = runBotSoak({ gameCount: 10, maxCommandsPerGame: 10_000 });

    expect(report.stalledGames).toBe(0);
    expect(report.games.every((game) => game.rejectedCommands === 0)).toBe(true);
    expect(report.games.every((game) => game.terminalReason === "WINNER")).toBe(true);
    expect(new Set(report.games.map((game) => game.seatCount))).toEqual(new Set([2, 3, 4, 5, 6]));
  }, 30_000);

  it("repeats a fixed matrix byte-for-byte", () => {
    expect(runBotSoak({ gameCount: 16, maxCommandsPerGame: 64 })).toEqual(
      runBotSoak({ gameCount: 16, maxCommandsPerGame: 64 }),
    );
  });
});
