import { describe, expect, it } from "vitest";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const RULES: RuleSet = { content: CLASSIC_BUNDLE, configuration: STANDARD_CONFIGURATION };
const CLASSIC_SEED = Uint8Array.from([20, ...Array.from({ length: 31 }, () => 0)]);

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

const lobby = (seed = CLASSIC_SEED): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: CLASSIC_BUNDLE.contentVersion,
  gameId: "classic-standard-scenarios",
  aggregateVersion: 0,
  phase: "Lobby",
  seats: [seat("seat-a"), seat("seat-b")],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(seed),
});

const started = (seed = CLASSIC_SEED): Extract<ReturnType<typeof resolve>, { ok: true }> => {
  const result = resolve(
    lobby(seed),
    { actorSeatId: "seat-a", command: { type: "StartGame" } },
    RULES,
  );
  if (!result.ok) throw new Error("expected the classic game to start");
  return result;
};

const scenarioState = (position: number, ownerDeedIds: readonly string[] = []): GameState => {
  const setup = started();
  const owner = "seat-b";
  return {
    ...setup.state,
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    seats: setup.state.seats.map((candidate) =>
      candidate.seatId === "seat-a"
        ? { ...candidate, position }
        : { ...candidate, deedIds: [...ownerDeedIds] },
    ),
    deeds: setup.state.deeds.map((deed) => ({
      ...deed,
      ownerSeatId: ownerDeedIds.includes(deed.deedId) ? owner : undefined,
    })),
    bank: {
      ...setup.state.bank,
      deedIds: setup.state.bank.deedIds.filter((deedId) => !ownerDeedIds.includes(deedId)),
    },
  };
};

const roll = (state: GameState) =>
  resolve(state, { actorSeatId: "seat-a", command: { type: "RollDice" } }, RULES);

describe("classic standard rule scenarios", () => {
  it("starts the production bundle, acquires the first landed transit, and advances turns", () => {
    const before = started(new Uint8Array(32).fill(0));
    expect(before.state.contentVersion).toBe("1.0.0");
    expect(before.state.deeds).toHaveLength(28);
    expect(before.state.decks?.map((deck) => deck.drawPile)).toHaveLength(2);

    const firstRoll = resolve(
      before.state,
      { actorSeatId: before.state.activeSeatId!, command: { type: "RollDice" } },
      RULES,
    );
    expect(firstRoll).toMatchObject({
      ok: true,
      state: { phase: "AwaitPurchase", pendingAcquisitionDeedId: "deed-skybridge-line" },
    });
    if (!firstRoll.ok) throw new Error("expected a classic transit landing");

    const acquired = resolve(
      firstRoll.state,
      {
        actorSeatId: firstRoll.state.activeSeatId!,
        command: { type: "AcquireDeed", deedId: "deed-skybridge-line" },
      },
      RULES,
    );
    expect(acquired).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    if (!acquired.ok) throw new Error("expected the classic transit to be acquired");
    expect(acquired.state.bank.cash).toBe(20_000);
    expect(
      acquired.state.seats.find((seat) => seat.deedIds.includes("deed-skybridge-line"))?.balance,
    ).toBe(130_000);

    const ended = resolve(
      acquired.state,
      { actorSeatId: acquired.state.activeSeatId!, command: { type: "EndTurn" } },
      RULES,
    );
    expect(ended).toMatchObject({ ok: true, state: { phase: "AwaitRoll" } });
    if (!ended.ok) throw new Error("expected the classic turn to end");
    expect(ended.events.map((event) => event.type)).toEqual(["TurnEnded", "TurnStarted"]);
    expect(
      replay(before.state, [...firstRoll.events, ...acquired.events, ...ended.events], RULES),
    ).toEqual({
      ...ended.state,
      prng: before.state.prng,
    });
  });

  it("uses classic district, transit, and utility rent data on real board spaces", () => {
    const district = roll(scenarioState(35, ["deed-brasswick-lane", "deed-whisperwell-walk"]));
    expect(district).toMatchObject({ ok: true });
    if (!district.ok) throw new Error("expected the classic district landing");
    expect(district.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { deedId: "deed-brasswick-lane", amount: 400 },
    });

    const transit = roll(scenarioState(39, ["deed-skybridge-line", "deed-moonrail-line"]));
    expect(transit).toMatchObject({ ok: true });
    if (!transit.ok) throw new Error("expected the classic transit landing");
    expect(transit.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { deedId: "deed-skybridge-line", amount: 5_000, ownedTransitCount: 2 },
    });

    const utility = roll(scenarioState(6, ["deed-weather-loom"]));
    expect(utility).toMatchObject({ ok: true });
    if (!utility.ok) throw new Error("expected the classic utility landing");
    expect(utility.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { deedId: "deed-weather-loom", amount: 24, rollTotal: 6, multiplier: 4 },
    });
  });

  it("resolves classic fee and Send to Detention spaces without variant behavior", () => {
    const fee = roll(scenarioState(38));
    expect(fee).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    if (!fee.ok) throw new Error("expected the classic fee landing");
    // The fee landing crosses Start first: +20,000 then -20,000 leaves the
    // standard starting balance unchanged.
    expect(fee.state.seats.find((candidate) => candidate.seatId === "seat-a")?.balance).toBe(
      150_000,
    );
    expect(fee.state.bank.cash).toBe(20_000);
    expect(fee.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "StartPaymentCollected",
      "FeePaid",
    ]);

    const detention = roll(scenarioState(24));
    expect(detention).toMatchObject({ ok: true, state: { phase: "TurnEnd" } });
    if (!detention.ok) throw new Error("expected the classic Detention landing");
    expect(detention.state.seats.find((candidate) => candidate.seatId === "seat-a")).toMatchObject({
      position: 10,
      detained: true,
      detentionTurnsRemaining: 0,
    });
    expect(detention.events.at(-1)).toMatchObject({
      type: "DetentionEntered",
      payload: { reason: "EFFECT", position: 10 },
    });
  });
});
