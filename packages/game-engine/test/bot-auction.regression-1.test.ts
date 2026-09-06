import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  chooseBotAction,
  toBotPublicState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string): SeatState => ({
  seatId,
  kind: "bot",
  status: "active",
  balance: 150_000,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const auctionState: GameState = {
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "bot-auction-regression-1",
  aggregateVersion: 0,
  phase: "AwaitAuction",
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
  activeSeatId: "seat-b",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  pendingAuction: {
    deedId: "d-sawhorse-lane",
    highBid: 120_000,
    highBidderSeatId: "seat-b",
    prioritySeatId: "seat-a",
    passedSeatIds: [],
  },
  effectQueue: [],
  prng: deriveInitialState(new Uint8Array(32)),
};

describe("bot auction policy regressions", () => {
  it("passes when the minimum legal bid is already at the content valuation", () => {
    // Regression: ISSUE-001 — bots repeatedly outbid each other above valuation.
    // Found by /qa on 2026-09-06
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-06.md
    const state = toBotPublicState(auctionState, RULES);
    const decision = chooseBotAction(state, "seat-a", [
      { type: "PlaceAuctionBid", constraints: { minBid: 120_001, maxBid: 150_000 } },
      { type: "PassAuction" },
    ]);

    expect(decision?.command).toEqual({ type: "PassAuction" });
    expect(decision?.event.payload.reasonCode).toBe("PASS_ABOVE_VALUATION");
  });
});
