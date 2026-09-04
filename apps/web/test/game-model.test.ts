import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION, type GameSnapshotProjection } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  activeSpace,
  acquisitionDecisionContext,
  auctionDecisionContext,
  boardLayout,
  commandForLegalAction,
  districtNames,
  enabledVariantLabels,
  latestDiceResult,
  managementDecisionContext,
  detentionDecisionContext,
  obligationDecisionContext,
  orderedBoard,
  latestTradeOutcome,
  tradeComposerContext,
  tradeDecisionContext,
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

  it("derives only bounded command payloads from server legal actions", () => {
    expect(commandForLegalAction({ type: "RollDice" })).toEqual({ type: "RollDice" });
    expect(
      commandForLegalAction({
        type: "PlaceAuctionBid",
        constraints: { minBid: 4001, maxBid: 20_000 },
      }),
    ).toEqual({ type: "PlaceAuctionBid", amount: 4001 });
    expect(
      commandForLegalAction(
        { type: "PlaceAuctionBid", constraints: { minBid: 4001, maxBid: 20_000 } },
        5000,
      ),
    ).toEqual({ type: "PlaceAuctionBid", amount: 5000 });
    expect(
      commandForLegalAction({ type: "MortgageDeed", constraints: { deedId: "d-sawhorse-lane" } }),
    ).toEqual({ type: "MortgageDeed", deedId: "d-sawhorse-lane" });
    expect(
      commandForLegalAction({
        type: "ProposeTrade",
        constraints: { counterpartySeatId: "seat-b" },
      }),
    ).toBeUndefined();
  });

  it("builds acquisition context from the server deed constraint and projection", () => {
    const value = snapshot({
      phase: "AwaitPurchase",
      board: [
        {
          ...snapshot().board[0]!,
          price: 12_000,
        },
        snapshot().board[1]!,
      ],
      legalActions: [
        { type: "AcquireDeed", constraints: { deedId: "d-sawhorse-lane" } },
        { type: "DeclineAcquisition", constraints: { deedId: "d-sawhorse-lane" } },
      ],
    });

    expect(acquisitionDecisionContext(value)).toMatchObject({
      deedId: "d-sawhorse-lane",
      spaceName: "Sawhorse Lane",
      categoryLabel: "Block",
      price: 12_000,
      balance: 150_000,
      projectedBalance: 138_000,
      canAcquire: true,
    });

    expect(
      acquisitionDecisionContext({
        ...value,
        seats: [{ ...value.seats[0]!, balance: 1_000 }],
        legalActions: [{ type: "DeclineAcquisition", constraints: { deedId: "d-sawhorse-lane" } }],
      }),
    ).toMatchObject({
      balance: 1_000,
      price: 12_000,
      projectedBalance: -11_000,
      canAcquire: false,
    });
  });

  it("exposes untimed auction leader, priority, passes, and bid bounds", () => {
    const value = snapshot({
      phase: "AwaitAuction",
      paused: true,
      seats: [
        snapshot().seats[0]!,
        {
          ...snapshot().seats[0]!,
          seatId: "seat-b",
          name: "Maya",
          isHost: false,
          isSelf: false,
          connected: false,
        },
      ],
      auction: {
        deedId: "d-sawhorse-lane",
        highBid: 4_000,
        highBidderSeatId: "seat-b",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-b",
        passedSeatIds: ["seat-a"],
      },
      legalActions: [{ type: "PassAuction" }],
    });

    expect(auctionDecisionContext(value)).toEqual({
      deedId: "d-sawhorse-lane",
      spaceName: "Sawhorse Lane",
      categoryLabel: "Block",
      highBid: 4_000,
      minimumNextBid: 4_001,
      maximumBid: 150_000,
      balance: 150_000,
      prioritySeatId: "seat-b",
      priorityName: "Maya",
      priorityConnected: false,
      leaderName: "Maya",
      passedNames: ["North Star"],
    });
  });

  it("builds a management preview from content and server action data", () => {
    const value = snapshot({
      phase: "TurnStart",
      bank: { cash: 20_000, deedIds: [], improvementInventory: { stall: 7, stage: 2 } },
      legalActions: [
        { type: "BuyImprovement", constraints: { deedId: "d-sawhorse-lane" } },
        { type: "MortgageDeed", constraints: { deedId: "d-sawhorse-lane" } },
      ],
      actionAvailability: [
        {
          type: "RedeemMortgage",
          available: false,
          reasonCode: "DEED_NOT_MORTGAGED",
          reason: "This deed is not mortgaged.",
        },
      ],
    });

    expect(managementDecisionContext(value)).toMatchObject({
      inventoryKind: "stall",
      inventoryAvailable: 7,
      inventoryUnlimited: false,
      balance: 150_000,
      deeds: [
        {
          deedId: "d-sawhorse-lane",
          categoryLabel: "Block",
          improvementLevel: 0,
          maximumImprovementLevel: 3,
          districtComplete: false,
          nextImprovementCost: 10_000,
          mortgageValue: 6_000,
          redemptionAmount: 12_600,
          actions: [{ type: "BuyImprovement" }, { type: "MortgageDeed" }],
        },
      ],
      blocked: [{ type: "RedeemMortgage", reasonCode: "DEED_NOT_MORTGAGED" }],
    });
  });

  it("reads the latest authoritative dice event without inventing an outcome", () => {
    expect(
      latestDiceResult(
        snapshot({
          publicEvents: [
            {
              gameId: "00000000-0000-4000-8000-000000000099",
              sequence: 2,
              aggregateVersion: 2,
              type: "DiceRolled",
              eventVersion: 1,
              occurredAt: "2026-09-03T15:00:02.000Z",
              payload: { first: 3, second: 5 },
            },
          ],
        }),
      ),
    ).toEqual({ first: 3, second: 5 });
  });

  it("presents detention routes and untimed debt details from canonical state", () => {
    const detained = snapshot({
      phase: "AwaitChoice",
      activeSeatId: "seat-a",
      seats: [{ ...snapshot().seats[0]!, detained: true, detentionTurnsRemaining: 2 }],
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "detention:seat-a", optionId: "attempt-roll" },
        },
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "detention:seat-a", optionId: "use-release-card:c-flyer-04" },
        },
      ],
    });
    expect(detentionDecisionContext(detained)).toMatchObject({
      attempts: 2,
      maxAttempts: 3,
      releaseFee: 5_000,
      routes: [{ label: "Attempt a matching roll" }, { label: "Use A neighbourly word" }],
    });

    const debt = snapshot({
      viewerSeatId: "seat-a",
      phase: "AwaitDebt",
      seats: [
        snapshot().seats[0]!,
        { ...snapshot().seats[0]!, seatId: "seat-b", name: "Maya", isSelf: false },
      ],
      obligation: {
        debtorSeatId: "seat-a",
        amount: 20_000,
        creditorSeatId: "seat-b",
        reasonCode: "RENT",
        reason: "A rent payment is due.",
      },
      legalActions: [
        { type: "MortgageDeed", constraints: { deedId: "d-sawhorse-lane" } },
        { type: "DeclareBankruptcy" },
      ],
    });
    expect(obligationDecisionContext(debt)).toMatchObject({
      debtorName: "North Star",
      viewerIsDebtor: true,
      amount: 20_000,
      creditorName: "Maya",
      shortfall: 0,
      liquidation: [{ type: "MortgageDeed" }],
      canDeclareBankruptcy: true,
    });
  });

  it("maps named-party trade offers to display assets and explicit mortgage charges", () => {
    const value = snapshot({
      viewerSeatId: "seat-a",
      seats: [
        { ...snapshot().seats[0]!, detentionReleaseCardIds: ["c-flyer-04"] },
        {
          ...snapshot().seats[0]!,
          seatId: "seat-b",
          name: "Maya",
          isHost: false,
          isSelf: false,
          balance: 90_000,
          deedIds: [],
        },
      ],
      board: [
        { ...snapshot().board[0]!, mortgaged: true, ownerSeatId: "seat-a" },
        snapshot().board[1]!,
      ],
      legalActions: [{ type: "AcceptTrade", constraints: { tradeId: "trade-1" } }],
      pendingTrade: {
        tradeId: "trade-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 4_000, deedIds: [], detentionReleaseCardIds: ["c-flyer-04"] },
        requested: { cash: 2_000, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: [] },
        proposerBalance: 90_000,
        counterpartyBalance: 150_000,
        aggregateVersion: 5,
      },
      publicEvents: [
        {
          gameId: "00000000-0000-4000-8000-000000000099",
          sequence: 5,
          aggregateVersion: 5,
          type: "TradeStaled",
          eventVersion: 1,
          occurredAt: "2026-09-03T15:00:05.000Z",
          payload: { tradeId: "trade-0" },
        },
      ],
    });

    expect(tradeDecisionContext(value)).toMatchObject({
      tradeId: "trade-1",
      proposerName: "Maya",
      counterpartyName: "North Star",
      canAccept: true,
      offered: {
        cash: 4_000,
        detentionReleaseCards: [{ label: "A neighbourly word" }],
      },
      requested: {
        deeds: [{ label: "Sawhorse Lane", mortgaged: true, transferCharge: 600 }],
        incomingMortgageCharge: 600,
      },
    });
    expect(latestTradeOutcome(value)).toBe("stale");
  });

  it("exposes only current owned assets to the compose context", () => {
    const value = snapshot({
      seats: [
        { ...snapshot().seats[0]!, detentionReleaseCardIds: ["c-flyer-04"] },
        {
          ...snapshot().seats[0]!,
          seatId: "seat-b",
          name: "Maya",
          isHost: false,
          isSelf: false,
          deedIds: [],
          detentionReleaseCardIds: ["c-flyer-03"],
        },
      ],
      legalActions: [{ type: "ProposeTrade", constraints: { counterpartySeatId: "seat-b" } }],
    });

    expect(tradeComposerContext(value)).toMatchObject({
      offeredDeeds: [{ assetId: "d-sawhorse-lane", label: "Sawhorse Lane" }],
      offeredDetentionReleaseCards: [{ assetId: "c-flyer-04", label: "A neighbourly word" }],
      counterparties: [{ seatId: "seat-b", name: "Maya", deeds: [] }],
    });
  });
});
