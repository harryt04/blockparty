import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (
  seatId: string,
  balance: number,
  deedIds: readonly string[] = [],
  detentionReleaseCardIds: readonly string[] = [],
): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position: 0,
  deedIds,
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds,
});

const tradeState = (
  options: { phase?: GameState["phase"]; aggregateVersion?: number } = {},
): GameState => {
  const sawhorse = "d-sawhorse-lane";
  const chalk = "d-chalk-arrow-walk";
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a13",
    aggregateVersion: options.aggregateVersion ?? 0,
    phase: options.phase ?? "TurnStart",
    seats: [
      seat("seat-a", 100_000, [sawhorse], ["c-flyer-01"]),
      seat("seat-b", 80_000, [chalk], ["c-flyer-02"]),
    ],
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      ownerSeatId:
        deed.deedId === sawhorse ? "seat-a" : deed.deedId === chalk ? "seat-b" : undefined,
      mortgaged: deed.deedId === sawhorse,
      improvementLevel: 0,
    })),
    bank: {
      cash: 20_000,
      deedIds: PLACEHOLDER_BUNDLE.deeds
        .map((deed) => deed.deedId)
        .filter((deedId) => deedId !== sawhorse && deedId !== chalk),
      improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

const propose = (state: GameState, overrides: Record<string, unknown> = {}) =>
  resolve(
    state,
    {
      actorSeatId: "seat-a",
      command: {
        type: "ProposeTrade",
        counterpartySeatId: "seat-b",
        offered: {
          cash: 1_000,
          deedIds: ["d-sawhorse-lane"],
          detentionReleaseCardIds: ["c-flyer-01"],
        },
        requested: {
          cash: 2_000,
          deedIds: ["d-chalk-arrow-walk"],
          detentionReleaseCardIds: ["c-flyer-02"],
        },
        ...overrides,
      },
    },
    RULES,
  );

describe("A13 trades and staleness", () => {
  it("keeps an offer escrow-free, then atomically exchanges cash, deeds, cards, and charges", () => {
    const before = tradeState();
    const offered = propose(before);
    expect(offered).toMatchObject({
      ok: true,
      state: {
        pendingTrade: {
          tradeId: "trade:game-a13:0:seat-a:seat-b",
          proposerSeatId: "seat-a",
          counterpartySeatId: "seat-b",
        },
      },
      events: [{ type: "TradeProposed" }],
    });
    if (!offered.ok) throw new Error("expected trade proposal");
    expect(offered.state.seats[0]?.deedIds).toEqual(["d-sawhorse-lane"]);
    expect(offered.state.seats[1]?.deedIds).toEqual(["d-chalk-arrow-walk"]);

    const accepted = resolve(
      offered.state,
      {
        actorSeatId: "seat-b",
        command: { type: "AcceptTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(accepted).toMatchObject({ ok: true, events: [{ type: "TradeAccepted" }] });
    if (!accepted.ok) throw new Error("expected trade acceptance");
    expect(accepted.state.seats).toMatchObject([
      {
        balance: 101_000,
        deedIds: ["d-chalk-arrow-walk"],
        detentionReleaseCardIds: ["c-flyer-02"],
      },
      { balance: 78_400, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: ["c-flyer-01"] },
    ]);
    expect(
      accepted.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")?.ownerSeatId,
    ).toBe("seat-b");
    expect(accepted.state.bank.cash).toBe(20_600);
    expect(replay(before, [...offered.events, ...accepted.events], RULES)).toEqual(accepted.state);
  });

  it("rejects unauthorized, duplicate, improved, unavailable, and phase-invalid offers", () => {
    expect(
      resolve(
        tradeState(),
        {
          actorSeatId: "seat-b",
          command: {
            type: "ProposeTrade",
            counterpartySeatId: "seat-a",
            offered: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
            requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
          },
        },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "OUT_OF_TURN" });
    expect(
      propose(tradeState(), {
        offered: {
          cash: 0,
          deedIds: ["d-sawhorse-lane", "d-sawhorse-lane"],
          detentionReleaseCardIds: [],
        },
      }),
    ).toMatchObject({ ok: false, reasonCode: "DUPLICATE_TRADE_ASSET" });
    expect(
      propose(tradeState(), {
        offered: { cash: 100_001, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
      }),
    ).toMatchObject({ ok: false, reasonCode: "TRADE_CASH_UNAVAILABLE" });
    const improved = {
      ...tradeState(),
      deeds: tradeState().deeds.map((deed) =>
        deed.deedId === "d-sawhorse-lane" ? { ...deed, improvementLevel: 1 } : deed,
      ),
    };
    expect(propose(improved)).toMatchObject({ ok: false, reasonCode: "IMPROVEMENT_PRESENT" });
    expect(propose({ ...tradeState(), phase: "AwaitChoice" })).toMatchObject({
      ok: false,
      reasonCode: "TRADE_NOT_AVAILABLE_IN_PHASE",
    });
  });

  it("invalidates an offer when its version or included assets are stale", () => {
    const offered = propose(tradeState());
    if (!offered.ok) throw new Error("expected trade proposal");
    const staleVersion = resolve(
      { ...offered.state, aggregateVersion: 2 },
      {
        actorSeatId: "seat-b",
        command: { type: "AcceptTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(staleVersion).toMatchObject({
      ok: true,
      events: [{ type: "TradeStaled" }],
      state: { pendingTrade: undefined },
    });

    const changedAssets = {
      ...offered.state,
      seats: offered.state.seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, deedIds: [] } : seat,
      ),
    };
    const staleAssets = resolve(
      changedAssets,
      {
        actorSeatId: "seat-b",
        command: { type: "AcceptTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(staleAssets).toMatchObject({ ok: true, events: [{ type: "TradeStaled" }] });
    expect(staleAssets.ok && staleAssets.state.seats[0]?.deedIds).toEqual([]);

    const unencumberedBase = tradeState();
    const unencumbered = {
      ...unencumberedBase,
      seats: unencumberedBase.seats.map((seat) =>
        seat.seatId === "seat-a"
          ? { ...seat, deedIds: ["d-chalk-arrow-walk"] }
          : { ...seat, deedIds: ["d-sawhorse-lane"] },
      ),
      deeds: unencumberedBase.deeds.map((deed) =>
        deed.deedId === "d-chalk-arrow-walk"
          ? { ...deed, ownerSeatId: "seat-a", mortgaged: false }
          : deed.deedId === "d-sawhorse-lane"
            ? { ...deed, ownerSeatId: "seat-b", mortgaged: true }
            : deed,
      ),
    };
    const proposedUnencumbered = propose(unencumbered, {
      offered: { cash: 0, deedIds: ["d-chalk-arrow-walk"], detentionReleaseCardIds: [] },
      requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
    });
    if (!proposedUnencumbered.ok) throw new Error("expected unencumbered proposal");
    const mortgaged = resolve(
      {
        ...proposedUnencumbered.state,
      },
      { actorSeatId: "seat-a", command: { type: "MortgageDeed", deedId: "d-chalk-arrow-walk" } },
      RULES,
    );
    if (!mortgaged.ok) throw new Error("expected mortgage transition");
    expect(
      resolve(
        mortgaged.state,
        {
          actorSeatId: "seat-b",
          command: { type: "AcceptTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
        },
        RULES,
      ),
    ).toMatchObject({ ok: true, events: [{ type: "TradeStaled" }] });
  });

  it("allows only debtor-initiated immediate liquidity trades during an obligation", () => {
    const state: GameState = {
      ...tradeState({ phase: "AwaitDebt" }),
      obligation: {
        debtorSeatId: "seat-a",
        amount: 50_000,
        reasonCode: "RENT_DUE",
        continuation: [],
      },
    };
    const offered = resolve(
      state,
      {
        actorSeatId: "seat-a",
        command: {
          type: "ProposeTrade",
          counterpartySeatId: "seat-b",
          offered: { cash: 0, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: [] },
          requested: { cash: 5_000, deedIds: [], detentionReleaseCardIds: [] },
        },
      },
      RULES,
    );
    expect(offered).toMatchObject({ ok: true });
    if (!offered.ok) throw new Error("expected debt liquidity proposal");
    const accepted = resolve(
      offered.state,
      {
        actorSeatId: "seat-b",
        command: { type: "AcceptTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(accepted).toMatchObject({
      ok: true,
      state: { phase: "AwaitDebt", obligation: { debtorSeatId: "seat-a" } },
    });
    if (!accepted.ok) throw new Error("expected debt liquidity acceptance");
    expect(accepted.state.seats[0]?.balance).toBe(105_000);
  });

  it("supports named rejection and proposer cancellation without changing assets", () => {
    const proposed = propose(tradeState());
    if (!proposed.ok) throw new Error("expected proposal");
    const rejected = resolve(
      proposed.state,
      {
        actorSeatId: "seat-b",
        command: { type: "RejectTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(rejected).toMatchObject({
      ok: true,
      events: [{ type: "TradeRejected" }],
      state: { pendingTrade: undefined },
    });
    const cancelled = resolve(
      proposed.state,
      {
        actorSeatId: "seat-a",
        command: { type: "CancelTrade", tradeId: "trade:game-a13:0:seat-a:seat-b" },
      },
      RULES,
    );
    expect(cancelled).toMatchObject({
      ok: true,
      events: [{ type: "TradeCancelled" }],
      state: { pendingTrade: undefined },
    });
  });

  it("rejects a mortgaged-deed transfer when the recipient cannot pay its immediate charge", () => {
    const state = {
      ...tradeState(),
      seats: tradeState().seats.map((seat) =>
        seat.seatId === "seat-b" ? { ...seat, balance: 500 } : seat,
      ),
    };
    expect(
      propose(state, {
        offered: { cash: 0, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
      }),
    ).toMatchObject({ ok: false, reasonCode: "TRANSFER_CHARGE_UNAFFORDABLE" });
  });
});
