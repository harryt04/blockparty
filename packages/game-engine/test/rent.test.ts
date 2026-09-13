import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));

const seat = (seatId: string, balance = 100_000): SeatState => ({
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

const landingContent = (deedId: string) => ({
  ...PLACEHOLDER_BUNDLE,
  economy: { ...PLACEHOLDER_BUNDLE.economy, startPayment: 0 },
  spaces: PLACEHOLDER_BUNDLE.spaces.map((space) =>
    space.routeIndex === 1 ? { ...space, type: "deed" as const, deedId, effects: [] } : space,
  ),
});

const stateAtOwnedDeed = (
  deedId: string,
  ownerDeedIds: readonly string[] = [deedId],
  debtorBalance = 100_000,
  ownerSeatId = "seat-b",
): GameState => {
  const content = landingContent(deedId);
  const deeds = content.deeds.map((deed) => ({
    deedId: deed.deedId,
    ownerSeatId: ownerDeedIds.includes(deed.deedId) ? ownerSeatId : undefined,
    mortgaged: false,
    improvementLevel: 0,
  }));
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: content.contentVersion,
    gameId: "game-a5",
    aggregateVersion: 0,
    phase: "AwaitRoll",
    seats: [
      {
        ...seat("seat-a", debtorBalance),
        position: 6,
        deedIds: ownerSeatId === "seat-a" ? [...ownerDeedIds] : [],
      },
      {
        ...seat("seat-b"),
        deedIds: ownerSeatId === "seat-b" ? [...ownerDeedIds] : [],
      },
    ],
    deeds,
    bank: {
      cash: 0,
      deedIds: content.deeds
        .map((deed) => deed.deedId)
        .filter((candidate) => !ownerDeedIds.includes(candidate)),
      improvementInventory: { ...content.economy.improvementInventory },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

const resolveLanding = (state: GameState, deedId: string) =>
  resolve(
    state,
    { actorSeatId: "seat-a", command: { type: "RollDice" } },
    { content: landingContent(deedId), configuration: STANDARD_CONFIGURATION },
  );

describe("A5 rent calculation and ledgered obligations", () => {
  it.each([
    ["an incomplete district", ["d-sawhorse-lane"], 1_000],
    ["a complete district", ["d-sawhorse-lane", "d-chalk-arrow-walk"], 2_000],
  ] as const)("charges data-defined rent for %s", (_label, ownerDeedIds, amount) => {
    const result = resolveLanding(
      stateAtOwnedDeed("d-sawhorse-lane", ownerDeedIds),
      "d-sawhorse-lane",
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected rent to resolve");
    expect(result.state.seats[0]?.balance).toBe(100_000 - amount);
    expect(result.state.seats[1]?.balance).toBe(100_000 + amount);
    expect(result.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: {
        deedId: "d-sawhorse-lane",
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount,
      },
    });
    expect({
      ...replay(stateAtOwnedDeed("d-sawhorse-lane", ownerDeedIds), result.events, {
        content: landingContent("d-sawhorse-lane"),
        configuration: STANDARD_CONFIGURATION,
      }),
      prng: result.state.prng,
    }).toEqual(result.state);
  });

  it("indexes transit rent by the owner's held count and skips self or mortgaged deeds", () => {
    const oneTransit = resolveLanding(
      stateAtOwnedDeed("d-food-truck-row", ["d-food-truck-row"]),
      "d-food-truck-row",
    );
    const twoTransit = resolveLanding(
      stateAtOwnedDeed("d-food-truck-row", ["d-food-truck-row", "d-second-truck-stop"]),
      "d-food-truck-row",
    );
    expect(oneTransit).toMatchObject({ ok: true });
    expect(twoTransit).toMatchObject({ ok: true });
    if (!oneTransit.ok || !twoTransit.ok) throw new Error("expected transit rent to resolve");
    expect(oneTransit.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { amount: 2_500 },
    });
    expect(twoTransit.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { amount: 5_000 },
    });

    const self = resolveLanding(
      stateAtOwnedDeed("d-food-truck-row", ["d-food-truck-row"], 100_000, "seat-a"),
      "d-food-truck-row",
    );
    expect(self).toMatchObject({ ok: true });
    if (!self.ok) throw new Error("expected self landing to resolve");
    expect(self.state.seats[0]?.balance).toBe(100_000);
    expect(self.state.seats[1]?.balance).toBe(100_000);
    expect(self.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "StartPaymentCollected",
    ]);
  });

  it("charges utility rent from the recorded movement roll", () => {
    const result = resolveLanding(stateAtOwnedDeed("d-hydrant-hookup"), "d-hydrant-hookup");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected utility rent to resolve");
    expect(result.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { amount: 44, category: "utility", rollTotal: 11, multiplier: 4 },
    });
  });

  it("creates a visible obligation without making debtor cash negative", () => {
    const before = stateAtOwnedDeed("d-sawhorse-lane", ["d-sawhorse-lane"], 500);
    const result = resolveLanding(before, "d-sawhorse-lane");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected obligation to be created");
    expect(result.state).toMatchObject({
      phase: "AwaitDebt",
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 1_000,
        reasonCode: "RENT_DUE",
        continuation: [],
      },
    });
    expect(result.state.seats[0]?.balance).toBe(500);
    expect(result.events.at(-1)).toMatchObject({
      type: "ObligationCreated",
      payload: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 1_000,
        reasonCode: "RENT_DUE",
        remainingEffects: [],
      },
    });
    expect({
      ...replay(before, result.events, {
        content: landingContent("d-sawhorse-lane"),
        configuration: STANDARD_CONFIGURATION,
      }),
      prng: result.state.prng,
    }).toEqual(result.state);
  });

  it("does not charge rent on a mortgaged deed", () => {
    const before = stateAtOwnedDeed("d-sawhorse-lane");
    const mortgaged: GameState = {
      ...before,
      deeds: before.deeds.map((deed) =>
        deed.deedId === "d-sawhorse-lane" ? { ...deed, mortgaged: true } : deed,
      ),
    };
    const result = resolveLanding(mortgaged, "d-sawhorse-lane");

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected mortgaged landing to resolve");
    expect(result.state.seats[0]?.balance).toBe(100_000);
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "StartPaymentCollected",
    ]);
  });
});
