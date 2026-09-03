import { describe, expect, it, vi } from "vitest";
import { STANDARD_CONFIGURATION, GameSnapshotProjection } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { deriveInitialState, type GameState } from "@blockparty/game-engine";
import type { ProjectionContext } from "../src/server/projections/authorize";
import { buildSeatProjection } from "../src/server/projections/authorize";

vi.mock("server-only", () => ({}));

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 19 + 11) & 0xff));
const GAME_ID = "00000000-0000-4000-8000-000000000005";

function projectionContext(): ProjectionContext {
  return {
    rules: { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION },
    status: "ACTIVE",
    versions: {
      contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
      rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
      variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    configuration: STANDARD_CONFIGURATION,
    expiresAt: "2026-10-03T15:00:00.000Z",
    sequence: 17,
    hostSeatId: "seat-a",
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        name: "North Star",
        token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
        isHost: true,
        connected: true,
      },
      {
        seatId: "seat-b",
        kind: "human",
        name: "Side Street",
        token: { colorIndex: 2, shape: "cooler", pattern: "stripe" },
        isHost: false,
        connected: false,
      },
    ],
  };
}

function state(): GameState {
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: GAME_ID,
    aggregateVersion: 4,
    phase: "AwaitRoll",
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        status: "active",
        balance: 145000,
        position: 2,
        deedIds: ["d-sawhorse-lane"],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: ["card-secret-release"],
      },
      {
        seatId: "seat-b",
        kind: "human",
        status: "active",
        balance: 155000,
        position: 2,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: ["card-other-secret"],
      },
    ],
    deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
      deedId: deed.deedId,
      ...(deed.deedId === "d-sawhorse-lane" ? { ownerSeatId: "seat-a" } : {}),
      mortgaged: false,
      improvementLevel: 0,
    })),
    bank: {
      cash: 700000,
      deedIds: PLACEHOLDER_BUNDLE.deeds
        .map((deed) => deed.deedId)
        .filter((deedId) => deedId !== "d-sawhorse-lane"),
      improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
    },
    activeSeatId: "seat-a",
    prioritySeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    decks: [{ deckId: "deck-secret", drawPile: ["future-card"], discardPile: [] }],
    prng: deriveInitialState(SEED),
  };
}

describe("authorized seat projections", () => {
  it("constructs an allowlisted projection with legal actions and no server secrets", () => {
    const projection = buildSeatProjection(state(), "seat-a", projectionContext());

    expect(GameSnapshotProjection.safeParse(projection).success).toBe(true);
    expect(projection.sequence).toBe(17);
    expect(projection.legalActions).toEqual([{ type: "RollDice" }, { type: "EndNoContest" }]);
    expect(projection.seats[0]).toMatchObject({
      seatId: "seat-a",
      balance: 145000,
      deedIds: ["d-sawhorse-lane"],
      detentionReleaseCardCount: 1,
      isSelf: true,
    });
    expect(projection.seats[1]).toMatchObject({
      seatId: "seat-b",
      balance: 155000,
      detentionReleaseCardCount: 1,
      isSelf: false,
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("future-card");
    expect(serialized).not.toContain("card-secret-release");
    expect(serialized).not.toContain("prng");
    expect(serialized).not.toContain("seed");
    expect(serialized).not.toContain("decks");
    expect(projection).not.toHaveProperty("secretSeed");
    expect(projection).not.toHaveProperty("contentHash");
  });
});
