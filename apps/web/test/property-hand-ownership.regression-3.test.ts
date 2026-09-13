import { describe, expect, it } from "vitest";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION, type GameSnapshotProjection } from "@blockparty/contracts";
import { managementDecisionContext } from "../src/components/game/game-model";

const deed = CLASSIC_BUNDLE.deeds.find((candidate) => candidate.category === "district");
if (deed === undefined) throw new Error("classic fixture must contain a district deed");
const space = CLASSIC_BUNDLE.spaces.find((candidate) => candidate.deedId === deed.deedId);
if (space === undefined) throw new Error("classic fixture must contain the deed space");

const snapshot: GameSnapshotProjection = {
  gameId: "00000000-0000-4000-8000-000000000103",
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
      ownerSeatId: "seat-a",
      occupantSeatIds: [],
      improvementLevel: 0,
    },
  ],
  legalActions: [{ type: "MortgageDeed", constraints: { deedId: deed.deedId } }],
  actionAvailability: [
    {
      type: "MortgageDeed",
      available: false,
      reasonCode: "DEED_NOT_OWNED",
      reason: "This seat does not own that deed.",
    },
    {
      type: "BuyImprovement",
      available: false,
      reasonCode: "IMPROVEMENT_NOT_OWNED",
      reason: "This action is unavailable right now.",
    },
    {
      type: "RedeemMortgage",
      available: false,
      reasonCode: "DEED_NOT_MORTGAGED",
      reason: "This deed is not mortgaged.",
    },
  ],
  recovery: {
    safeBoundary: true,
    replacementSeatIds: [],
    viewerCanRequestReclaim: false,
    viewerCanClaimHost: false,
  },
  paused: false,
  expiresAt: "2026-10-03T15:00:00.000Z",
};

describe("property hand ownership blocked guidance", () => {
  it("does not attach generic unowned-target warnings to an owned deed", () => {
    const management = managementDecisionContext(snapshot);

    expect(management?.deeds[0]?.blockedReasons).toEqual(["This deed is not mortgaged."]);
  });
});
