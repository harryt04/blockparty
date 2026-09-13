import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";
import { deriveInitialState, nextInt } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const RULES: RuleSet = {
  content: PLACEHOLDER_BUNDLE,
  configuration: STANDARD_CONFIGURATION,
};

const prngBeforeFirstRoll = () => {
  let prng = deriveInitialState(SEED);
  for (let index = 0; index < 3; index += 1) {
    prng = nextInt(prng, Number.MAX_SAFE_INTEGER).next;
  }
  return prng;
};

const seat = (seatId: string, position = 0): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance: 100_000,
  position,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const awaitRoll = (position = 0): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-a3",
  aggregateVersion: 0,
  phase: "AwaitRoll",
  seats: [seat("seat-a", position), seat("seat-b")],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: prngBeforeFirstRoll(),
});

describe("A3 movement and serialized effect queue", () => {
  it("walks authored route edges and pays Start exactly once when crossed", () => {
    const result = resolve(
      awaitRoll(14),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected movement to resolve");
    expect(result.state.seats[0]).toMatchObject({ position: 4, balance: 120_000 });
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "StartPaymentCollected",
    ]);
    expect(result.events[1]?.payload).toMatchObject({
      fromPosition: 14,
      toPosition: 4,
      spaces: 6,
      crossedStart: true,
      startCrossings: 1,
    });
    expect(result.events[2]?.payload).toMatchObject({
      amount: 20_000,
      reason: "CROSSED_START",
    });
  });

  it("applies the exact-Start variant only to normal dice movement", () => {
    const rules: RuleSet = {
      ...RULES,
      configuration: {
        ...STANDARD_CONFIGURATION,
        preset: "custom",
        doubleStartOnExactLanding: true,
      },
    };
    const result = resolve(
      awaitRoll(10),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected exact Start movement to resolve");
    expect(result.state.seats[0]).toMatchObject({ position: 0, balance: 140_000 });
    expect(result.events.filter((event) => event.type === "StartPaymentCollected")).toHaveLength(2);
    expect(result.events.at(-1)?.payload).toMatchObject({ reason: "EXACT_START_VARIANT" });
  });

  it("inserts destination effects before the remaining queue and resumes after a choice", () => {
    const content = {
      ...PLACEHOLDER_BUNDLE,
      spaces: PLACEHOLDER_BUNDLE.spaces.map((space) => {
        if (space.spaceId === "s06") {
          return {
            ...space,
            effects: [
              { type: "MoveBy" as const, spaces: 2 },
              { type: "Choose" as const, choiceId: "choice-a3" },
              { type: "MoveBy" as const, spaces: 1 },
            ],
          };
        }
        if (space.spaceId === "s08") {
          return { ...space, effects: [{ type: "MoveBy" as const, spaces: 1 }] };
        }
        return { ...space, effects: [] };
      }),
    };
    const rules: RuleSet = { ...RULES, content };
    const before = awaitRoll();
    const paused = resolve(before, { actorSeatId: "seat-a", command: { type: "RollDice" } }, rules);

    expect(paused).toMatchObject({ ok: true });
    if (!paused.ok) throw new Error("expected queue to pause at choice");
    expect(paused.state.phase).toBe("AwaitChoice");
    expect(paused.state.seats[0]?.position).toBe(9);
    expect(paused.state.pendingChoice).toMatchObject({
      choiceId: "choice-a3",
      continuation: [{ sourceId: "s06", effect: { type: "MoveBy", spaces: 1 } }],
    });
    expect(paused.state.effectQueue).toEqual(paused.state.pendingChoice?.continuation);
    expect(paused.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "TokenMoved",
      "TokenMoved",
      "PendingChoiceCreated",
    ]);
    expect(Object.isFrozen(paused.state.effectQueue)).toBe(true);
    expect(Object.isFrozen(paused.state.pendingChoice?.continuation)).toBe(true);

    const resumed = resolve(
      paused.state,
      {
        actorSeatId: "seat-a",
        command: { type: "ChoosePendingOption", choiceId: "choice-a3", optionId: "continue" },
      },
      rules,
    );
    expect(resumed).toMatchObject({ ok: true });
    if (!resumed.ok) throw new Error("expected choice to resume queue");
    expect(resumed.state.phase).toBe("ResolveMove");
    expect(resumed.state.seats[0]?.position).toBe(10);
    expect(resumed.state.effectQueue).toEqual([]);
    const replayedPaused = replay(before, paused.events, rules);
    expect({ ...replayedPaused, prng: before.prng }).toEqual({
      ...paused.state,
      prng: before.prng,
    });
    expect(replay(paused.state, resumed.events, rules)).toEqual(resumed.state);
  });

  it("clears movement and queue when a third matching roll sends a seat to Detention", () => {
    const tripleSeed = Uint8Array.from([0x99, 0x02, ...Array.from({ length: 30 }, () => 0)]);
    let prng = deriveInitialState(tripleSeed);
    // Reproduce the three-seat StartGame setup draw count explicitly while
    // keeping this scenario at the engine layer.
    prng = deriveInitialState(tripleSeed);
    for (let index = 0; index < 3; index += 1) {
      const draw = nextInt(prng, Number.MAX_SAFE_INTEGER);
      prng = draw.next;
    }
    const tripleRollState = { ...awaitRoll(), prng };
    const started = resolve(
      tripleRollState,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error("expected first roll");
    const second = resolve(
      { ...started.state, phase: "AwaitRoll" },
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    expect(second).toMatchObject({ ok: true });
    if (!second.ok) throw new Error("expected second roll");
    const third = resolve(
      { ...second.state, phase: "AwaitRoll" },
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );

    expect(third).toMatchObject({ ok: true });
    if (!third.ok) throw new Error("expected third roll");
    expect(third.state.phase).toBe("TurnEnd");
    expect(third.state.effectQueue).toEqual([]);
    expect(third.state.seats[0]).toMatchObject({ detained: true, position: 6 });
    expect(third.events.at(-1)?.type).toBe("DetentionEntered");
  });
});
