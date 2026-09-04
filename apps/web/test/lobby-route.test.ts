import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readSeatCapability: vi.fn(),
  getDb: vi.fn(),
  subscriberCount: vi.fn(() => 0),
}));

vi.mock("@/server/auth/session", () => ({ readSeatCapability: mocks.readSeatCapability }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/sse/registry", () => ({ subscriberCount: mocks.subscriberCount }));

import { CreateGameRequest, LobbyProjection, STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { createGameInTransaction, type GameDocument } from "../src/server/games/create-game";
import { GET } from "../src/app/api/games/[gameId]/lobby/route";

const GAME_ID = "00000000-0000-4000-8000-000000000004";

async function fixture(): Promise<GameDocument> {
  const games: GameDocument[] = [];
  await createGameInTransaction(
    {
      games: { insertOne: vi.fn(async (game: GameDocument) => void games.push(game)) },
      invitations: { insertOne: vi.fn(async () => undefined) },
      capabilities: { insertOne: vi.fn(async () => undefined) },
      hostCapabilities: { insertOne: vi.fn(async () => undefined) },
      auditLog: { insertOne: vi.fn(async () => undefined) },
    } as never,
    {} as never,
    CreateGameRequest.parse({
      seatCount: 2,
      botSeatCount: 0,
      preset: "standard",
      configuration: STANDARD_CONFIGURATION,
      acknowledged13Plus: true,
    }),
    new Date("2026-09-03T15:00:00.000Z"),
  );
  const game = games[0]!;
  return { ...game, _id: GAME_ID };
}

describe("GET /api/games/[gameId]/lobby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires seat authority and returns the allowlisted lobby projection", async () => {
    const game = await fixture();
    mocks.readSeatCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: game.hostSeatId,
      kind: "seat",
    });
    mocks.getDb.mockReturnValue({
      collection: () => ({ findOne: vi.fn(async () => game) }),
    });

    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/lobby`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(LobbyProjection.safeParse(body).success).toBe(true);
    expect(body.viewerIsHost).toBe(true);
    expect(body.canStart).toBe(false);
    expect(JSON.stringify(body)).not.toContain("secretSeed");
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("does not read the database without a seat cookie", async () => {
    mocks.readSeatCapability.mockResolvedValue(undefined);
    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/lobby`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
