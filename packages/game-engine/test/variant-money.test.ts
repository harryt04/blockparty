import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState, nextInt } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const ROLL_SEED = Uint8Array.from(
  Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff),
);
const ONES_SEED = Uint8Array.from([0x00, 0x02, ...Array.from({ length: 30 }, () => 0)]);

const seat = (seatId: string, position = 0, balance = 100_000): SeatState => ({
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

const afterDraws = (seed: Uint8Array, count: number) => {
  let state = deriveInitialState(seed);
  for (let index = 0; index < count; index += 1)
    state = nextInt(state, Number.MAX_SAFE_INTEGER).next;
  return state;
};

const awaitRoll = (
  position: number,
  prng = afterDraws(ROLL_SEED, 3),
  balance = 100_000,
  bankCash = 0,
  jackpot?: number,
): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-d2",
  aggregateVersion: 0,
  phase: "AwaitRoll",
  seats: [seat("seat-a", position, balance), seat("seat-b")],
  deeds: [],
  bank: { cash: bankCash, deedIds: [], improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  ...(jackpot === undefined ? {} : { jackpot }),
  prng,
});

const configuration = (overrides: Partial<typeof STANDARD_CONFIGURATION>) => ({
  ...STANDARD_CONFIGURATION,
  preset: "custom" as const,
  ...overrides,
});

const rulesFor = (overrides: Partial<typeof STANDARD_CONFIGURATION>): RuleSet => ({
  content: PLACEHOLDER_BUNDLE,
  configuration: configuration(overrides),
});

const replayWithAdvancedPrng = (
  before: GameState,
  result: Extract<ReturnType<typeof resolve>, { ok: true }>,
  rules: RuleSet,
) => ({
  ...replay(before, result.events, rules),
  prng: result.state.prng,
});

describe("D2 money injection variants", () => {
  it("keeps the default fee and Rest behavior unchanged", () => {
    const fee = resolve(
      awaitRoll(2),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION },
    );
    expect(fee).toMatchObject({ ok: true });
    if (!fee.ok) throw new Error("expected fee landing");
    expect(fee.state.jackpot).toBeUndefined();
    expect(fee.events.map((event) => event.type)).toEqual(["DiceRolled", "TokenMoved", "FeePaid"]);

    const rest = resolve(
      awaitRoll(5, undefined, 100_000, 7_500, 7_500),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION },
    );
    expect(rest).toMatchObject({ ok: true });
    if (!rest.ok) throw new Error("expected Rest landing");
    expect(rest.state.seats[0]?.balance).toBe(100_000);
    expect(rest.state.jackpot).toBe(7_500);
    expect(rest.events.some((event) => event.type === "JackpotPaid")).toBe(false);
  });

  it("funds and pays the Rest jackpot only when VAR-001 is enabled", () => {
    const rules = rulesFor({ restSpaceJackpot: true });
    const before = awaitRoll(2);
    const funded = resolve(before, { actorSeatId: "seat-a", command: { type: "RollDice" } }, rules);
    expect(funded).toMatchObject({ ok: true });
    if (!funded.ok) throw new Error("expected jackpot-eligible fee");
    expect(funded.state).toMatchObject({ jackpot: 7_500, bank: { cash: 7_500 } });
    expect(funded.state.seats[0]?.balance).toBe(92_500);
    expect(funded.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "FeePaid",
      "JackpotFunded",
    ]);
    expect(replayWithAdvancedPrng(before, funded, rules)).toEqual(funded.state);

    const restBefore = awaitRoll(5, undefined, 100_000, 7_500, 7_500);
    const paid = resolve(
      restBefore,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );
    expect(paid).toMatchObject({ ok: true });
    if (!paid.ok) throw new Error("expected jackpot payout");
    expect(paid.state).toMatchObject({ jackpot: 0, bank: { cash: 0 } });
    expect(paid.state.seats[0]?.balance).toBe(107_500);
    expect(paid.events.at(-1)).toMatchObject({
      type: "JackpotPaid",
      payload: { seatId: "seat-a", amount: 7_500, reasonCode: "REST_SPACE_JACKPOT" },
    });
    expect(replayWithAdvancedPrng(restBefore, paid, rules)).toEqual(paid.state);

    const untaggedContent = {
      ...PLACEHOLDER_BUNDLE,
      spaces: PLACEHOLDER_BUNDLE.spaces.map((space) =>
        space.spaceId === "s08"
          ? { ...space, effects: [{ type: "PayBank" as const, amount: 7_500 }] }
          : space,
      ),
    };
    const untagged = resolve(
      awaitRoll(2),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      { content: untaggedContent, configuration: rules.configuration },
    );
    expect(untagged).toMatchObject({ ok: true });
    if (!untagged.ok) throw new Error("expected untagged fee");
    expect(untagged.events.map((event) => event.type)).not.toContain("JackpotFunded");
  });

  it("records a jackpot-eligible fee through an obligation and funds only what was paid", () => {
    const rules = rulesFor({ restSpaceJackpot: true });
    const pending = resolve(
      awaitRoll(2, undefined, 1_000),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );
    expect(pending).toMatchObject({ ok: true, state: { phase: "AwaitDebt" } });
    if (!pending.ok) throw new Error("expected fee debt");
    expect(pending.state.obligation).toMatchObject({ amount: 7_500, jackpotEligible: true });

    const ready = {
      ...pending.state,
      seats: pending.state.seats.map((candidate) =>
        candidate.seatId === "seat-a" ? { ...candidate, balance: 7_500 } : candidate,
      ),
    };
    const settled = resolve(
      ready,
      { actorSeatId: "seat-a", command: { type: "PayObligation" } },
      rules,
    );
    expect(settled).toMatchObject({ ok: true });
    if (!settled.ok) throw new Error("expected fee debt settlement");
    expect(settled.state).toMatchObject({ jackpot: 7_500, bank: { cash: 7_500 } });
    expect(settled.state.seats[0]?.balance).toBe(0);
    expect(settled.events.map((event) => event.type)).toEqual([
      "ObligationSettled",
      "JackpotFunded",
    ]);
    expect(replayWithAdvancedPrng(ready, settled, rules)).toEqual(settled.state);

    const bankrupt = resolve(
      pending.state,
      { actorSeatId: "seat-a", command: { type: "DeclareBankruptcy" } },
      rules,
    );
    expect(bankrupt).toMatchObject({ ok: true });
    if (!bankrupt.ok) throw new Error("expected bank-directed bankruptcy");
    expect(bankrupt.state).toMatchObject({ jackpot: 1_000, bank: { cash: 1_000 } });
    expect(bankrupt.events).toContainEqual(
      expect.objectContaining({
        type: "JackpotFunded",
        payload: { amount: 1_000, reasonCode: "JACKPOT_ELIGIBLE_FEE" },
      }),
    );
    expect(replayWithAdvancedPrng(pending.state, bankrupt, rules)).toEqual(bankrupt.state);
  });

  it("pays the matching-ones bonus from bank and stacks it with exact Start", () => {
    const bonusRules = rulesFor({ bonusForMatchingOnes: true });
    const bonus = resolve(
      awaitRoll(0, afterDraws(ONES_SEED, 3), 100_000, 1_000_000),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      bonusRules,
    );
    expect(bonus).toMatchObject({ ok: true });
    if (!bonus.ok) throw new Error("expected matching-ones bonus");
    expect(bonus.state.seats[0]?.balance).toBe(120_000);
    expect(bonus.state.bank.cash).toBe(980_000);
    expect(bonus.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "BankPaymentCollected",
      "TokenMoved",
    ]);
    expect(bonus.events[1]?.payload).toMatchObject({
      amount: 20_000,
      reasonCode: "MATCHING_ONES_BONUS",
    });

    const shortRouteContent = {
      ...PLACEHOLDER_BUNDLE,
      spaces: [
        { ...PLACEHOLDER_BUNDLE.spaces[0]!, routeIndex: 0, next: "s01" },
        {
          ...PLACEHOLDER_BUNDLE.spaces[1]!,
          routeIndex: 1,
          next: "s00",
          type: "rest" as const,
          deedId: undefined,
        },
      ],
      decks: [],
    };
    const stackedRules: RuleSet = {
      content: shortRouteContent,
      configuration: rulesFor({
        bonusForMatchingOnes: true,
        doubleStartOnExactLanding: true,
      }).configuration,
    };
    const stackedBefore = awaitRoll(0, afterDraws(ONES_SEED, 3), 100_000, 1_000_000);
    const stacked = resolve(
      stackedBefore,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      stackedRules,
    );
    expect(stacked).toMatchObject({ ok: true });
    if (!stacked.ok) throw new Error("expected stacked money injections");
    expect(stacked.state.seats[0]?.balance).toBe(160_000);
    expect(stacked.events.filter((event) => event.type === "StartPaymentCollected")).toHaveLength(
      2,
    );
    expect(stacked.events.filter((event) => event.type === "BankPaymentCollected")).toHaveLength(1);
    expect(replayWithAdvancedPrng(stackedBefore, stacked, stackedRules)).toEqual(stacked.state);
  });
});
