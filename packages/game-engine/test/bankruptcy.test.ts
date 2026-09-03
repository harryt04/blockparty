import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };
const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 19 + 7) & 0xff));

const seat = (seatId: string, balance: number, deedIds: readonly string[] = []): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position: 0,
  deedIds,
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const stateWithDebt = (
  options: {
    creditorSeatId?: string;
    debtorBalance?: number;
    amount?: number;
    deedId?: string;
    mortgaged?: boolean;
    improvementLevel?: number;
    card?: boolean;
  } = {},
): GameState => {
  const deedId = options.deedId ?? "d-sawhorse-lane";
  const ownedDeedIds = deedId === "none" ? [] : [deedId];
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a14",
    aggregateVersion: 0,
    phase: "AwaitDebt",
    seats: [
      {
        ...seat("seat-a", options.debtorBalance ?? 0, ownedDeedIds),
        detentionReleaseCardIds: options.card ? ["c-flyer-04"] : [],
      },
      seat("seat-b", 1_000),
    ],
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      ownerSeatId: deed.deedId === deedId ? "seat-a" : undefined,
      mortgaged: deed.deedId === deedId ? (options.mortgaged ?? false) : false,
      improvementLevel: deed.deedId === deedId ? (options.improvementLevel ?? 0) : 0,
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
    effectQueue: [],
    obligation: {
      debtorSeatId: "seat-a",
      ...(options.creditorSeatId === undefined ? {} : { creditorSeatId: options.creditorSeatId }),
      amount: options.amount ?? 1_000,
      reasonCode: "RENT_DUE",
      continuation: [],
    },
    decks: [{ deckId: "deck-flyers", drawPile: ["c-flyer-01"], discardPile: [] }],
    prng: deriveInitialState(SEED),
  };
};

describe("A14 bankruptcy and endgame", () => {
  it("transfers a creditor-facing estate, settles available cash, and declares the survivor", () => {
    const before = stateWithDebt({
      creditorSeatId: "seat-b",
      amount: 10_000,
      debtorBalance: 200,
      mortgaged: true,
      card: true,
    });
    const result = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "DeclareBankruptcy" } },
      RULES,
    );

    expect(result).toMatchObject({
      ok: true,
      events: [
        { type: "BankruptcyDeclared", payload: { amountPaid: 200 } },
        { type: "SeatEliminated", payload: { seatId: "seat-a" } },
        { type: "GameCompleted", payload: { winnerSeatId: "seat-b" } },
      ],
      state: { phase: "Finished", terminalReason: "WINNER", winnerSeatId: "seat-b" },
    });
    if (!result.ok) throw new Error("expected bankruptcy to resolve");
    expect(result.state.seats[0]?.status).toBe("eliminated");
    expect(result.state.seats[1]?.deedIds).toContain("d-sawhorse-lane");
    expect(result.state.seats[1]?.detentionReleaseCardIds).toContain("c-flyer-04");
    expect(result.state.bank.cash).toBe(600);
    expect(replay(before, result.events, RULES)).toEqual(result.state);
  });

  it("returns a bank-facing estate and records no winner when no active seat remains", () => {
    const debt = stateWithDebt({ amount: 1_000, debtorBalance: 500, mortgaged: true });
    const before: GameState = {
      ...debt,
      seats: [
        debt.seats[0] as SeatState,
        { ...(debt.seats[1] as SeatState), status: "eliminated" },
      ],
    };
    const result = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "DeclareBankruptcy" } },
      RULES,
    );
    expect(result).toMatchObject({
      ok: true,
      state: { phase: "Finished", terminalReason: "NO_WINNER" },
    });
    if (!result.ok) throw new Error("expected bankruptcy to resolve");
    expect(result.state.bank.deedIds).toContain("d-sawhorse-lane");
    expect(result.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane"))?.toMatchObject({
      ownerSeatId: undefined,
      mortgaged: true,
    });
    expect(result.state.bank.cash).toBe(500);
  });

  it("liquidates improvements before returning deeds to the bank", () => {
    const before = stateWithDebt({ amount: 12_000, improvementLevel: 1 });
    const result = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "DeclareBankruptcy" } },
      RULES,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected bankruptcy to resolve");
    expect(result.events[0]).toMatchObject({ type: "ImprovementSold" });
    expect(result.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane"))?.toMatchObject({
      improvementLevel: 0,
      ownerSeatId: undefined,
    });
    expect(result.state.bank.improvementInventory.stall).toBe(33);
  });

  it("rejects bankruptcy while a legal liquidation sequence can pay", () => {
    const result = resolve(
      stateWithDebt({ amount: 1_000, debtorBalance: 0 }),
      { actorSeatId: "seat-a", command: { type: "DeclareBankruptcy" } },
      RULES,
    );
    expect(result).toMatchObject({ ok: false, reasonCode: "BANKRUPTCY_LIQUIDITY_AVAILABLE" });
  });

  it("allows irreversible no-contest only at an empty safe boundary", () => {
    const before: GameState = {
      ...stateWithDebt({ deedId: "none" }),
      phase: "AwaitRoll",
      obligation: undefined,
    };
    const ended = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "EndNoContest" } },
      RULES,
    );
    expect(ended).toMatchObject({
      ok: true,
      events: [{ type: "GameEndedNoContest", payload: { priorPhase: "AwaitRoll" } }],
      state: { phase: "Finished", terminalReason: "NO_CONTEST" },
    });
    expect(
      resolve(stateWithDebt(), { actorSeatId: "seat-a", command: { type: "EndNoContest" } }, RULES),
    ).toMatchObject({ ok: false, reasonCode: "NO_CONTEST_REQUIRES_SAFE_BOUNDARY" });
  });
});
