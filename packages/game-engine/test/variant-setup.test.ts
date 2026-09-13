import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE, type ContentBundle } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION, type RulesConfiguration } from "@blockparty/contracts";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 41 + 11) & 0xff));

const configuration = (overrides: Partial<RulesConfiguration>): RulesConfiguration => ({
  ...STANDARD_CONFIGURATION,
  preset: "custom",
  ...overrides,
});

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

const lobby = (seatCount = 3): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-d4",
  aggregateVersion: 0,
  phase: "Lobby",
  seats: Array.from({ length: seatCount }, (_, index) => seat(`seat-${index + 1}`)),
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

const districtState = (levels: readonly [number, number], inventory: number): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-d4-construction",
  aggregateVersion: 0,
  phase: "ResolveMove",
  seats: [seat("seat-a", 100_000), seat("seat-b", 100_000)],
  deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => {
    const index = ["d-sawhorse-lane", "d-chalk-arrow-walk"].indexOf(deed.deedId);
    return {
      deedId: deed.deedId,
      ownerSeatId: index < 0 ? undefined : "seat-a",
      mortgaged: false,
      improvementLevel: index < 0 ? 0 : (levels[index] ?? 0),
    };
  }),
  bank: {
    cash: 0,
    deedIds: PLACEHOLDER_BUNDLE.deeds
      .map((deed) => deed.deedId)
      .filter((deedId) => !["d-sawhorse-lane", "d-chalk-arrow-walk"].includes(deedId)),
    improvementInventory: { stall: inventory, stage: 0 },
  },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

const improve = (
  state: GameState,
  type: "BuyImprovement" | "SellImprovement",
  deedId: string,
  variant: Partial<RulesConfiguration> = {},
) =>
  resolve(
    state,
    { actorSeatId: "seat-a", command: { type, deedId } },
    { content: PLACEHOLDER_BUNDLE, configuration: configuration(variant) },
  );

describe("D4 setup and construction variants", () => {
  it("deals the fixed-seed eligible pool fairly, without payment, and records an auditable order", () => {
    const eligibleDeedIds = PLACEHOLDER_BUNDLE.deeds.slice(0, 6).map((deed) => deed.deedId);
    const content: ContentBundle = {
      ...PLACEHOLDER_BUNDLE,
      decks: [],
      economy: {
        ...PLACEHOLDER_BUNDLE.economy,
        startingAssetDealCount: 2,
        startingAssetEligibleDeedIds: eligibleDeedIds,
      },
    };
    const rules: RuleSet = {
      content,
      configuration: configuration({ startingAssetsDealt: true }),
    };
    const before = lobby();
    const result = resolve(
      before,
      { actorSeatId: "seat-1", command: { type: "StartGame" } },
      rules,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected starting deal to resolve");
    const startEvent = result.events[0];
    const assignments = startEvent?.payload.startingAssetAssignments;
    const order = startEvent?.payload.startingAssetOrder;
    expect(order).toEqual([
      "d-sawhorse-lane",
      "d-food-truck-row",
      "d-hydrant-hookup",
      "d-chalk-arrow-walk",
      "d-boombox-steps",
      "d-string-light-bend",
    ]);
    expect(assignments).toEqual(
      result.state.seats.map((candidate) => ({
        seatId: candidate.seatId,
        deedIds: candidate.deedIds,
      })),
    );
    expect(result.state.seats.every((candidate) => candidate.balance === 150_000)).toBe(true);
    expect(result.state.seats).toHaveLength(3);
    expect(result.state.seats.every((candidate) => candidate.deedIds.length === 2)).toBe(true);
    expect(new Set(result.state.seats.flatMap((candidate) => candidate.deedIds)).size).toBe(6);
    expect(result.state.bank.deedIds).toHaveLength(PLACEHOLDER_BUNDLE.deeds.length - 6);
    expect(result.state.deeds.filter((deed) => deed.ownerSeatId !== undefined)).toHaveLength(6);
    expect(replay(before, result.events, rules)).toEqual({ ...result.state, prng: before.prng });
  });

  it.each([2, 3, 4, 5, 6])("deals one deed to every seat at %s seats", (seatCount) => {
    const rules: RuleSet = {
      content: { ...PLACEHOLDER_BUNDLE, decks: [] },
      configuration: configuration({ startingAssetsDealt: true }),
    };
    const result = resolve(
      lobby(seatCount),
      { actorSeatId: "seat-1", command: { type: "StartGame" } },
      rules,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected starting deal to resolve");
    expect(result.state.seats.every((candidate) => candidate.deedIds.length === 1)).toBe(true);
    expect(result.state.bank.deedIds).toHaveLength(PLACEHOLDER_BUNDLE.deeds.length - seatCount);
  });

  it("rejects an undersized eligible pool instead of dealing unevenly", () => {
    const content: ContentBundle = {
      ...PLACEHOLDER_BUNDLE,
      economy: {
        ...PLACEHOLDER_BUNDLE.economy,
        startingAssetEligibleDeedIds: PLACEHOLDER_BUNDLE.deeds
          .slice(0, 2)
          .map((deed) => deed.deedId),
      },
    };
    const before = lobby();
    const result = resolve(
      before,
      { actorSeatId: "seat-1", command: { type: "StartGame" } },
      { content, configuration: configuration({ startingAssetsDealt: true }) },
    );
    expect(result).toMatchObject({
      ok: false,
      reasonCode: "STARTING_ASSETS_UNAVAILABLE",
    });
    expect(result.ok ? result.state : before).toEqual(before);
  });

  it.each([
    ["canonical buy", "BuyImprovement", "d-sawhorse-lane", [1, 0], false, "EVEN_BUILDING_REQUIRED"],
    ["relaxed buy", "BuyImprovement", "d-sawhorse-lane", [1, 0], true, undefined],
    [
      "canonical sell",
      "SellImprovement",
      "d-chalk-arrow-walk",
      [2, 1],
      false,
      "EVEN_BUILDING_REQUIRED",
    ],
    ["relaxed sell", "SellImprovement", "d-chalk-arrow-walk", [2, 1], true, undefined],
  ] as const)(
    "%s changes only the even-building rule",
    (_name, type, deedId, levels, relaxed, reason) => {
      const result = improve(districtState(levels, 20), type, deedId, {
        relaxedEvenBuilding: relaxed,
      });
      expect(result.ok).toBe(reason === undefined);
      if (reason !== undefined) expect(result).toMatchObject({ reasonCode: reason });
    },
  );

  it.each([
    ["finite", false, "IMPROVEMENT_INVENTORY_EXHAUSTED"],
    ["unlimited", true, undefined],
  ] as const)("%s inventory is independently enforced", (_name, unlimited, reason) => {
    const result = improve(districtState([0, 0], 0), "BuyImprovement", "d-sawhorse-lane", {
      unlimitedImprovementInventory: unlimited,
    });
    expect(result.ok).toBe(reason === undefined);
    if (reason !== undefined) expect(result).toMatchObject({ reasonCode: reason });
  });

  it("combines all three D4 toggles without changing other construction guards", () => {
    const rules: RuleSet = {
      content: PLACEHOLDER_BUNDLE,
      configuration: configuration({
        startingAssetsDealt: true,
        relaxedEvenBuilding: true,
        unlimitedImprovementInventory: true,
      }),
    };
    const started = resolve(
      lobby(),
      { actorSeatId: "seat-1", command: { type: "StartGame" } },
      rules,
    );
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error("expected combined setup to resolve");
    expect(started.state.seats.every((candidate) => candidate.deedIds.length === 1)).toBe(true);
    const bought = improve(districtState([1, 0], 0), "BuyImprovement", "d-sawhorse-lane", {
      relaxedEvenBuilding: true,
      unlimitedImprovementInventory: true,
    });
    expect(bought).toMatchObject({ ok: true });
  });
});
