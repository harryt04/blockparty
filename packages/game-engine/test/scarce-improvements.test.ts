import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 31 + 11) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, balance = 100_000): SeatState => ({
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

const scarcityState = (inventory = 1): GameState => {
  const ownership: Record<string, string> = {
    "d-sawhorse-lane": "seat-a",
    "d-chalk-arrow-walk": "seat-a",
    "d-string-light-bend": "seat-b",
    "d-boombox-steps": "seat-b",
    "d-folding-table-close": "seat-c",
    "d-cooler-yard": "seat-c",
  };
  const deedIdsBySeat = new Map<string, string[]>();
  for (const [deedId, owner] of Object.entries(ownership)) {
    deedIdsBySeat.set(owner, [...(deedIdsBySeat.get(owner) ?? []), deedId]);
  }
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a8",
    aggregateVersion: 0,
    phase: "ResolveMove",
    seats: ["seat-a", "seat-b", "seat-c"].map((seatId) => ({
      ...seat(seatId),
      deedIds: deedIdsBySeat.get(seatId) ?? [],
    })),
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      ownerSeatId: ownership[deed.deedId],
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank: {
      cash: 0,
      deedIds: PLACEHOLDER_BUNDLE.deeds
        .map((deed) => deed.deedId)
        .filter((deedId) => ownership[deedId] === undefined),
      improvementInventory: { stall: inventory, stage: 12 },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

const request = (state: GameState, actorSeatId: string, deedId: string) =>
  resolve(state, { actorSeatId, command: { type: "RequestScarceImprovement", deedId } }, RULES);

const auctionCommand = (
  state: GameState,
  actorSeatId: string,
  command: { type: "PlaceAuctionBid"; amount: number } | { type: "PassAuction" },
) => resolve(state, { actorSeatId, command }, RULES);

describe("A8 scarce improvement auctions", () => {
  it("records demand, pauses at priority, and settles the winner plus base cost", () => {
    const before = scarcityState(1);
    const first = request(before, "seat-a", "d-sawhorse-lane");
    expect(first).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    if (!first.ok) throw new Error("expected first demand");

    const opened = request(first.state, "seat-b", "d-string-light-bend");
    expect(opened).toMatchObject({
      ok: true,
      state: {
        phase: "ImprovementAuction",
        pendingImprovementAuction: {
          highBid: 0,
          prioritySeatId: "seat-a",
          demands: [{ seatId: "seat-a" }, { seatId: "seat-b" }],
        },
      },
    });
    if (!opened.ok) throw new Error("expected scarce auction");
    expect(opened.events.map((event) => event.type)).toEqual([
      "ScarceImprovementRequested",
      "AuctionOpened",
    ]);

    const outOfTurn = auctionCommand(opened.state, "seat-b", {
      type: "PlaceAuctionBid",
      amount: 1,
    });
    expect(outOfTurn).toMatchObject({ ok: false, reasonCode: "AUCTION_PRIORITY_REQUIRED" });

    const bid = auctionCommand(opened.state, "seat-a", {
      type: "PlaceAuctionBid",
      amount: 2_000,
    });
    expect(bid).toMatchObject({ ok: true });
    if (!bid.ok) throw new Error("expected scarce bid");
    const passed = auctionCommand(bid.state, "seat-b", { type: "PassAuction" });
    expect(passed).toMatchObject({
      ok: true,
      events: [
        { type: "AuctionPassed" },
        { type: "ScarceImprovementAwarded", payload: { amount: 12_000, winningBid: 2_000 } },
      ],
      state: {
        phase: "ResolveMove",
        bank: { cash: 12_000, improvementInventory: { stall: 0 } },
      },
    });
    if (!passed.ok) throw new Error("expected scarce award");
    expect(passed.state.seats[0]?.balance).toBe(88_000);
    expect(
      passed.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")?.improvementLevel,
    ).toBe(1);
    expect(replay(before, [...first.events, ...opened.events.slice(0), ...[]], RULES)).toEqual(
      opened.state,
    );
    expect(replay(opened.state, [...bid.events, ...passed.events], RULES)).toEqual(passed.state);
  });

  it("passes without a timer and closes with no sale", () => {
    const first = request(scarcityState(1), "seat-a", "d-sawhorse-lane");
    if (!first.ok) throw new Error("expected first demand");
    const opened = request(first.state, "seat-b", "d-string-light-bend");
    if (!opened.ok) throw new Error("expected auction opening");
    const passedA = auctionCommand(opened.state, "seat-a", { type: "PassAuction" });
    expect(passedA).toMatchObject({ ok: true, state: { phase: "ImprovementAuction" } });
    if (!passedA.ok) throw new Error("expected first pass");
    const passedB = auctionCommand(passedA.state, "seat-b", { type: "PassAuction" });
    expect(passedB).toMatchObject({
      ok: true,
      events: [{ type: "AuctionPassed" }, { type: "AuctionClosed" }],
      state: { phase: "ResolveMove", bank: { improvementInventory: { stall: 1 } } },
    });
  });

  it("requires two distinct demand seats before opening contention", () => {
    const first = request(scarcityState(1), "seat-a", "d-sawhorse-lane");
    if (!first.ok) throw new Error("expected first demand");
    const second = request(first.state, "seat-a", "d-chalk-arrow-walk");
    expect(second).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
  });

  it("does not open an auction at zero inventory and bypasses scarcity when VAR-008 is on", () => {
    const exhausted = scarcityState(0);
    expect(request(exhausted, "seat-a", "d-sawhorse-lane")).toMatchObject({
      ok: false,
      reasonCode: "IMPROVEMENT_INVENTORY_EXHAUSTED",
    });

    const unlimitedRules: RuleSet = {
      content: PLACEHOLDER_BUNDLE,
      configuration: {
        ...STANDARD_CONFIGURATION,
        preset: "custom",
        unlimitedImprovementInventory: true,
      },
    };
    const bought = resolve(
      exhausted,
      { actorSeatId: "seat-a", command: { type: "BuyImprovement", deedId: "d-sawhorse-lane" } },
      unlimitedRules,
    );
    expect(bought).toMatchObject({ ok: true });
    if (!bought.ok) throw new Error("expected unlimited-inventory improvement");
    expect(bought.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")).toMatchObject({
      improvementLevel: 1,
    });
  });

  it("reopens for remaining contested demand until inventory is exhausted", () => {
    const start = scarcityState(2);
    const first = request(start, "seat-a", "d-sawhorse-lane");
    if (!first.ok) throw new Error("expected first demand");
    const second = request(first.state, "seat-b", "d-string-light-bend");
    if (!second.ok) throw new Error("expected second demand");
    const opened = request(second.state, "seat-c", "d-folding-table-close");
    if (!opened.ok) throw new Error("expected contested auction");
    const bidA = auctionCommand(opened.state, "seat-a", { type: "PlaceAuctionBid", amount: 1_000 });
    if (!bidA.ok) throw new Error("expected first bid");
    const passB = auctionCommand(bidA.state, "seat-b", { type: "PassAuction" });
    if (!passB.ok) throw new Error("expected second-seat pass");
    const awardA = auctionCommand(passB.state, "seat-c", { type: "PassAuction" });
    expect(awardA).toMatchObject({ ok: true, state: { phase: "ImprovementAuction" } });
    if (!awardA.ok) throw new Error("expected first award and continuation");
    expect(awardA.events.map((event) => event.type)).toEqual([
      "AuctionPassed",
      "ScarceImprovementAwarded",
      "AuctionOpened",
    ]);
    const bidB = auctionCommand(awardA.state, "seat-b", {
      type: "PlaceAuctionBid",
      amount: 500,
    });
    if (!bidB.ok) throw new Error("expected second bid");
    const passC = auctionCommand(bidB.state, "seat-c", { type: "PassAuction" });
    expect(passC).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
  });
});
