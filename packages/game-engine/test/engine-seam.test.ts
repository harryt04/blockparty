import { describe, expect, it } from "vitest";
import { replay, type EngineEvent, type GameState, type RuleSet } from "../src/index";
import { deriveInitialState, nextInt } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const SEED_HEX = "031425364758697a8b9cadbecfe0f102132435465768798a9bacbdcedff00112";

const initialState: GameState = {
  stateSchemaVersion: "1.0.0",
  contentVersion: "1.0.0",
  gameId: "game-1",
  aggregateVersion: 0,
  phase: "Lobby",
  seats: [],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
};

describe("seeded PRNG", () => {
  it("derives the fixed-seed golden and produces a stable integer stream", () => {
    const state = deriveInitialState(SEED);

    expect(state.words, `seed=${SEED_HEX}`).toEqual([988479391, 27341292, 209045589, 1265982777]);

    const values: number[] = [];
    let next = state;
    for (let index = 0; index < 8; index += 1) {
      const draw = nextInt(next, 6);
      values.push(draw.value);
      next = draw.next;
    }

    expect(values).toEqual([4, 5, 5, 5, 3, 2, 0, 4]);
    expect(next.draws).toBe(8);
  });

  it("supports the full safe-integer bound and does not mutate prior state", () => {
    const state = deriveInitialState(SEED);
    const draw = nextInt(state, 6);
    const largeDraw = nextInt(state, 4_294_967_297);

    expect(draw.value).toBeGreaterThanOrEqual(0);
    expect(draw.value).toBeLessThan(6);
    expect(largeDraw.value).toBeGreaterThanOrEqual(0);
    expect(largeDraw.value).toBeLessThan(4_294_967_297);
    expect(largeDraw.next.draws).toBe(2);
    expect(state.draws).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.words)).toBe(true);
    expect(() => nextInt(state, 0)).toThrow(RangeError);
    expect(() => nextInt(state, Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => deriveInitialState(new Uint8Array(31))).toThrow(RangeError);
  });
});

describe("event-only replay", () => {
  it("reconstructs phase state from recorded events without consuming PRNG", () => {
    const events: readonly EngineEvent[] = [
      {
        type: "GameStarted",
        eventVersion: 1,
        payload: { firstSeatId: "seat-1", orderDraw: [2, 0, 1] },
      },
      {
        type: "TurnStarted",
        eventVersion: 1,
        actorSeatId: "seat-1",
        payload: { seatId: "seat-1" },
      },
      {
        type: "DiceRolled",
        eventVersion: 1,
        actorSeatId: "seat-1",
        // Random outcomes are recorded in the event, never regenerated.
        payload: { dice: [4, 2], source: "normalTurn" },
      },
      {
        type: "TurnEnded",
        eventVersion: 1,
        actorSeatId: "seat-1",
        payload: { nextSeatId: "seat-2" },
      },
    ];

    const expected: GameState = {
      ...initialState,
      phase: "TurnStart",
      activeSeatId: "seat-2",
      prioritySeatId: "seat-2",
      lastRoll: [4, 2],
    };

    expect(replay(initialState, events, {} as RuleSet)).toEqual(expected);
    expect(replay(initialState, events, {} as RuleSet).prng).toBe(initialState.prng);
    expect(events[2]?.payload).toMatchObject({ dice: [4, 2] });
    expect(JSON.stringify(replay(initialState, [], {} as RuleSet))).toBe(
      JSON.stringify(initialState),
    );
  });
});
