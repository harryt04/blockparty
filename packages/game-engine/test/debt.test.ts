import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 13 + 9) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, balance: number): SeatState => ({
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

const debtState = (
  options: {
    debtorBalance?: number;
    amount?: number;
    creditorSeatId?: string;
    continuation?: GameState["effectQueue"];
  } = {},
): GameState => {
  const debtorBalance = options.debtorBalance ?? 0;
  const deedId = "d-sawhorse-lane";
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a12",
    aggregateVersion: 0,
    phase: "AwaitDebt",
    seats: [{ ...seat("seat-a", debtorBalance), deedIds: [deedId] }, seat("seat-b", 10_000)],
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
      improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: options.continuation ?? [],
    obligation: {
      debtorSeatId: "seat-a",
      ...(options.creditorSeatId === undefined ? {} : { creditorSeatId: options.creditorSeatId }),
      amount: options.amount ?? 1_000,
      reasonCode: "RENT_DUE",
      continuation: options.continuation ?? [],
    },
    prng: deriveInitialState(SEED),
  };
};

const pay = (state: GameState, actorSeatId = "seat-a") =>
  resolve(state, { actorSeatId, command: { type: "PayObligation" } }, RULES);

describe("A12 obligation settlement and legal liquidity", () => {
  it("settles a player debt atomically and resumes its serialized continuation", () => {
    const continuation = [
      { sourceId: "card-next", effect: { type: "CollectBank" as const, amount: 500 } },
    ];
    const before = debtState({ debtorBalance: 1_000, amount: 1_000, continuation });
    const result = pay(before);

    expect(result).toMatchObject({
      ok: true,
      events: [
        {
          type: "ObligationSettled",
          payload: {
            debtorSeatId: "seat-a",
            amount: 1_000,
            remainingEffects: continuation,
          },
        },
        { type: "BankPaymentCollected", payload: { seatId: "seat-a", amount: 500 } },
      ],
      state: { phase: "ResolveMove", obligation: undefined },
    });
    if (!result.ok) throw new Error("expected obligation to settle");
    expect(result.state.seats[0]?.balance).toBe(500);
    expect(result.state.seats[1]?.balance).toBe(10_000);
    expect(result.state.bank.cash).toBe(500);
    expect(replay(before, result.events, RULES)).toEqual(result.state);
  });

  it("allows only legal mortgage liquidity, then settles a bank debt without negative cash", () => {
    const before = debtState({ amount: 6_000 });
    const mortgage = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "MortgageDeed", deedId: "d-sawhorse-lane" } },
      RULES,
    );
    expect(mortgage).toMatchObject({ ok: true, state: { phase: "AwaitDebt" } });
    if (!mortgage.ok) throw new Error("expected mortgage liquidity action");
    expect(mortgage.state.seats[0]?.balance).toBe(6_000);

    const settled = pay(mortgage.state);
    expect(settled).toMatchObject({ ok: true, events: [{ type: "ObligationSettled" }] });
    if (!settled.ok) throw new Error("expected bank obligation to settle");
    expect(settled.state.seats[0]?.balance).toBe(0);
    expect(settled.state.bank.cash).toBe(0);
    expect(settled.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane"))?.toMatchObject({
      mortgaged: true,
    });
    expect(replay(before, [...mortgage.events, ...settled.events], RULES)).toEqual(settled.state);
  });

  it("allows an even-building-safe improvement sale to fund the obligation", () => {
    const before = debtState({ debtorBalance: 0, amount: 5_000 });
    const improved: GameState = {
      ...before,
      deeds: before.deeds.map((deed) =>
        deed.deedId === "d-sawhorse-lane" ? { ...deed, improvementLevel: 1 } : deed,
      ),
    };
    const sold = resolve(
      improved,
      { actorSeatId: "seat-a", command: { type: "SellImprovement", deedId: "d-sawhorse-lane" } },
      RULES,
    );
    expect(sold).toMatchObject({ ok: true, events: [{ type: "ImprovementSold" }] });
    if (!sold.ok) throw new Error("expected improvement sale liquidity action");
    expect(sold.state.seats[0]?.balance).toBe(5_000);

    const settled = pay(sold.state);
    expect(settled).toMatchObject({ ok: true, state: { obligation: undefined } });
    if (!settled.ok) throw new Error("expected sold improvement proceeds to settle debt");
    expect(settled.state.seats[0]?.balance).toBe(0);
  });

  it("keeps an underfunded debt pending and rejects non-debtor settlement", () => {
    const before = debtState({ debtorBalance: 999, amount: 1_000 });
    expect(pay(before)).toMatchObject({
      ok: false,
      reasonCode: "INSUFFICIENT_FUNDS",
    });
    expect(pay(before, "seat-b")).toMatchObject({
      ok: false,
      reasonCode: "DEBTOR_REQUIRED",
    });
    expect(before.obligation?.amount).toBe(1_000);
    expect(before.seats[0]?.balance).toBe(999);
  });
});
