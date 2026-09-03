import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { resolve, replay, type GameState, type RuleSet, type SeatState } from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const RULES: RuleSet = {
  content: PLACEHOLDER_BUNDLE,
  configuration: STANDARD_CONFIGURATION,
};

const seat = (seatId: string): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance: 0,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const lobby = (): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-a2",
  aggregateVersion: 0,
  phase: "Lobby",
  seats: [seat("seat-a"), seat("seat-b"), seat("seat-c")],
  consecutiveMatchingRolls: 0,
  prng: deriveInitialState(SEED),
});

describe("A2 start and roll reducer", () => {
  it("starts with deterministic order, starting balances, and all tokens on Start", () => {
    const before = lobby();
    const result = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );
    const repeat = resolve(
      lobby(),
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !repeat.ok) throw new Error("expected StartGame to be accepted");
    expect(result.state).toEqual(repeat.state);
    expect(result.state.phase).toBe("AwaitRoll");
    expect(result.state.seats).toHaveLength(3);
    expect(result.state.seats.every((candidate) => candidate.balance === 150000)).toBe(true);
    expect(result.state.seats.every((candidate) => candidate.position === 0)).toBe(true);
    expect(result.state.activeSeatId).toBe(result.state.seats[0]?.seatId);
    expect(result.events.map((event) => event.type)).toEqual(["GameStarted", "TurnStarted"]);
    expect(result.events[0]?.payload).toMatchObject({
      firstSeatId: result.state.activeSeatId,
      seatOrder: result.state.seats.map((candidate) => candidate.seatId),
      startingCash: 150000,
      startingPosition: 0,
    });
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.seats)).toBe(true);
    expect(before.phase).toBe("Lobby");
    expect(before.seats[0]?.balance).toBe(0);
  });

  it("accepts only the active seat's roll and records deterministic dice outcomes", () => {
    const started = resolve(
      lobby(),
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );
    if (!started.ok) throw new Error("expected StartGame to be accepted");
    const activeSeatId = started.state.activeSeatId;
    if (activeSeatId === undefined) throw new Error("expected an active seat");

    const outOfTurn = resolve(
      started.state,
      {
        actorSeatId: activeSeatId === "seat-a" ? "seat-b" : "seat-a",
        command: { type: "RollDice" },
      },
      RULES,
    );
    expect(outOfTurn).toMatchObject({
      ok: false,
      code: "ILLEGAL_ACTION",
      reasonCode: "OUT_OF_TURN",
    });

    const rolled = resolve(
      started.state,
      { actorSeatId: activeSeatId, command: { type: "RollDice" } },
      RULES,
    );
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) throw new Error("expected RollDice to be accepted");
    expect(rolled.state.phase).toBe("ResolveMove");
    expect(rolled.state.lastRoll).toEqual([1, 5]);
    expect(rolled.state.consecutiveMatchingRolls).toBe(0);
    expect(rolled.events).toHaveLength(1);
    expect(rolled.events[0]?.type).toBe("DiceRolled");
    expect(rolled.events[0]?.payload).toMatchObject({
      dice: [1, 5],
      matching: false,
      consecutiveMatchingRolls: 0,
    });
    expect(started.state.phase).toBe("AwaitRoll");
    expect(started.state.prng.draws).toBe(6);
    expect(rolled.state.prng.draws).toBe(8);
  });

  it("rejects invalid phase, unknown, and eliminated actors independently", () => {
    const beforeStart = lobby();
    expect(
      resolve(beforeStart, { actorSeatId: "seat-a", command: { type: "RollDice" } }, RULES),
    ).toMatchObject({
      ok: false,
      code: "PHASE_MISMATCH",
    });
    expect(
      resolve(beforeStart, { actorSeatId: "missing", command: { type: "StartGame" } }, RULES),
    ).toMatchObject({
      ok: false,
      code: "ILLEGAL_ACTION",
      reasonCode: "UNKNOWN_SEAT",
    });

    const eliminated = lobby();
    const eliminatedSeat = eliminated.seats[0]!;
    const eliminatedLobby: GameState = {
      ...eliminated,
      seats: [{ ...eliminatedSeat, status: "eliminated" }, ...eliminated.seats.slice(1)],
    };
    expect(
      resolve(eliminatedLobby, { actorSeatId: "seat-a", command: { type: "StartGame" } }, RULES),
    ).toMatchObject({
      ok: false,
      code: "ILLEGAL_ACTION",
      reasonCode: "SEAT_NOT_ACTIVE",
    });
  });

  it("sends the active seat to Detention on a third consecutive matching roll", () => {
    const tripleSeed = Uint8Array.from([0x99, 0x02, ...Array.from({ length: 30 }, () => 0)]);
    const tripleLobby = lobby();
    const seededLobby: GameState = {
      ...tripleLobby,
      prng: deriveInitialState(tripleSeed),
    };
    const started = resolve(
      seededLobby,
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );
    if (!started.ok || started.state.activeSeatId === undefined)
      throw new Error("expected StartGame to be accepted");
    const actorSeatId = started.state.activeSeatId;
    const turnStarted = (state: GameState): GameState =>
      replay(
        state,
        [{ type: "TurnStarted", eventVersion: 1, payload: { seatId: actorSeatId } }],
        RULES,
      );
    const first = resolve(
      turnStarted(started.state),
      { actorSeatId, command: { type: "RollDice" } },
      RULES,
    );
    if (!first.ok) throw new Error("expected first matching roll");
    const second = resolve(
      turnStarted(first.state),
      { actorSeatId, command: { type: "RollDice" } },
      RULES,
    );
    if (!second.ok) throw new Error("expected second matching roll");
    const third = resolve(
      turnStarted(second.state),
      { actorSeatId, command: { type: "RollDice" } },
      RULES,
    );

    expect(first.state.consecutiveMatchingRolls).toBe(1);
    expect(second.state.consecutiveMatchingRolls).toBe(2);
    expect(third).toMatchObject({ ok: true });
    if (!third.ok) throw new Error("expected third matching roll");
    expect(third.state.phase).toBe("TurnEnd");
    expect(third.state.seats.find((candidate) => candidate.seatId === actorSeatId)).toMatchObject({
      detained: true,
      position: 6,
      detentionTurnsRemaining: 0,
    });
    expect(third.events.map((event) => event.type)).toEqual(["DiceRolled", "DetentionEntered"]);
    expect(third.events[1]?.payload).toMatchObject({
      seatId: actorSeatId,
      position: 6,
      reason: "THREE_MATCHING_ROLLS",
    });
  });
});
