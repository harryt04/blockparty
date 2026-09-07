import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MongoClient, type ClientSession } from "mongodb";
import type {
  AuditDocument,
  CapabilityDocument,
  GameDocument,
  HostCapabilityDocument,
} from "../src/server/games/create-game";
import {
  PLACEHOLDER_CONTENT_VERSION,
  placeholderRetirementStore,
  runPlaceholderRetirement,
  type PlaceholderRetirementStore,
} from "../src/server/retention/placeholder-retirement";

const NOW = new Date("2026-09-07T15:00:00.000Z");

function game(
  id: string,
  status: "LOBBY" | "ACTIVE" | "NO_CONTEST",
  options: { readonly contentVersion?: string; readonly paused?: boolean } = {},
): GameDocument {
  return {
    _id: id,
    status,
    seatCount: 2,
    seats: [],
    hostSeatId: "host",
    configuration: {} as GameDocument["configuration"],
    contentHash: "placeholder-hash",
    contentVersion: options.contentVersion ?? PLACEHOLDER_CONTENT_VERSION,
    rulesSchemaVersion: "1.0.0",
    variantSchemaVersion: "1.0.0",
    stateSchemaVersion: "1.0.0",
    engineVersion: "0.1.0",
    secretSeed: {} as GameDocument["secretSeed"],
    snapshot: {
      stateSchemaVersion: "1.0.0",
      contentVersion: options.contentVersion ?? PLACEHOLDER_CONTENT_VERSION,
      gameId: id,
      aggregateVersion: 4,
      phase: status === "LOBBY" ? "Lobby" : status === "ACTIVE" ? "AwaitRoll" : "Finished",
      seats: [],
      deeds: [],
      bank: { cash: 0, deedIds: [], improvementInventory: {} },
      consecutiveMatchingRolls: 0,
      effectQueue: status === "ACTIVE" ? [{ sourceId: "pending", effect: {} as never }] : [],
      terminalReason: status === "NO_CONTEST" ? "NO_CONTEST" : undefined,
      prng: {} as GameDocument["snapshot"]["prng"],
    },
    lobby: {} as GameDocument["lobby"],
    aggregateVersion: 4,
    lastSequence: 8,
    createdAt: new Date("2026-09-01T15:00:00.000Z"),
    lastAuthoritativeActionAt: new Date("2026-09-06T15:00:00.000Z"),
    expiresAt: new Date("2026-10-01T15:00:00.000Z"),
    ...(options.paused === true ? { paused: true, pausedSeatId: "seat-paused" } : {}),
  };
}

function matches(document: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (typeof expected === "object" && expected !== null && !Array.isArray(expected)) {
      if ("$in" in expected && Array.isArray(expected.$in)) return expected.$in.includes(actual);
    }
    return actual === expected;
  });
}

function fixture() {
  const games = [
    game("00000000-0000-4000-8000-000000000001", "LOBBY"),
    game("00000000-0000-4000-8000-000000000002", "ACTIVE", { paused: true }),
    game("00000000-0000-4000-8000-000000000003", "NO_CONTEST"),
    game("00000000-0000-4000-8000-000000000004", "ACTIVE", {
      contentVersion: "1.0.0",
    }),
  ];
  const events: Record<string, unknown>[] = [];
  const capabilities: CapabilityDocument[] = [
    {
      gameId: games[0]!._id,
      seatId: "host",
      kind: "seat",
      status: "active",
      tokenHash: "a",
      createdAt: NOW,
      expiresAt: NOW,
    },
    {
      gameId: games[1]!._id,
      seatId: "host",
      kind: "reclaim",
      status: "active",
      tokenHash: "b",
      createdAt: NOW,
      expiresAt: NOW,
    },
  ];
  const hostCapabilities: HostCapabilityDocument[] = [
    {
      gameId: games[0]!._id,
      seatId: "host",
      status: "active",
      tokenHash: "c",
      createdAt: NOW,
      expiresAt: NOW,
    },
  ];
  const audits: AuditDocument[] = [];
  const operations: string[] = [];
  const gamesCollection = {
    countDocuments: vi.fn(
      async (filter: Record<string, unknown>) =>
        games.filter((candidate) =>
          matches(candidate as unknown as Record<string, unknown>, filter),
        ).length,
    ),
    find: vi.fn((filter: Record<string, unknown>) => {
      let selected = games.filter((candidate) =>
        matches(candidate as unknown as Record<string, unknown>, filter),
      );
      return {
        sort: vi.fn(() => {
          selected = [...selected].sort((left, right) => left._id.localeCompare(right._id));
          return {
            limit: vi.fn((limit: number) => ({
              toArray: vi.fn(async () => selected.slice(0, limit)),
            })),
          };
        }),
      };
    }),
    findOne: vi.fn(
      async (filter: Record<string, unknown>) =>
        games.find((candidate) =>
          matches(candidate as unknown as Record<string, unknown>, filter),
        ) ?? null,
    ),
    updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const candidate = games.find((entry) =>
        matches(entry as unknown as Record<string, unknown>, filter),
      );
      if (candidate === undefined) return { matchedCount: 0 };
      operations.push("update-game");
      Object.assign(candidate, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {}))
        delete (candidate as unknown as Record<string, unknown>)[key];
      return { matchedCount: 1 };
    }),
  };
  const store = {
    games: gamesCollection,
    gameEvents: {
      insertOne: vi.fn(async (event: Record<string, unknown>) => {
        operations.push("insert-event");
        events.push(event);
        return { acknowledged: true };
      }),
    },
    capabilities: {
      updateMany: vi.fn(
        async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
          const selected = capabilities.filter((entry) =>
            matches(entry as unknown as Record<string, unknown>, filter),
          );
          selected.forEach((entry) => Object.assign(entry, update.$set ?? {}));
          return { matchedCount: selected.length, modifiedCount: selected.length };
        },
      ),
    },
    hostCapabilities: {
      updateMany: vi.fn(
        async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
          const selected = hostCapabilities.filter((entry) =>
            matches(entry as unknown as Record<string, unknown>, filter),
          );
          selected.forEach((entry) => Object.assign(entry, update.$set ?? {}));
          return { matchedCount: selected.length, modifiedCount: selected.length };
        },
      ),
    },
    auditLog: {
      insertOne: vi.fn(async (audit: AuditDocument) => {
        audits.push(audit);
        return { acknowledged: true };
      }),
    },
  } as unknown as PlaceholderRetirementStore;
  const transaction = async <T>(operation: (session: ClientSession) => Promise<T>) =>
    operation({} as ClientSession);
  return { games, events, capabilities, hostCapabilities, audits, operations, store, transaction };
}

describe("placeholder game retirement", () => {
  it("counts only non-terminal placeholder games in dry-run mode", async () => {
    const fixtureState = fixture();
    const result = await runPlaceholderRetirement({
      mode: "dry-run",
      database: fixtureState.store,
      transaction: fixtureState.transaction,
      now: NOW,
    });

    expect(result).toEqual({ mode: "dry-run", candidateGames: 2, retiredGames: 0 });
    expect(fixtureState.events).toHaveLength(0);
    expect(fixtureState.games.map((candidate) => candidate.status)).toEqual([
      "LOBBY",
      "ACTIVE",
      "NO_CONTEST",
      "ACTIVE",
    ]);
  });

  it("retires lobby, active, and paused games atomically and publishes after commit", async () => {
    const fixtureState = fixture();
    let committed = false;
    const publish = vi.fn((_gameId: string, published: readonly Record<string, unknown>[]) => {
      expect(committed).toBe(true);
      expect(published[0]?.payload).toMatchObject({ reason: "CONTENT_RETIRED" });
    });
    const result = await runPlaceholderRetirement({
      mode: "execute",
      database: fixtureState.store,
      transaction: async (operation) => {
        const value = await fixtureState.transaction(operation);
        committed = true;
        return value;
      },
      now: NOW,
      publish,
    });

    expect(result).toEqual({ mode: "execute", candidateGames: 2, retiredGames: 2 });
    expect(fixtureState.games[0]).toMatchObject({
      status: "NO_CONTEST",
      expiresAt: new Date("2026-10-07T15:00:00.000Z"),
    });
    expect(fixtureState.games[1]).toMatchObject({ status: "NO_CONTEST" });
    expect(fixtureState.games[1]).not.toHaveProperty("paused");
    expect(fixtureState.games[0]!.snapshot).toMatchObject({
      phase: "Finished",
      terminalReason: "NO_CONTEST",
      aggregateVersion: 5,
      effectQueue: [],
      pendingSeatReclaimId: undefined,
    });
    expect(fixtureState.capabilities.every((capability) => capability.status === "revoked")).toBe(
      true,
    );
    expect(fixtureState.hostCapabilities[0]?.status).toBe("revoked");
    expect(fixtureState.audits).toMatchObject([
      { gameId: fixtureState.games[0]!._id, action: "game_retired", reasonCode: "CONTENT_RETIRED" },
      { gameId: fixtureState.games[1]!._id, action: "game_retired", reasonCode: "CONTENT_RETIRED" },
    ]);
    expect(fixtureState.operations.indexOf("insert-event")).toBeLessThan(
      fixtureState.operations.indexOf("update-game"),
    );
    expect(publish).toHaveBeenCalledTimes(2);

    await expect(
      runPlaceholderRetirement({
        mode: "execute",
        database: fixtureState.store,
        transaction: fixtureState.transaction,
        now: NOW,
        publish,
      }),
    ).resolves.toEqual({ mode: "execute", candidateGames: 0, retiredGames: 0 });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("leaves the failed batch candidate eligible for a safe retry", async () => {
    const fixtureState = fixture();
    let attempts = 0;
    const interrupted = async <T>(operation: (session: ClientSession) => Promise<T>) => {
      attempts += 1;
      if (attempts === 2) throw new Error("simulated interruption");
      return fixtureState.transaction(operation);
    };

    await expect(
      runPlaceholderRetirement({
        mode: "execute",
        database: fixtureState.store,
        transaction: interrupted,
        now: NOW,
      }),
    ).rejects.toThrow("simulated interruption");
    expect(
      fixtureState.games.filter(
        (candidate) =>
          candidate.status === "NO_CONTEST" &&
          candidate._id !== "00000000-0000-4000-8000-000000000003",
      ),
    ).toHaveLength(1);

    await expect(
      runPlaceholderRetirement({
        mode: "execute",
        database: fixtureState.store,
        transaction: fixtureState.transaction,
        now: NOW,
      }),
    ).resolves.toEqual({ mode: "execute", candidateGames: 1, retiredGames: 1 });
  });

  it("exposes the real collection-backed store", () => {
    const database = { collection: vi.fn((name: string) => ({ name })) };
    const store = placeholderRetirementStore(database as never);
    expect(database.collection).toHaveBeenCalledTimes(5);
    expect(store.games).toBeDefined();
  });
});

const replicaSetUri = process.env.MONGODB_TEST_URI;
const integration = describe.skipIf(replicaSetUri === undefined);

integration("placeholder retirement on a MongoDB replica set", () => {
  const client = replicaSetUri === undefined ? undefined : new MongoClient(replicaSetUri);
  const databaseName = `blockparty_co017_${process.pid}`;

  async function transaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = client!.startSession();
    try {
      return await session.withTransaction(() => operation(session));
    } finally {
      await session.endSession();
    }
  }

  beforeAll(async () => {
    await client!.connect();
  });

  afterAll(async () => {
    await client!.db(databaseName).dropDatabase();
    await client!.close();
  });

  it("commits retirement, preserves summaries, and is safe to repeat", async () => {
    const database = client!.db(databaseName);
    await database.dropDatabase();
    const lobby = game("00000000-0000-4000-8000-000000000101", "LOBBY");
    const paused = game("00000000-0000-4000-8000-000000000102", "ACTIVE", { paused: true });
    const terminal = game("00000000-0000-4000-8000-000000000103", "NO_CONTEST");
    const classic = game("00000000-0000-4000-8000-000000000104", "ACTIVE", {
      contentVersion: "1.0.0",
    });
    await database.collection<GameDocument>("games").insertMany([lobby, paused, terminal, classic]);
    await database.collection("capabilities").insertMany([
      { gameId: lobby._id, status: "active" },
      { gameId: paused._id, status: "active" },
    ]);
    await database.collection("hostCapabilities").insertMany([
      { gameId: lobby._id, status: "active" },
      { gameId: paused._id, status: "active" },
    ]);

    const publish = vi.fn();
    const result = await runPlaceholderRetirement({
      mode: "execute",
      database: placeholderRetirementStore(database),
      transaction,
      now: NOW,
      batchSize: 1,
      publish,
    });

    expect(result).toEqual({ mode: "execute", candidateGames: 2, retiredGames: 2 });
    const retired = await database.collection<GameDocument>("games").findOne({ _id: lobby._id });
    expect(retired).toMatchObject({
      status: "NO_CONTEST",
      expiresAt: new Date("2026-10-07T15:00:00.000Z"),
      snapshot: { phase: "Finished", terminalReason: "NO_CONTEST" },
    });
    await expect(
      database.collection("gameEvents").findOne({ gameId: lobby._id }),
    ).resolves.toMatchObject({
      sequence: lobby.lastSequence + 1,
      aggregateVersion: lobby.aggregateVersion + 1,
      type: "GameEndedNoContest",
      payload: { reason: "CONTENT_RETIRED" },
    });
    await expect(
      database.collection("capabilities").countDocuments({ status: "active" }),
    ).resolves.toBe(0);
    await expect(
      database.collection("hostCapabilities").countDocuments({ status: "active" }),
    ).resolves.toBe(0);
    await expect(
      database.collection("auditLog").countDocuments({ reasonCode: "CONTENT_RETIRED" }),
    ).resolves.toBe(2);
    expect(publish).toHaveBeenCalledTimes(2);

    await expect(
      runPlaceholderRetirement({
        mode: "dry-run",
        database: placeholderRetirementStore(database),
        transaction,
        now: NOW,
      }),
    ).resolves.toEqual({ mode: "dry-run", candidateGames: 0, retiredGames: 0 });
    expect(
      await database.collection<GameDocument>("games").findOne({ _id: classic._id }),
    ).toMatchObject({
      status: "ACTIVE",
      contentVersion: "1.0.0",
    });
    expect(
      await database.collection<GameDocument>("games").findOne({ _id: terminal._id }),
    ).toMatchObject({
      status: "NO_CONTEST",
      contentVersion: PLACEHOLDER_CONTENT_VERSION,
    });
  });

  it("rolls back an interrupted transaction and resumes the remaining candidate", async () => {
    const database = client!.db(databaseName);
    await database.dropDatabase();
    const candidate = game("00000000-0000-4000-8000-000000000111", "ACTIVE");
    await database.collection<GameDocument>("games").insertOne(candidate);
    let interrupted = true;
    const interruptingTransaction = async <T>(
      operation: (session: ClientSession) => Promise<T>,
    ) => {
      const session = client!.startSession();
      try {
        return await session.withTransaction(async () => {
          const result = await operation(session);
          if (interrupted) {
            interrupted = false;
            throw new Error("simulated operator interruption");
          }
          return result;
        });
      } finally {
        await session.endSession();
      }
    };

    await expect(
      runPlaceholderRetirement({
        mode: "execute",
        database: placeholderRetirementStore(database),
        transaction: interruptingTransaction,
        now: NOW,
        publish: vi.fn(),
      }),
    ).rejects.toThrow("simulated operator interruption");
    await expect(
      database.collection<GameDocument>("games").findOne({ _id: candidate._id }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
      aggregateVersion: candidate.aggregateVersion,
    });

    await expect(
      runPlaceholderRetirement({
        mode: "execute",
        database: placeholderRetirementStore(database),
        transaction,
        now: NOW,
        publish: vi.fn(),
      }),
    ).resolves.toEqual({ mode: "execute", candidateGames: 1, retiredGames: 1 });
  });
});
