import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readGameCapability: vi.fn(),
  getDb: vi.fn(),
  withMongoTransaction: vi.fn(),
  createGameInTransaction: vi.fn(),
  setCreationCookies: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ readGameCapability: mocks.readGameCapability }));
vi.mock("@/server/db/client", () => ({
  getDb: mocks.getDb,
  withMongoTransaction: mocks.withMongoTransaction,
}));
vi.mock("@/server/games/create-game", () => ({
  createGameInTransaction: mocks.createGameInTransaction,
  setCreationCookies: mocks.setCreationCookies,
}));

import { POST } from "../src/app/api/games/[gameId]/rematch/route";

const GAME_ID = "00000000-0000-4000-8000-000000000043";

const requestBody = {
  seatCount: 3,
  botSeatCount: 1,
  preset: "short-game",
  configuration: {
    schemaVersion: "1.0.0",
    preset: "short-game",
    restSpaceJackpot: false,
    doubleStartOnExactLanding: false,
    noAuctionAfterDeclinedAcquisition: false,
    noIncomeWhileDetained: false,
    bonusForMatchingOnes: false,
    startingAssetsDealt: true,
    relaxedEvenBuilding: true,
    unlimitedImprovementInventory: false,
  },
  acknowledged13Plus: true,
};

function arrange(status: "COMPLETED" | "ACTIVE" = "COMPLETED") {
  mocks.getDb.mockReturnValue({
    collection: (name: string) =>
      name === "games"
        ? {
            findOne: vi.fn().mockResolvedValue({
              _id: GAME_ID,
              status,
              expiresAt: new Date("2026-10-03T00:00:00.000Z"),
              seats: [{ seatId: "seat-a" }],
            }),
          }
        : {},
  });
}

describe("POST /api/games/[gameId]/rematch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new lobby from explicit choices after terminal authorization", async () => {
    mocks.readGameCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    arrange();
    mocks.withMongoTransaction.mockImplementation(async (operation: (session: object) => unknown) =>
      operation({}),
    );
    mocks.createGameInTransaction.mockResolvedValue({
      lobby: {
        gameId: "00000000-0000-4000-8000-000000000044",
        invitePath: "/join/abcdefghijklmnopqrstuvwx123456",
      },
      capabilities: { seat: "new-seat", host: "new-host", reclaim: "new-reclaim" },
    });

    const response = await POST(
      new Request(`http://localhost/api/games/${GAME_ID}/rematch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );

    expect(response.status).toBe(201);
    expect((await response.json()).gameId).toBe("00000000-0000-4000-8000-000000000044");
    expect(mocks.createGameInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ seatCount: 3, botSeatCount: 1, preset: "short-game" }),
      expect.any(Date),
      { production: false },
    );
    expect(mocks.setCreationCookies).toHaveBeenCalledWith(expect.any(Response), {
      seat: "new-seat",
      host: "new-host",
      reclaim: "new-reclaim",
    });
  });

  it("does not create a rematch for an active game", async () => {
    mocks.readGameCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    arrange("ACTIVE");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    expect(response.status).toBe(422);
    expect(mocks.createGameInTransaction).not.toHaveBeenCalled();
  });
});
