import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION, type GameSnapshotProjection } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  activeSpace,
  boardLayout,
  districtNames,
  enabledVariantLabels,
  orderedBoard,
} from "../src/components/game/game-model";

const snapshot = (overrides: Partial<GameSnapshotProjection> = {}): GameSnapshotProjection => ({
  gameId: "00000000-0000-4000-8000-000000000099",
  status: "ACTIVE",
  phase: "AwaitRoll",
  aggregateVersion: 4,
  sequence: 4,
  versions: {
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
    variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
    stateSchemaVersion: "1.0.0",
    engineVersion: "0.1.0",
  },
  configuration: STANDARD_CONFIGURATION,
  activeSeatId: "seat-a",
  seats: [
    {
      seatId: "seat-a",
      name: "North Star",
      kind: "human",
      status: "active",
      token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
      position: 1,
      balance: 150000,
      detained: false,
      detentionReleaseCardCount: 0,
      deedIds: ["d-sawhorse-lane"],
      isHost: true,
      connected: true,
      isSelf: true,
    },
  ],
  board: [
    {
      spaceId: "s01",
      deedId: "d-sawhorse-lane",
      routeIndex: 1,
      name: "Sawhorse Lane",
      category: "deed",
      deedCategory: "district",
      districtId: "dist-north",
      occupantSeatIds: [],
    },
    {
      spaceId: "s00",
      routeIndex: 0,
      name: "Sunup Corner",
      category: "start",
      occupantSeatIds: [],
    },
  ],
  legalActions: [],
  actionAvailability: [],
  paused: false,
  expiresAt: "2026-10-03T15:00:00.000Z",
  ...overrides,
});

describe("game presentation model", () => {
  it("keeps the winding board in route order and resolves the active stop", () => {
    const value = snapshot();
    expect(orderedBoard(value.board).map((space) => space.routeIndex)).toEqual([0, 1]);
    expect(activeSpace(value)?.spaceId).toBe("s01");
    expect(boardLayout(value).s00).toEqual({ x: 2, y: 0 });
    expect(districtNames(value)["dist-north"]).toBe("North Kerb");
  });

  it("shows only enabled variant labels at the display boundary", () => {
    const value = snapshot({
      configuration: {
        ...STANDARD_CONFIGURATION,
        preset: "custom",
        restSpaceJackpot: true,
        relaxedEvenBuilding: true,
      },
    });
    expect(enabledVariantLabels(value.configuration)).toEqual([
      "Jackpot on The Stoop",
      "Build without the even-spread rule",
    ]);
  });
});
