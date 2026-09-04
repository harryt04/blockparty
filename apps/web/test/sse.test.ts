import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalHashBundle, PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { CreateGameRequest } from "@blockparty/contracts";
import { createGameInTransaction, type GameDocument } from "../src/server/games/create-game";
import {
  canSubscribe,
  closeSseConnections,
  publishSnapshot,
  subscribe,
  subscriberCount,
  subscribedSeatAccess,
  subscribedSeatIds,
} from "../src/server/sse/registry";
import {
  ensureChangeStream,
  publishCommittedProjection,
  stopChangeStream,
} from "../src/server/sse/change-stream";

const GAME_ID = "00000000-0000-4000-8000-000000000025";

function subscriber(gameId: string, seatId: string, frames: string[]) {
  return {
    gameId,
    seatId,
    send: (frame: string) => frames.push(frame),
    close: vi.fn(),
  };
}

function snapshot(viewerSeatId: string, sequence: number) {
  return {
    viewerSeatId,
    gameId: GAME_ID,
    aggregateVersion: sequence,
    sequence,
  } as never;
}

describe("authenticated SSE delivery", () => {
  it("keeps presence ephemeral, bounds duplicate-seat connections, and preserves monotonic frames", () => {
    const firstFrames: string[] = [];
    const secondFrames: string[] = [];
    const first = subscriber(GAME_ID, "seat-a", firstFrames);
    const second = subscriber(GAME_ID, "seat-b", secondFrames);
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);

    expect(subscriberCount(GAME_ID)).toBe(2);
    expect(subscribedSeatIds(GAME_ID)).toEqual(["seat-a", "seat-b"]);
    expect(firstFrames.some((frame) => frame.includes('"state":"connected"'))).toBe(true);
    expect(firstFrames.some((frame) => frame.includes('"seatId":"seat-b"'))).toBe(true);

    publishSnapshot(GAME_ID, "seat-a", snapshot("seat-a", 3));
    publishSnapshot(GAME_ID, "seat-a", snapshot("seat-a", 3));
    expect(firstFrames.filter((frame) => frame.startsWith("event: game.snapshot"))).toHaveLength(1);
    expect(secondFrames.filter((frame) => frame.startsWith("event: game.snapshot"))).toHaveLength(
      0,
    );
    expect(canSubscribe(GAME_ID, "seat-a")).toBe(true);

    unsubscribeFirst();
    unsubscribeSecond();
    expect(subscriberCount(GAME_ID)).toBe(0);
    expect(firstFrames.some((frame) => frame.includes('"state":"disconnected"'))).toBe(false);

    const limited: Array<() => void> = [];
    for (let index = 0; index < 8; index += 1) {
      limited.push(subscribe(subscriber(GAME_ID, "seat-a", [])));
    }
    expect(canSubscribe(GAME_ID, "seat-a")).toBe(false);
    expect(() => subscribe(subscriber(GAME_ID, "seat-a", []))).toThrow("SSE connection limit");
    limited.forEach((unsubscribe) => unsubscribe());

    const reconnectFrames: string[] = [];
    const reconnect = subscribe(subscriber(GAME_ID, "seat-a", reconnectFrames));
    expect(reconnectFrames.some((frame) => frame.includes('"state":"reconnected"'))).toBe(true);
    reconnect();
  });

  it("builds a separate allowlisted projection for every subscribed seat", async () => {
    const documents: GameDocument[] = [];
    const request = CreateGameRequest.parse({
      seatCount: 2,
      botSeatCount: 0,
      preset: "standard",
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
      acknowledged13Plus: true,
    });
    await createGameInTransaction(
      {
        games: { insertOne: vi.fn(async (game: GameDocument) => void documents.push(game)) },
        invitations: { insertOne: vi.fn(async () => undefined) },
        capabilities: { insertOne: vi.fn(async () => undefined) },
        hostCapabilities: { insertOne: vi.fn(async () => undefined) },
        auditLog: { insertOne: vi.fn(async () => undefined) },
      } as never,
      {} as never,
      request,
      new Date("2026-09-03T15:00:00.000Z"),
    );
    const game = documents[0]!;
    const firstFrames: string[] = [];
    const secondFrames: string[] = [];
    const firstUnsubscribe = subscribe(subscriber(game._id, game.hostSeatId, firstFrames));
    const secondSeatId = game.seats[1]!.seatId;
    const secondUnsubscribe = subscribe(subscriber(game._id, secondSeatId, secondFrames));

    await publishCommittedProjection({ gameId: game._id, sequence: 0, aggregateVersion: 0 }, {
      collection: (name: string) =>
        name === "games"
          ? { findOne: vi.fn(async () => game) }
          : {
              find: vi.fn(() => ({
                sort: vi.fn(() => ({
                  limit: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
                })),
              })),
            },
    } as never);

    const firstProjection = JSON.parse(
      firstFrames.find((frame) => frame.startsWith("event: game.snapshot"))!.split("data: ")[1]!,
    );
    const secondProjection = JSON.parse(
      secondFrames.find((frame) => frame.startsWith("event: game.snapshot"))!.split("data: ")[1]!,
    );
    expect(firstProjection.snapshot.viewerSeatId).toBe(game.hostSeatId);
    expect(secondProjection.snapshot.viewerSeatId).toBe(secondSeatId);
    expect(JSON.stringify(firstProjection)).not.toContain("secretSeed");
    expect(JSON.stringify(firstProjection)).not.toContain("prng");
    expect(JSON.stringify(firstProjection)).not.toContain("contentHash");
    expect(canonicalHashBundle(PLACEHOLDER_BUNDLE)).toBe(game.contentHash);

    firstUnsubscribe();
    secondUnsubscribe();
  });

  it("preserves reclaim projection authority across committed SSE snapshots", () => {
    const frames: string[] = [];
    const unsubscribe = subscribe({
      ...subscriber(GAME_ID, "seat-a", frames),
      capabilityKind: "reclaim",
    });
    expect(subscribedSeatAccess(GAME_ID)).toEqual([
      { seatId: "seat-a", capabilityKind: "reclaim" },
    ]);

    publishSnapshot(GAME_ID, "seat-a", snapshot("seat-a", 9), "reclaim");
    expect(frames.filter((frame) => frame.startsWith("event: game.snapshot"))).toHaveLength(1);
    unsubscribe();
  });

  it("opens one MongoDB event cursor and closes it cleanly", async () => {
    const close = vi.fn(async () => undefined);
    const watch = vi.fn(() => ({
      close,
      [Symbol.asyncIterator]: () => ({
        next: async () => await new Promise<never>(() => undefined),
      }),
    }));
    const database = {
      collection: () => ({ watch }),
    };

    ensureChangeStream(database as never);
    expect(watch).toHaveBeenCalledWith([{ $match: { operationType: "insert" } }]);
    await stopChangeStream();
    expect(close).toHaveBeenCalledOnce();
  });

  it("signals shutdown before closing every authenticated stream", () => {
    const firstFrames: string[] = [];
    const secondFrames: string[] = [];
    const first = subscriber(GAME_ID, "seat-a", firstFrames);
    const second = subscriber(GAME_ID, "seat-b", secondFrames);
    subscribe(first);
    subscribe(second);

    closeSseConnections("SERVER_SHUTDOWN");

    expect(firstFrames.some((frame) => frame.includes('"reason":"SERVER_SHUTDOWN"'))).toBe(true);
    expect(secondFrames.some((frame) => frame.includes('"reason":"SERVER_SHUTDOWN"'))).toBe(true);
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(subscriberCount(GAME_ID)).toBe(0);
  });
});
