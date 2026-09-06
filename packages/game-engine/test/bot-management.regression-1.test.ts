import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  chooseBotAction,
  legalActions,
  toBotPublicState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };
const deedId = "d-sawhorse-lane";

const seat = (seatId: string, balance = 100_000): SeatState => ({
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

const healthyOwnedDeedState = (): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "bot-management-regression",
  aggregateVersion: 0,
  phase: "TurnStart",
  seats: [{ ...seat("seat-a"), deedIds: [deedId] }, seat("seat-b")],
  deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
    deedId: deed.deedId,
    ownerSeatId: deed.deedId === deedId ? "seat-a" : undefined,
    mortgaged: false,
    improvementLevel: 0,
  })),
  bank: {
    cash: 0,
    deedIds: PLACEHOLDER_BUNDLE.deeds
      .map((deed) => deed.deedId)
      .filter((candidate) => candidate !== deedId),
    improvementInventory: PLACEHOLDER_BUNDLE.economy.improvementInventory,
  },
  consecutiveMatchingRolls: 0,
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

describe("BotPolicy management decisions", () => {
  it("does not mortgage a healthy deed outside an obligation", () => {
    // Regression: BOT-MORTGAGE — healthy bots mortgaged every deed immediately.
    // Found by /qa on 2026-09-06
    // Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-06.md
    const state = healthyOwnedDeedState();
    const actions = legalActions(state, "seat-a", RULES);

    expect(actions).toContainEqual({ type: "MortgageDeed", constraints: { deedId } });

    const decision = chooseBotAction(toBotPublicState(state, RULES), "seat-a", actions);

    expect(decision?.command).toEqual({ type: "EndTurn" });
  });
});
