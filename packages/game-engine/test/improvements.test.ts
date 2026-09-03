import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE, type ContentBundle } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 29 + 7) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

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

const contentWithCost = (cost: number): ContentBundle => ({
  ...PLACEHOLDER_BUNDLE,
  deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) =>
    deed.deedId === "d-sawhorse-lane" ? { ...deed, improvementCost: cost } : deed,
  ),
});

const districtState = (
  levels: readonly [number, number] = [0, 0],
  options: {
    balance?: number;
    inventory?: Readonly<Record<string, number>>;
    ownerSeatId?: string;
    mortgaged?: readonly string[];
  } = {},
): GameState => {
  const ownerSeatId = options.ownerSeatId ?? "seat-a";
  const ownedDeedIds = ["d-sawhorse-lane", "d-chalk-arrow-walk"];
  const deeds = PLACEHOLDER_BUNDLE.deeds.map((deed) => {
    const deedIndex = ownedDeedIds.indexOf(deed.deedId);
    return {
      deedId: deed.deedId,
      ownerSeatId: deedIndex >= 0 ? ownerSeatId : undefined,
      mortgaged: options.mortgaged?.includes(deed.deedId) ?? false,
      improvementLevel: deedIndex >= 0 ? (levels[deedIndex] ?? 0) : 0,
    };
  });
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-a7",
    aggregateVersion: 0,
    phase: "ResolveMove",
    seats: [
      { ...seat("seat-a", options.balance ?? 100_000), deedIds: ownedDeedIds },
      seat("seat-b"),
    ],
    deeds,
    bank: {
      cash: 0,
      deedIds: PLACEHOLDER_BUNDLE.deeds
        .map((deed) => deed.deedId)
        .filter((deedId) => !ownedDeedIds.includes(deedId)),
      improvementInventory: options.inventory ?? PLACEHOLDER_BUNDLE.economy.improvementInventory,
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(SEED),
  };
};

const improve = (state: GameState, deedId: string, type: "BuyImprovement" | "SellImprovement") =>
  resolve(state, { actorSeatId: "seat-a", command: { type, deedId } }, RULES);

const stallInventoryConservation = (state: GameState) => {
  const consumed = state.deeds.reduce((total, deedState) => {
    const deed = PLACEHOLDER_BUNDLE.deeds.find(
      (candidate) => candidate.deedId === deedState.deedId,
    );
    return (
      total +
      (deed?.improvementLevels ?? [])
        .filter((level) => level.level <= deedState.improvementLevel)
        .reduce((subtotal, level) => subtotal + level.inventoryDelta, 0)
    );
  }, 0);
  return (state.bank.improvementInventory.stall ?? 0) + consumed;
};

describe("A7 improvements", () => {
  it("requires a complete, unmortgaged district and preserves even-building", () => {
    const incomplete = districtState([0, 0], { ownerSeatId: "seat-b" });
    expect(improve(incomplete, "d-sawhorse-lane", "BuyImprovement")).toMatchObject({
      ok: false,
      reasonCode: "IMPROVEMENT_NOT_OWNED",
    });

    const mortgaged = districtState([0, 0], { mortgaged: ["d-chalk-arrow-walk"] });
    expect(improve(mortgaged, "d-sawhorse-lane", "BuyImprovement")).toMatchObject({
      ok: false,
      reasonCode: "DISTRICT_NOT_COMPLETE",
    });

    const oneAhead = districtState([1, 0]);
    expect(improve(oneAhead, "d-sawhorse-lane", "BuyImprovement")).toMatchObject({
      ok: false,
      reasonCode: "EVEN_BUILDING_REQUIRED",
    });
    expect(improve(oneAhead, "d-chalk-arrow-walk", "BuyImprovement")).toMatchObject({ ok: true });

    const turnStart = districtState();
    const managed = resolve(
      { ...turnStart, phase: "TurnStart" },
      { actorSeatId: "seat-a", command: { type: "BuyImprovement", deedId: "d-sawhorse-lane" } },
      RULES,
    );
    expect(managed).toMatchObject({ ok: true, state: { phase: "TurnStart" } });
  });

  it("walks a legal buy/sell sequence with exact cash and inventory conservation", () => {
    const before = districtState();
    const initialTotal =
      before.bank.cash + before.seats.reduce((total, candidate) => total + candidate.balance, 0);
    const initialInventory = stallInventoryConservation(before);
    let state = before;
    const events = [];
    const sequence: readonly ["BuyImprovement" | "SellImprovement", string][] = [
      ["BuyImprovement", "d-sawhorse-lane"],
      ["BuyImprovement", "d-chalk-arrow-walk"],
      ["BuyImprovement", "d-sawhorse-lane"],
      ["BuyImprovement", "d-chalk-arrow-walk"],
      ["BuyImprovement", "d-sawhorse-lane"],
      ["SellImprovement", "d-sawhorse-lane"],
      ["SellImprovement", "d-chalk-arrow-walk"],
      ["SellImprovement", "d-sawhorse-lane"],
      ["SellImprovement", "d-chalk-arrow-walk"],
      ["SellImprovement", "d-sawhorse-lane"],
    ];
    for (const [type, deedId] of sequence) {
      const result = improve(state, deedId, type);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(`sequence step failed: ${type}:${deedId}`);
      state = result.state;
      events.push(...result.events);
      expect(
        state.bank.cash + state.seats.reduce((total, candidate) => total + candidate.balance, 0),
      ).toBe(initialTotal);
      expect(stallInventoryConservation(state)).toBe(initialInventory);
    }
    expect(state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")?.improvementLevel).toBe(0);
    expect(state.deeds.find((deed) => deed.deedId === "d-chalk-arrow-walk")?.improvementLevel).toBe(
      0,
    );
    expect(state.seats[0]?.balance).toBe(75_000);
    expect(state.bank.cash).toBe(25_000);
    expect(events.map((event) => event.type)).toEqual([
      "ImprovementBought",
      "ImprovementBought",
      "ImprovementBought",
      "ImprovementBought",
      "ImprovementBought",
      "ImprovementSold",
      "ImprovementSold",
      "ImprovementSold",
      "ImprovementSold",
      "ImprovementSold",
    ]);
    expect(replay(before, events, RULES)).toEqual(state);
  });

  it("rounds resale down and keeps an exhausted inventory/payment atomic", () => {
    const content = contentWithCost(10_001);
    const rules: RuleSet = { content, configuration: STANDARD_CONFIGURATION };
    const before = districtState();
    const bought = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "BuyImprovement", deedId: "d-sawhorse-lane" } },
      rules,
    );
    expect(bought).toMatchObject({ ok: true });
    if (!bought.ok) throw new Error("expected improvement purchase");
    const sold = resolve(
      bought.state,
      { actorSeatId: "seat-a", command: { type: "SellImprovement", deedId: "d-sawhorse-lane" } },
      rules,
    );
    expect(sold).toMatchObject({ ok: true, events: [{ payload: { amount: 5_000 } }] });

    const exhausted = districtState([0, 0], { inventory: { stall: 0, stage: 12 } });
    expect(improve(exhausted, "d-sawhorse-lane", "BuyImprovement")).toMatchObject({
      ok: false,
      reasonCode: "IMPROVEMENT_INVENTORY_EXHAUSTED",
    });
    expect(exhausted).toEqual(districtState([0, 0], { inventory: { stall: 0, stage: 12 } }));
  });

  it("only sells from a currently highest-level deed", () => {
    const state = districtState([2, 1]);
    expect(improve(state, "d-chalk-arrow-walk", "SellImprovement")).toMatchObject({
      ok: false,
      reasonCode: "EVEN_BUILDING_REQUIRED",
    });
    expect(improve(state, "d-sawhorse-lane", "SellImprovement")).toMatchObject({ ok: true });
  });
});
