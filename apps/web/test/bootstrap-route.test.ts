import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readGameCapability: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ readGameCapability: mocks.readGameCapability }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/env", () => ({ isProduction: false }));

import { canonicalHashBundle, PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION, GameSnapshotProjection } from "@blockparty/contracts";
import { deriveInitialState, type GameState } from "@blockparty/game-engine";
import type { GameDocument } from "../src/server/games/create-game";
import { GET } from "../src/app/api/games/[gameId]/bootstrap/route";

const GAME_ID = "00000000-0000-4000-8000-000000000006";

function game(): GameDocument {
  const state: GameState = {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: GAME_ID,
    aggregateVersion: 0,
    phase: "Lobby",
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        status: "active",
        balance: 0,
        position: 0,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
      {
        seatId: "seat-b",
        kind: "human",
        status: "active",
        balance: 0,
        position: 0,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
    ],
    deeds: [],
    bank: { cash: 0, deedIds: [], improvementInventory: {} },
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    decks: [{ deckId: "private-deck", drawPile: ["future-card"], discardPile: [] }],
    prng: deriveInitialState(Uint8Array.from({ length: 32 }, (_, index) => index + 1)),
  };
  return {
    _id: GAME_ID,
    status: "LOBBY",
    name: "Private block",
    seatCount: 2,
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        status: "active",
        name: "Host",
        token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
      },
      {
        seatId: "seat-b",
        kind: "human",
        status: "active",
        token: { colorIndex: 2, shape: "cooler", pattern: "stripe" },
      },
    ],
    hostSeatId: "seat-a",
    configuration: STANDARD_CONFIGURATION,
    contentHash: canonicalHashBundle(PLACEHOLDER_BUNDLE),
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
    variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
    stateSchemaVersion: "1.0.0",
    engineVersion: "0.1.0",
    secretSeed: {} as GameDocument["secretSeed"],
    snapshot: state,
    lobby: {
      seats: [
        { seatId: "seat-a", connected: true },
        { seatId: "seat-b", connected: false },
      ],
    } as GameDocument["lobby"],
    aggregateVersion: 0,
    lastSequence: 0,
    createdAt: new Date("2026-09-03T15:00:00.000Z"),
    lastAuthoritativeActionAt: new Date("2026-09-03T15:00:00.000Z"),
    expiresAt: new Date("2026-10-03T15:00:00.000Z"),
  };
}

describe("GET /api/games/[gameId]/bootstrap", () => {
  it("authenticates the seat and returns only the authorized projection", async () => {
    const storedGame = game();
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: "seat-a",
      kind: "seat",
    });
    mocks.getDb.mockReturnValue({
      collection: (name: string) =>
        name === "games"
          ? { findOne: vi.fn().mockResolvedValue(storedGame) }
          : {
              find: vi.fn(() => ({
                sort: vi.fn(() => ({
                  limit: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
                })),
              })),
            },
    });

    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/bootstrap`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(GameSnapshotProjection.safeParse(body.snapshot).success).toBe(true);
    expect(body.snapshot.viewerSeatId).toBe("seat-a");
    expect(body.snapshot.legalActions).toEqual([{ type: "StartGame" }]);
    expect(JSON.stringify(body)).not.toContain("future-card");
    expect(JSON.stringify(body)).not.toContain("secretSeed");
    expect(JSON.stringify(body)).not.toContain("prng");
    expect(JSON.stringify(body)).not.toContain("contentHash");
    expect(mocks.readGameCapability).toHaveBeenCalledWith(GAME_ID);
  });

  it("does not bootstrap without a valid seat capability", async () => {
    mocks.readGameCapability.mockResolvedValue(undefined);
    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/bootstrap`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
