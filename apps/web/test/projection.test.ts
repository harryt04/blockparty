import { describe, expect, it, vi } from "vitest";
import { STANDARD_CONFIGURATION, GameSnapshotProjection } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { deriveInitialState, type GameState } from "@blockparty/game-engine";
import type { ProjectionContext } from "../src/server/projections/authorize";
import { buildSeatProjection } from "../src/server/projections/authorize";
import { publicEvent } from "../src/server/commands/handle-command";
import { readPublicEvents } from "../src/server/sync/recovery";

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
      detentionReleaseCardIds: ["card-secret-release"],
      isSelf: true,
    });
    expect(projection.seats[1]).toMatchObject({
      seatId: "seat-b",
      balance: 155000,
      detentionReleaseCardCount: 1,
      isSelf: false,
    });
    expect(projection.bank).toMatchObject({ cash: 700000, deedIds: expect.any(Array) });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("future-card");
    expect(serialized).toContain("card-secret-release");
    expect(serialized).not.toContain("card-other-secret");
    expect(serialized).not.toContain("prng");
    expect(serialized).not.toContain("seed");
    expect(serialized).not.toContain("decks");
    expect(projection).not.toHaveProperty("secretSeed");
    expect(projection).not.toHaveProperty("contentHash");
  });

  it("shares a pending trade only with its named parties", () => {
    const pendingTrade = {
      tradeId: "trade:projection:1",
      proposerSeatId: "seat-a",
      counterpartySeatId: "seat-b",
      offered: { cash: 1_000, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: [] },
      requested: { cash: 2_000, deedIds: [], detentionReleaseCardIds: ["card-other-secret"] },
      proposerBalance: 145_000,
      counterpartyBalance: 155_000,
      offeredDeedSnapshots: [{ deedId: "d-sawhorse-lane", mortgaged: false, improvementLevel: 0 }],
      requestedDeedSnapshots: [],
      aggregateVersion: 5,
    } as const;
    const withOffer: GameState = { ...state(), pendingTrade };
    const proposer = buildSeatProjection(withOffer, "seat-a", projectionContext());
    const counterparty = buildSeatProjection(withOffer, "seat-b", projectionContext());
    const anonymous = buildSeatProjection(withOffer, undefined, projectionContext());

    expect(proposer.pendingTrade).toMatchObject({
      tradeId: pendingTrade.tradeId,
      proposerSeatId: pendingTrade.proposerSeatId,
      counterpartySeatId: pendingTrade.counterpartySeatId,
      offered: pendingTrade.offered,
      requested: pendingTrade.requested,
    });
    expect(counterparty.pendingTrade).toMatchObject({ tradeId: pendingTrade.tradeId });
    expect(anonymous.pendingTrade).toBeUndefined();
    expect(JSON.stringify(anonymous)).not.toContain("card-other-secret");
  });

  it("does not publish held card identities in trade history", () => {
    const event = {
      gameId: GAME_ID,
      sequence: 8,
      aggregateVersion: 8,
      type: "TradeProposed",
      eventVersion: 1,
      actorSeatId: "seat-a",
      occurredAt: "2026-09-03T15:00:08.000Z",
      payload: {
        tradeId: "trade:private-card",
        offered: { cash: 0, deedIds: [], detentionReleaseCardIds: ["card-secret-release"] },
        requested: { cash: 1_000, deedIds: [], detentionReleaseCardIds: [] },
      },
    } as const;
    const published = publicEvent(event);
    expect(published.payload).toMatchObject({
      offered: { detentionReleaseCardIds: [] },
    });
    expect(JSON.stringify(published)).not.toContain("card-secret-release");
  });

  it("orders recent history and removes private card facts before projection", async () => {
    const events = [
      {
        gameId: GAME_ID,
        sequence: 2,
        aggregateVersion: 2,
        type: "CardDrawn",
        eventVersion: 1,
        actorSeatId: "seat-a",
        occurredAt: "2026-09-03T15:00:02.000Z",
        payload: {
          cardId: "secret-card",
          deckId: "secret-deck",
          remainingCardIds: ["future-card"],
        },
      },
      {
        gameId: GAME_ID,
        sequence: 1,
        aggregateVersion: 1,
        type: "DiceRolled",
        eventVersion: 1,
        actorSeatId: "seat-a",
        occurredAt: "2026-09-03T15:00:01.000Z",
        payload: { first: 2, second: 3 },
      },
    ] as const;
    const publicEvents = await readPublicEvents(
      {
        find: vi.fn(() => ({
          sort: vi.fn(() => ({
            limit: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(events) })),
          })),
        })),
      } as never,
      GAME_ID,
    );

    expect(publicEvents.map((event) => event.sequence)).toEqual([1, 2]);
    expect(publicEvents[1]?.payload).not.toHaveProperty("cardId");
    expect(publicEvents[1]?.payload).not.toHaveProperty("remainingCardIds");
    expect(publicEvents[1]?.payload).not.toHaveProperty("deckId");
  });
});
