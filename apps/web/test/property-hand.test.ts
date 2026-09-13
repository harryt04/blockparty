import { describe, expect, it } from "vitest";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION, type GameSnapshotProjection } from "@blockparty/contracts";
import { propertyHandGroups } from "../src/components/game/property-hand-model";

const deed = CLASSIC_BUNDLE.deeds.find((candidate) => candidate.category === "district");
if (deed === undefined) throw new Error("classic fixture must contain a district Property");
if (deed.districtId === undefined) throw new Error("classic district Property must name a Block");
const space = CLASSIC_BUNDLE.spaces.find((candidate) => candidate.deedId === deed.deedId);
if (space === undefined) throw new Error("classic fixture must contain the deed space");

const snapshot: GameSnapshotProjection = {
  gameId: "00000000-0000-4000-8000-000000000099",
  status: "ACTIVE",
  phase: "TurnStart",
  aggregateVersion: 4,
  sequence: 4,
  versions: {
    contentVersion: CLASSIC_BUNDLE.contentVersion,
    rulesSchemaVersion: CLASSIC_BUNDLE.rulesSchemaVersion,
    variantSchemaVersion: CLASSIC_BUNDLE.variantSchemaVersion,
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
      balance: 150_000,
      deedIds: [deed.deedId],
      isHost: true,
      connected: true,
      isSelf: true,
    },
  ],
  board: [
    {
      spaceId: space.spaceId,
      routeIndex: space.routeIndex,
      name: space.name,
      category: "deed",
      deedId: deed.deedId,
      deedCategory: deed.category,
      districtId: deed.districtId,
      price: deed.price,
      occupantSeatIds: [],
      improvementLevel: 2,
    },
  ],
  legalActions: [],
  actionAvailability: [],
  recovery: {
    safeBoundary: true,
    replacementSeatIds: [],
    viewerCanRequestReclaim: false,
    viewerCanClaimHost: false,
  },
  paused: false,
  expiresAt: "2026-10-03T15:00:00.000Z",
};

describe("property hand model", () => {
  it("groups the local hand and reflects authoritative rent, level, and mortgage state", () => {
    const groups = propertyHandGroups(snapshot);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ groupId: deed.districtId, deeds: [{ deedId: deed.deedId }] });
    expect(groups[0]?.label).toBe(
      CLASSIC_BUNDLE.districts.find((district) => district.districtId === deed.districtId)?.name,
    );
    expect(groups[0]?.deeds[0]).toMatchObject({
      spaceId: deed.spaceId,
      name: deed.name,
      categoryLabel: "Block",
      rent: deed.improvementLevels?.find((level) => level.level === 2)?.rent,
      rentIsVariable: false,
      rentLevel: "2 Houses",
      buildCost: deed.improvementCost,
      improvementLevel: 2,
      mortgaged: false,
    });
  });

  it("does not invent a hand when the viewer has no authorized deed list", () => {
    expect(
      propertyHandGroups({
        ...snapshot,
        seats: [{ ...snapshot.seats[0]!, deedIds: undefined }],
      }),
    ).toEqual([]);
  });
});
