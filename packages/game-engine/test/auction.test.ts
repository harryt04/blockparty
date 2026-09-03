import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type PendingAuction, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 23 + 5) & 0xff));

const seat = (seatId: string, balance = 10_000): SeatState => ({
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

const auctionState = (balances: readonly number[] = [10_000, 10_000, 10_000]): GameState => {
  const deedId = "d-sawhorse-lane";
  const seats = ["seat-a", "seat-b", "seat-c"].map((seatId, index) =>
    seat(seatId, balances[index] ?? 10_000),
  );
  const pendingAuction: PendingAuction = {
    deedId,
    highBid: 0,
    prioritySeatId: "seat-b",
    passedSeatIds: [],
  };
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a6",
    aggregateVersion: 0,
    phase: "AwaitAuction",
    seats,
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank: {
      cash: 0,
      deedIds: PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId),
      improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-b",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    pendingAuction,
    prng: deriveInitialState(SEED),
  };
};

const RULES = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const ledgerTotal = (state: GameState) =>
  state.bank.cash + state.seats.reduce((total, seat) => total + seat.balance, 0);

describe("A6 deed auctions", () => {
  it("keeps the auction paused at priority and rejects invalid or repeated bids", () => {
    const before = auctionState([10_000, 1_000, 10_000]);
    const outOfTurn = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "PlaceAuctionBid", amount: 1 } },
      RULES,
    );
    expect(outOfTurn).toMatchObject({ ok: false, reasonCode: "AUCTION_PRIORITY_REQUIRED" });

    const notHigher = resolve(
      before,
      { actorSeatId: "seat-b", command: { type: "PlaceAuctionBid", amount: 0 } },
      RULES,
    );
    expect(notHigher).toMatchObject({ ok: false, reasonCode: "BID_MUST_INCREASE" });

    const tooHigh = resolve(
      before,
      { actorSeatId: "seat-b", command: { type: "PlaceAuctionBid", amount: 1_001 } },
      RULES,
    );
    expect(tooHigh).toMatchObject({ ok: false, reasonCode: "BID_EXCEEDS_BALANCE" });

    const bid = resolve(
      before,
      { actorSeatId: "seat-b", command: { type: "PlaceAuctionBid", amount: 1_000 } },
      RULES,
    );
    expect(bid).toMatchObject({
      ok: true,
      state: {
        phase: "AwaitAuction",
        prioritySeatId: "seat-c",
        pendingAuction: { highBid: 1_000, highBidderSeatId: "seat-b", prioritySeatId: "seat-c" },
      },
    });
    if (!bid.ok) throw new Error("expected valid bid");
    expect(Object.isFrozen(bid.state.pendingAuction)).toBe(true);
    expect(Object.isFrozen(bid.state.pendingAuction?.passedSeatIds)).toBe(true);
    expect(bid.events.map((event) => event.type)).toEqual(["AuctionBidPlaced"]);
    expect(
      resolve(bid.state, { actorSeatId: "seat-b", command: { type: "PassAuction" } }, RULES),
    ).toMatchObject({
      ok: false,
      reasonCode: "AUCTION_PRIORITY_REQUIRED",
    });
    expect(replay(before, bid.events, RULES)).toEqual(bid.state);
  });

  it("rotates through active seats, skips irrevocable passes, and settles the winner exactly", () => {
    const before = auctionState();
    const bid = resolve(
      before,
      { actorSeatId: "seat-b", command: { type: "PlaceAuctionBid", amount: 1_000 } },
      RULES,
    );
    expect(bid).toMatchObject({ ok: true });
    if (!bid.ok) throw new Error("expected first bid");

    const passed = resolve(
      bid.state,
      { actorSeatId: "seat-c", command: { type: "PassAuction" } },
      RULES,
    );
    expect(passed).toMatchObject({ ok: true });
    if (!passed.ok) throw new Error("expected pass");
    expect(passed.events.map((event) => event.type)).toEqual(["AuctionPassed"]);
    expect(passed.state).toMatchObject({
      phase: "AwaitAuction",
      pendingAuction: { prioritySeatId: "seat-a", passedSeatIds: ["seat-c"] },
    });

    const finalPass = resolve(
      passed.state,
      { actorSeatId: "seat-a", command: { type: "PassAuction" } },
      RULES,
    );
    expect(finalPass).toMatchObject({
      ok: true,
      state: { phase: "ResolveMove", bank: { cash: 1_000 } },
    });
    if (!finalPass.ok) throw new Error("expected final pass");
    expect(ledgerTotal(finalPass.state)).toBe(ledgerTotal(before));
    expect(finalPass.events.map((event) => event.type)).toEqual(["AuctionPassed", "AuctionClosed"]);
    expect(finalPass.state.seats.find((seat) => seat.seatId === "seat-b")).toMatchObject({
      balance: 9_000,
      deedIds: ["d-sawhorse-lane"],
    });
    expect(finalPass.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")).toMatchObject({
      ownerSeatId: "seat-b",
    });
    expect(finalPass.state.bank.deedIds).not.toContain("d-sawhorse-lane");
    expect(replay(before, [...bid.events, ...passed.events, ...finalPass.events], RULES)).toEqual(
      finalPass.state,
    );
  });

  it("keeps a deed bank-owned when every active seat irrevocably passes", () => {
    const before = auctionState();
    const first = resolve(
      before,
      { actorSeatId: "seat-b", command: { type: "PassAuction" } },
      RULES,
    );
    expect(first).toMatchObject({ ok: true, state: { phase: "AwaitAuction" } });
    if (!first.ok) throw new Error("expected first pass");
    expect(first.state.pendingAuction).toMatchObject({
      prioritySeatId: "seat-c",
      passedSeatIds: ["seat-b"],
    });

    const second = resolve(
      first.state,
      { actorSeatId: "seat-c", command: { type: "PassAuction" } },
      RULES,
    );
    expect(second).toMatchObject({ ok: true, state: { phase: "AwaitAuction" } });
    if (!second.ok) throw new Error("expected second pass");
    expect(second.state.pendingAuction).toMatchObject({
      prioritySeatId: "seat-a",
      passedSeatIds: ["seat-b", "seat-c"],
    });

    const final = resolve(
      second.state,
      { actorSeatId: "seat-a", command: { type: "PassAuction" } },
      RULES,
    );
    expect(final).toMatchObject({ ok: true, state: { phase: "ResolveMove", bank: { cash: 0 } } });
    if (!final.ok) throw new Error("expected final pass");
    expect(ledgerTotal(final.state)).toBe(ledgerTotal(before));
    expect(final.events.at(-1)).toMatchObject({
      type: "AuctionClosed",
      payload: { deedId: "d-sawhorse-lane", sold: false, winningBid: 0 },
    });
    expect(
      final.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")?.ownerSeatId,
    ).toBeUndefined();
    expect(replay(before, [...first.events, ...second.events, ...final.events], RULES)).toEqual(
      final.state,
    );
  });
});
