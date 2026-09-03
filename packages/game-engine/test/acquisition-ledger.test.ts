import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import {
  replay,
  resolve,
  type BankState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, position: number, balance = 150_000): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const ledger = (): Pick<GameState, "deeds" | "bank"> => {
  const deedIds = PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId);
  const bank: BankState = {
    cash: 0,
    deedIds,
    improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
  };
  return {
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank,
  };
};

const stateAtDeed = (balance = 150_000): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-a4",
  aggregateVersion: 0,
  phase: "AwaitRoll",
  seats: [seat("seat-a", 6, balance), seat("seat-b", 0)],
  ...ledger(),
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

describe("A4 acquisition and bank ledger", () => {
  it("initializes every deed and the bank's separate ledgers at game start", () => {
    const before = stateAtDeed();
    const lobby: GameState = {
      ...before,
      phase: "Lobby",
      seats: before.seats.map((candidate) => ({ ...candidate, balance: 0 })),
      deeds: [],
      bank: { cash: 0, deedIds: [], improvementInventory: {} },
      activeSeatId: undefined,
      prioritySeatId: undefined,
    };
    const started = resolve(
      lobby,
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );

    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error("expected game start to resolve");
    expect(started.state.deeds).toHaveLength(PLACEHOLDER_BUNDLE.deeds.length);
    expect(started.state.deeds.every((deed) => deed.ownerSeatId === undefined)).toBe(true);
    expect(started.state.bank).toEqual({
      cash: 0,
      deedIds: PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId),
      improvementInventory: PLACEHOLDER_BUNDLE.economy.improvementInventory,
    });
  });

  it("offers an affordable unowned deed after landing", () => {
    const result = resolve(
      stateAtDeed(),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected deed landing to resolve");
    expect(result.state).toMatchObject({
      phase: "AwaitPurchase",
      pendingAcquisitionDeedId: "d-sawhorse-lane",
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "StartPaymentCollected",
    ]);
    expect(result.state.bank.deedIds).toContain("d-sawhorse-lane");
  });

  it("moves cash and ownership atomically, and replays the ledger event", () => {
    const offered = resolve(
      stateAtDeed(),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    if (!offered.ok) throw new Error("expected deed landing to resolve");

    const acquired = resolve(
      offered.state,
      {
        actorSeatId: "seat-a",
        command: { type: "AcquireDeed", deedId: "d-sawhorse-lane" },
      },
      RULES,
    );

    expect(acquired).toMatchObject({ ok: true });
    if (!acquired.ok) throw new Error("expected acquisition to resolve");
    expect(acquired.state.seats[0]).toMatchObject({
      balance: 158_000,
      deedIds: ["d-sawhorse-lane"],
    });
    expect(acquired.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")).toMatchObject({
      ownerSeatId: "seat-a",
      mortgaged: false,
      improvementLevel: 0,
    });
    expect(acquired.state.bank).toMatchObject({ cash: 12_000 });
    expect(acquired.state.bank.deedIds).not.toContain("d-sawhorse-lane");
    expect(acquired.events).toHaveLength(1);
    expect(acquired.events[0]).toMatchObject({
      type: "DeedAcquired",
      payload: { deedId: "d-sawhorse-lane", buyerSeatId: "seat-a", price: 12_000 },
    });
    expect(replay(offered.state, acquired.events, RULES)).toEqual(acquired.state);
    expect(Object.isFrozen(acquired.state)).toBe(true);
    expect(Object.isFrozen(acquired.state.deeds)).toBe(true);
    expect(Object.isFrozen(acquired.state.bank.deedIds)).toBe(true);
  });

  it("rejects stale, unauthorized, and unaffordable acquisition without mutation", () => {
    const offered = resolve(
      stateAtDeed(),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    if (!offered.ok) throw new Error("expected deed landing to resolve");

    expect(
      resolve(
        offered.state,
        { actorSeatId: "seat-b", command: { type: "AcquireDeed", deedId: "d-sawhorse-lane" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, code: "ILLEGAL_ACTION", reasonCode: "OUT_OF_TURN" });

    const poor = {
      ...offered.state,
      seats: offered.state.seats.map((candidate) =>
        candidate.seatId === "seat-a" ? { ...candidate, balance: 1_000 } : candidate,
      ),
    };
    expect(
      resolve(
        poor,
        { actorSeatId: "seat-a", command: { type: "AcquireDeed", deedId: "d-sawhorse-lane" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, code: "ILLEGAL_ACTION", reasonCode: "INSUFFICIENT_FUNDS" });
    expect(poor.seats[0]?.balance).toBe(1_000);
    expect(poor.bank.cash).toBe(0);
    expect(
      resolve(
        offered.state,
        { actorSeatId: "seat-a", command: { type: "AcquireDeed", deedId: "d-chalk-arrow-walk" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "ACQUISITION_MISMATCH" });
  });

  it("opens an ordered auction on decline, unless the no-auction variant is locked", () => {
    const offered = resolve(
      stateAtDeed(),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    if (!offered.ok) throw new Error("expected deed landing to resolve");
    const declined = resolve(
      offered.state,
      {
        actorSeatId: "seat-a",
        command: { type: "DeclineAcquisition", deedId: "d-sawhorse-lane" },
      },
      RULES,
    );
    expect(declined).toMatchObject({ ok: true });
    if (!declined.ok) throw new Error("expected decline to resolve");
    expect(declined.state).toMatchObject({
      phase: "AwaitAuction",
      pendingAuction: {
        deedId: "d-sawhorse-lane",
        highBid: 0,
        prioritySeatId: "seat-b",
        passedSeatIds: [],
      },
    });
    expect(declined.events.map((event) => event.type)).toEqual([
      "AcquisitionDeclined",
      "AuctionOpened",
    ]);
    expect(replay(offered.state, declined.events, RULES)).toEqual(declined.state);

    const noAuctionRules: RuleSet = {
      ...RULES,
      configuration: { ...STANDARD_CONFIGURATION, noAuctionAfterDeclinedAcquisition: true },
    };
    const noAuction = resolve(
      offered.state,
      {
        actorSeatId: "seat-a",
        command: { type: "DeclineAcquisition", deedId: "d-sawhorse-lane" },
      },
      noAuctionRules,
    );
    expect(noAuction).toMatchObject({ ok: true });
    if (!noAuction.ok) throw new Error("expected variant decline to resolve");
    expect(noAuction.state.phase).toBe("ResolveMove");
    expect(noAuction.state.bank.deedIds).toContain("d-sawhorse-lane");
    expect(noAuction.events.map((event) => event.type)).toEqual(["AcquisitionDeclined"]);
  });
});
