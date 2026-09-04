import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE, type ContentEffect } from "@blockparty/game-content";
import { deriveInitialState, nextInt } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 23 + 11) & 0xff));

const configuration = (overrides: Partial<typeof STANDARD_CONFIGURATION>) => ({
  ...STANDARD_CONFIGURATION,
  preset: "custom" as const,
  ...overrides,
});

const seat = (seatId: string, options: Partial<SeatState> = {}): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance: 100_000,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
  ...options,
});

const bankDeeds = () => PLACEHOLDER_BUNDLE.deeds.map((deed) => deed.deedId);

const baseState = (overrides: Partial<GameState> = {}): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-d3",
  aggregateVersion: 0,
  phase: "AwaitPurchase",
  seats: [seat("seat-a"), seat("seat-b")],
  deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
    deedId: deed.deedId,
    mortgaged: false,
    improvementLevel: 0,
  })),
  bank: { cash: 100_000, deedIds: bankDeeds(), improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  pendingAcquisitionDeedId: "d-sawhorse-lane",
  prng: deriveInitialState(SEED),
  ...overrides,
});

const rulesFor = (overrides: Partial<typeof STANDARD_CONFIGURATION> = {}): RuleSet => ({
  content: PLACEHOLDER_BUNDLE,
  configuration: configuration(overrides),
});

const prngForDice = (wanted: readonly [number, number]) => {
  let prng = deriveInitialState(SEED);
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const first = nextInt(prng, 6);
    const second = nextInt(first.next, 6);
    if (first.value + 1 === wanted[0] && second.value + 1 === wanted[1]) return prng;
    prng = second.next;
  }
  throw new Error("fixed seed did not produce the requested dice");
};

const queuedIncomeState = (effect: ContentEffect, detained = true): GameState => {
  const queued = { sourceId: "card-income", effect };
  return baseState({
    phase: "AwaitChoice",
    seats: [seat("seat-a", { detained }), seat("seat-b")],
    deeds: [],
    bank: { cash: 100_000, deedIds: [], improvementInventory: {} },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    effectQueue: [queued],
    pendingChoice: { choiceId: "income-choice", continuation: [queued] },
    pendingAcquisitionDeedId: undefined,
  });
};

const resolveIncome = (before: GameState, rules: RuleSet) =>
  resolve(
    before,
    {
      actorSeatId: "seat-a",
      command: { type: "ChoosePendingOption", choiceId: "income-choice", optionId: "continue" },
    },
    rules,
  );

describe("D3 auction and detained-income variants", () => {
  it.each([
    [false, "AwaitAuction", ["AcquisitionDeclined", "AuctionOpened"]],
    [true, "ResolveMove", ["AcquisitionDeclined"]],
  ] as const)("applies VAR-003 only to a declined acquisition (%s)", (enabled, phase, events) => {
    const result = resolve(
      baseState(),
      {
        actorSeatId: "seat-a",
        command: { type: "DeclineAcquisition", deedId: "d-sawhorse-lane" },
      },
      rulesFor({ noAuctionAfterDeclinedAcquisition: enabled }),
    );

    expect(result).toMatchObject({ ok: true, state: { phase } });
    if (!result.ok) throw new Error("expected acquisition decline to resolve");
    expect(result.events.map((event) => event.type)).toEqual(events);
    expect(result.state.bank.deedIds).toContain("d-sawhorse-lane");
    expect(
      replay(baseState(), result.events, rulesFor({ noAuctionAfterDeclinedAcquisition: enabled })),
    ).toEqual(result.state);
  });

  it("keeps an unaffordable deed bank-owned without opening an auction", () => {
    const before = baseState({
      phase: "AwaitRoll",
      pendingAcquisitionDeedId: undefined,
      seats: [seat("seat-a", { balance: 0 }), seat("seat-b")],
      prng: prngForDice([1, 1]),
    });
    const result = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rulesFor({ noAuctionAfterDeclinedAcquisition: true }),
    );

    expect(result).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    if (!result.ok) throw new Error("expected unaffordable landing to resolve");
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "AcquisitionDeclined",
    ]);
    expect(result.state.bank.deedIds).toContain("d-chalk-arrow-walk");
    expect(result.state.pendingAuction).toBeUndefined();
  });

  it.each([
    [
      "CollectBank",
      { type: "CollectBank", amount: 5_000 } as const,
      true,
      [100_000, 100_000],
      100_000,
      [],
    ],
    [
      "CollectEachPlayer",
      { type: "CollectEachPlayer", amount: 5_000 } as const,
      true,
      [100_000, 100_000],
      100_000,
      [],
    ],
    [
      "CollectBank by default",
      { type: "CollectBank", amount: 5_000 } as const,
      false,
      [105_000, 100_000],
      95_000,
      ["BankPaymentCollected"],
    ],
    [
      "CollectEachPlayer by default",
      { type: "CollectEachPlayer", amount: 5_000 } as const,
      false,
      [105_000, 95_000],
      100_000,
      ["PlayerPaymentCollected"],
    ],
  ] as const)(
    "suppresses only documented card income for a detained seat (%s)",
    (_label, effect, suppressed, balances, bankCash, paymentEvents) => {
      const before = queuedIncomeState(effect, suppressed);
      const result = resolveIncome(before, rulesFor({ noIncomeWhileDetained: suppressed }));

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error("expected card income to resolve");
      expect(result.state.seats.map((candidate) => candidate.balance)).toEqual(balances);
      expect(result.state.bank.cash).toBe(bankCash);
      expect(result.events.map((event) => event.type)).toEqual([
        "PendingChoiceResolved",
        ...paymentEvents,
      ]);
      expect(
        replay(before, result.events, rulesFor({ noIncomeWhileDetained: suppressed })),
      ).toEqual(result.state);
    },
  );

  it("leaves bank-directed payments intact while suppressing detained income", () => {
    const before = queuedIncomeState({ type: "PayBank", amount: 5_000 });
    const result = resolveIncome(before, rulesFor({ noIncomeWhileDetained: true }));

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected bank payment to resolve");
    expect(result.state.seats.map((candidate) => candidate.balance)).toEqual([95_000, 100_000]);
    expect(result.state.bank.cash).toBe(105_000);
    expect(result.events.map((event) => event.type)).toEqual(["PendingChoiceResolved", "FeePaid"]);
  });

  it("does not suppress a detained seat paying other players", () => {
    const before = queuedIncomeState({ type: "PayEachPlayer", amount: 5_000 });
    const result = resolveIncome(before, rulesFor({ noIncomeWhileDetained: true }));

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected player payment to resolve");
    expect(result.state.seats.map((candidate) => candidate.balance)).toEqual([95_000, 105_000]);
    expect(result.events.map((event) => event.type)).toEqual([
      "PendingChoiceResolved",
      "PlayerPaymentCollected",
    ]);
  });

  it("stacks VAR-003 and VAR-004 without changing either default boundary", () => {
    const rules = rulesFor({
      noAuctionAfterDeclinedAcquisition: true,
      noIncomeWhileDetained: true,
    });
    const declined = resolve(
      baseState(),
      {
        actorSeatId: "seat-a",
        command: { type: "DeclineAcquisition", deedId: "d-sawhorse-lane" },
      },
      rules,
    );
    const income = resolveIncome(queuedIncomeState({ type: "CollectBank", amount: 5_000 }), rules);

    expect(declined).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    expect(income).toMatchObject({ ok: true });
    if (!declined.ok || !income.ok) throw new Error("expected combined variants to resolve");
    expect(declined.state.bank.deedIds).toContain("d-sawhorse-lane");
    expect(income.state.seats[0]?.balance).toBe(100_000);
    expect(income.events.map((event) => event.type)).toEqual(["PendingChoiceResolved"]);
  });
});
