import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ ok: true as const })),
  readGameCapability: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/server/http/guards", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/server/auth/session", () => ({ readGameCapability: mocks.readGameCapability }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/env", () => ({ isProduction: false }));

import { CreateGameRequest, EventsEnvelope, STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { createGameInTransaction, type GameDocument } from "../src/server/games/create-game";
import type { GameEventDocument } from "../src/server/commands/handle-command";
import { GET } from "../src/app/api/games/[gameId]/sync/route";

const GAME_ID = "00000000-0000-4000-8000-000000000026";

async function fixture(eventSequences: readonly number[] = [1, 2]) {
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
  Object.assign(game, { _id: GAME_ID });
  const lastSequence = Math.max(...eventSequences, 0);
  Object.assign(game, {
    aggregateVersion: lastSequence,
    lastSequence,
    snapshot: { ...game.snapshot, aggregateVersion: lastSequence },
  });
  const events: GameEventDocument[] = eventSequences.map((sequence) => ({
    gameId: GAME_ID,
    sequence,
    aggregateVersion: sequence,
    type: "TurnStarted",
    eventVersion: 1,
    actorSeatId: game.hostSeatId,
    occurredAt: "2026-09-03T15:00:00.000Z",
    payload: { seatId: game.hostSeatId },
  }));
  return { game, events };
}

function database(game: GameDocument, events: readonly GameEventDocument[]) {
  const persistedEvents = events.map((event) => ({ ...event, _id: "generated-by-mongodb" }));
  return {
    collection: (name: string) => {
      if (name === "games") return { findOne: vi.fn(async () => game) };
      return {
        find: vi.fn(() => ({
          sort: vi.fn(() => ({
            limit: vi.fn((amount: number) => ({
              toArray: vi.fn(async () => persistedEvents.slice(0, amount)),
            })),
          })),
        })),
      };
    },
  };
}

describe("GET /api/games/[gameId]/sync", () => {
  it("returns one authorized contiguous range bounded by the protocol cap", async () => {
    const { game, events } = await fixture();
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: game.hostSeatId,
      kind: "seat",
    });
    mocks.getDb.mockReturnValue(database(game, events));

    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/sync?lastSequence=0&aggregateVersion=0`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(EventsEnvelope.parse(body).events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(body.firstSequence).toBe(1);
    expect(body.lastSequence).toBe(2);
    expect(JSON.stringify(body)).not.toContain("secretSeed");
    expect(JSON.stringify(body)).not.toContain("raw-capability");
  });

  it("removes replay continuations and future card order from public event ranges", async () => {
    const { game, events } = await fixture();
    Object.assign(events[0]!, {
      type: "CardDrawn",
      payload: {
        deckId: "private-deck",
        cardId: "private-card",
        remainingCardIds: ["future-card"],
        discardCardIds: [],
        remainingEffects: [{ sourceId: "private-card" }],
        resolvingCardStack: [{ cardId: "private-card" }],
      },
    });
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: game.hostSeatId,
      kind: "seat",
    });
    mocks.getDb.mockReturnValue(database(game, events));

    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/sync?lastSequence=0&aggregateVersion=0`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    const body = await response.json();
    expect(body.type).toBe("game.events");
    expect(JSON.stringify(body)).not.toContain("private-card");
    expect(JSON.stringify(body)).not.toContain("future-card");
    expect(body.events[0].payload).toEqual({});
  });

  it("replaces a gap, duplicate, or unavailable history with the terminal snapshot", async () => {
    const cases = [[2], [1, 1], []] as const;
    for (const sequences of cases) {
      const { game, events } = await fixture(sequences);
      mocks.readGameCapability.mockResolvedValue({
        gameId: GAME_ID,
        seatId: game.hostSeatId,
        kind: "seat",
      });
      mocks.getDb.mockReturnValue(database(game, events));

      const response = await GET(
        new Request(`http://localhost/api/games/${GAME_ID}/sync?lastSequence=0&aggregateVersion=0`),
        { params: Promise.resolve({ gameId: GAME_ID }) },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.type).toBe("game.snapshot");
      expect(body.sequence).toBe(game.lastSequence);
      expect(body.snapshot.sequence).toBe(game.lastSequence);
    }
  });

  it("never returns more than the bounded recovery range", async () => {
    const { game, events } = await fixture(Array.from({ length: 300 }, (_, index) => index + 1));
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: game.hostSeatId,
      kind: "seat",
    });
    mocks.getDb.mockReturnValue(database(game, events));

    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/sync?lastSequence=0&aggregateVersion=0`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    const body = await response.json();
    expect(body.type).toBe("game.events");
    expect(body.events).toHaveLength(256);
    expect(body.lastSequence).toBe(256);
  });

  it("requires the seat capability and filters seats outside the aggregate", async () => {
    mocks.readGameCapability.mockResolvedValue(undefined);
    const unauthenticated = await GET(new Request(`http://localhost/api/games/${GAME_ID}/sync`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(unauthenticated.status).toBe(401);

    const { game, events } = await fixture();
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: "seat-not-in-game",
      kind: "seat",
    });
    mocks.getDb.mockReturnValue(database(game, events));
    const forbidden = await GET(new Request(`http://localhost/api/games/${GAME_ID}/sync`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(forbidden.status).toBe(403);
  });

  it("rejects an incomplete recovery query instead of guessing a sequence", async () => {
    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/sync?lastSequence=1`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.readGameCapability).not.toHaveBeenCalled();
  });
});
