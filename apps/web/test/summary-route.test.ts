import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readGameCapability: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ readGameCapability: mocks.readGameCapability }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/env", () => ({ isProduction: false }));

import { SummaryResponse } from "@blockparty/contracts";
import { canonicalHashBundle, PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { deriveInitialState, type GameState } from "@blockparty/game-engine";
import type { GameDocument } from "../src/server/games/create-game";
import { GET } from "../src/app/api/games/[gameId]/summary/route";

const GAME_ID = "00000000-0000-4000-8000-000000000042";

function game(status: "COMPLETED" | "NO_CONTEST" = "COMPLETED"): GameDocument {
  const state: GameState = {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: GAME_ID,
    aggregateVersion: 4,
    phase: "Finished",
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        status: "active",
        balance: 180_000,
        position: 2,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
      {
        seatId: "seat-b",
        kind: "human",
        status: "eliminated",
        balance: 0,
        position: 3,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
    ],
    deeds: [],
    bank: { cash: 0, deedIds: [], improvementInventory: {} },
    activeSeatId: "seat-a",
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    eliminationOrder: ["seat-b"],
    terminalReason: status === "NO_CONTEST" ? "NO_CONTEST" : "WINNER",
    ...(status === "COMPLETED" ? { winnerSeatId: "seat-a" } : {}),
    prng: deriveInitialState(new Uint8Array(32)),
  };
  return {
    _id: GAME_ID,
    status,
    seatCount: 2,
    seats: [
      {
        seatId: "seat-a",
        kind: "human",
        status: "active",
        name: "North Star",
        token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
      },
      {
        seatId: "seat-b",
        kind: "human",
        status: "replaced",
        name: "Side Street",
        token: { colorIndex: 2, shape: "cooler", pattern: "stripe" },
      },
    ],
    hostSeatId: "seat-a",
    configuration: {
      schemaVersion: "1.0.0",
      preset: "standard",
      restSpaceJackpot: false,
      doubleStartOnExactLanding: false,
      noAuctionAfterDeclinedAcquisition: false,
      noIncomeWhileDetained: false,
      bonusForMatchingOnes: false,
      startingAssetsDealt: false,
      relaxedEvenBuilding: false,
      unlimitedImprovementInventory: false,
    },
    contentHash: canonicalHashBundle(PLACEHOLDER_BUNDLE),
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
    variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
    stateSchemaVersion: "1.0.0",
    engineVersion: "0.1.0",
    secretSeed: {} as GameDocument["secretSeed"],
    snapshot: state,
    lobby: { seats: [] } as unknown as GameDocument["lobby"],
    aggregateVersion: 4,
    lastSequence: 4,
    createdAt: new Date("2026-09-03T15:00:00.000Z"),
    lastAuthoritativeActionAt: new Date("2026-09-03T15:04:05.000Z"),
    expiresAt: new Date("2026-10-03T15:04:05.000Z"),
  };
}

function arrange(storedGame: GameDocument, events: readonly Record<string, unknown>[] = []) {
  mocks.getDb.mockReturnValue({
    collection: (name: string) =>
      name === "games"
        ? { findOne: vi.fn().mockResolvedValue(storedGame) }
        : {
            find: vi.fn(() => ({
              sort: vi.fn(() => ({
                limit: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(events) })),
              })),
            })),
          },
  });
}

describe("GET /api/games/[gameId]/summary", () => {
  it("returns a terminal, authorized standings projection with redacted history", async () => {
    const storedGame = game();
    mocks.readGameCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    arrange(storedGame, [
      {
        gameId: GAME_ID,
        sequence: 4,
        aggregateVersion: 4,
        type: "GameCompleted",
        eventVersion: 1,
        occurredAt: "2026-09-03T15:04:05.000Z",
        payload: { winnerSeatId: "seat-a" },
      },
    ]);

    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/summary`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(SummaryResponse.safeParse(body).success).toBe(true);
    expect(body.summary.finishReason).toBe("WINNER");
    expect(body.summary.winnerSeatId).toBe("seat-a");
    expect(body.summary.durationSeconds).toBe(245);
    expect(body.summary.publicEvents).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secretSeed");
    expect(JSON.stringify(body)).not.toContain("prng");
  });

  it("makes no-winner terminal state explicit and rejects an unfinished game", async () => {
    mocks.readGameCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    const noWinner = game("NO_CONTEST");
    arrange(noWinner);
    const noWinnerResponse = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect((await noWinnerResponse.json()).summary.finishReason).toBe("NO_CONTEST");

    arrange({ ...noWinner, status: "ACTIVE" });
    const activeResponse = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(activeResponse.status).toBe(422);
  });
});
