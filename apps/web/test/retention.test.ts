import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MongoClient, type ClientSession } from "mongodb";
import {
  retentionStore,
  runRetentionCleanup,
  type RetentionStore,
} from "../src/server/retention/cleanup";

type Document = Record<string, unknown>;
type StringIdDocument = Document & { _id?: string };

function matches(document: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
      if ("$lte" in expected) {
        return (
          (actual instanceof Date && expected.$lte instanceof Date && actual <= expected.$lte) ||
          (typeof actual === "number" &&
            typeof expected.$lte === "number" &&
            actual <= expected.$lte)
        );
      }
      if ("$in" in expected && Array.isArray(expected.$in)) {
        return expected.$in.includes(actual);
      }
    }
    return actual === expected;
  });
}

function collection(initial: Document[], log: string[] = []) {
  const documents = initial;
  return {
    find: vi.fn((filter: Document) => {
      let selected = documents.filter((document) => matches(document, filter));
      return {
        sort: vi.fn(() => {
          selected = [...selected].sort((left, right) =>
            String(left._id).localeCompare(String(right._id)),
          );
          return {
            limit: vi.fn((size: number) => ({
              toArray: vi.fn(async () => selected.slice(0, size)),
            })),
          };
        }),
        toArray: vi.fn(async () => selected),
      };
    }),
    findOne: vi.fn(
      async (filter: Document) => documents.find((document) => matches(document, filter)) ?? null,
    ),
    updateOne: vi.fn(async (filter: Document, update: Document) => {
      const document = documents.find((candidate) => matches(candidate, filter));
      if (document === undefined) return { matchedCount: 0 };
      Object.assign(document, update.$set ?? {});
      return { matchedCount: 1 };
    }),
    updateMany: vi.fn(async (filter: Document, update: Document) => {
      const selected = documents.filter((document) => matches(document, filter));
      for (const document of selected) Object.assign(document, update.$set ?? {});
      return { matchedCount: selected.length, modifiedCount: selected.length };
    }),
    insertOne: vi.fn(async (document: Document) => {
      log.push("insert-event");
      documents.push(document);
      return { acknowledged: true };
    }),
    deleteMany: vi.fn(async (filter: Document) => {
      log.push("delete");
      const kept = documents.filter((document) => !matches(document, filter));
      const deletedCount = documents.length - kept.length;
      documents.splice(0, documents.length, ...kept);
      return { deletedCount };
    }),
  };
}

function game(id: string, status: "ACTIVE" | "COMPLETED", expiresAt: Date): Document {
  return {
    _id: id,
    status,
    expiresAt,
    aggregateVersion: 4,
    lastSequence: 8,
    snapshot: { gameId: id, aggregateVersion: 4 },
  };
}

function retentionFixture() {
  const now = new Date("2026-09-03T15:00:00.000Z");
  const games = [
    game("00000000-0000-4000-8000-000000000001", "ACTIVE", now),
    game("00000000-0000-4000-8000-000000000002", "COMPLETED", now),
    game("00000000-0000-4000-8000-000000000003", "ACTIVE", new Date(now.getTime() + 1)),
  ];
  const events: Document[] = [];
  const capabilities = [
    { gameId: "00000000-0000-4000-8000-000000000001", status: "active" },
    { gameId: "00000000-0000-4000-8000-000000000001", status: "active" },
    { gameId: "00000000-0000-4000-8000-000000000002", status: "active" },
  ];
  const hostCapabilities = [{ gameId: "00000000-0000-4000-8000-000000000001", status: "active" }];
  const log: string[] = [];
  const store = {
    games: collection(games, log),
    gameEvents: collection(events, log),
    commandReceipts: collection([{ gameId: "00000000-0000-4000-8000-000000000001" }], log),
    invitations: collection([{ gameId: "00000000-0000-4000-8000-000000000001" }], log),
    capabilities: collection(capabilities, log),
    hostCapabilities: collection(hostCapabilities, log),
    auditLog: collection([{ gameId: "00000000-0000-4000-8000-000000000001" }], log),
  } as unknown as RetentionStore;
  const transaction = async <T>(operation: (session: ClientSession) => Promise<T>) =>
    operation({} as ClientSession);
  return { now, games, capabilities, hostCapabilities, events, log, store, transaction };
}

describe("B10 retention cleanup", () => {
  it("transitions exact-boundary active games before bounded cascade deletion", async () => {
    const fixture = retentionFixture();
    const result = await runRetentionCleanup({
      database: fixture.store,
      transaction: fixture.transaction,
      now: fixture.now,
      batchSize: 1,
    });

    expect(result).toEqual({ expiredGames: 1, deletedGames: 2, revokedCapabilities: 3 });
    expect(fixture.games.map((stored) => stored._id)).toEqual([
      "00000000-0000-4000-8000-000000000003",
    ]);
    expect(fixture.capabilities).toHaveLength(0);
    expect(fixture.hostCapabilities).toHaveLength(0);
    expect(fixture.events).toHaveLength(0);
    expect(fixture.log.indexOf("insert-event")).toBeLessThan(fixture.log.indexOf("delete"));
  });

  it("does not extend non-due games and is idempotent on retry", async () => {
    const fixture = retentionFixture();
    const before = fixture.games[2]!.expiresAt;

    await runRetentionCleanup({
      database: fixture.store,
      transaction: fixture.transaction,
      now: fixture.now,
      batchSize: 1,
    });
    const retry = await runRetentionCleanup({
      database: fixture.store,
      transaction: fixture.transaction,
      now: fixture.now,
      batchSize: 1,
    });

    expect(fixture.games).toHaveLength(1);
    expect(fixture.games[0]!.expiresAt).toBe(before);
    expect(retry).toEqual({ expiredGames: 0, deletedGames: 0, revokedCapabilities: 0 });
  });
});

const replicaSetUri = process.env.MONGODB_TEST_URI;
const integration = describe.skipIf(replicaSetUri === undefined);

integration("B10 MongoDB replica-set retention", () => {
  const client = replicaSetUri === undefined ? undefined : new MongoClient(replicaSetUri);
  const databaseName = `blockparty_b10_${process.pid}`;
  let store: RetentionStore;

  beforeAll(async () => {
    await client!.connect();
    store = retentionStore(client!.db(databaseName));
  });

  afterAll(async () => {
    await client!.db(databaseName).dropDatabase();
    await client!.close();
  });

  it("uses the exact boundary and cascades every related collection", async () => {
    const now = new Date("2026-09-03T15:00:00.000Z");
    const activeId = "00000000-0000-4000-8000-000000000011";
    const completedId = "00000000-0000-4000-8000-000000000012";
    const futureId = "00000000-0000-4000-8000-000000000013";
    const raw = client!.db(databaseName);
    const rawGames = raw.collection<StringIdDocument>("games");
    await rawGames.insertMany([
      game(activeId, "ACTIVE", now),
      game(completedId, "COMPLETED", now),
      game(futureId, "ACTIVE", new Date(now.getTime() + 1)),
    ]);
    await raw.collection("capabilities").insertMany([
      { gameId: activeId, status: "active" },
      { gameId: activeId, status: "active" },
      { gameId: completedId, status: "active" },
    ]);
    await raw.collection("hostCapabilities").insertOne({ gameId: activeId, status: "active" });
    await raw.collection("gameEvents").insertOne({ gameId: activeId, sequence: 1 });
    await raw.collection("commandReceipts").insertOne({ gameId: activeId, commandId: "command" });
    await raw.collection("invitations").insertOne({ gameId: activeId });
    await raw.collection("auditLog").insertOne({ gameId: activeId });

    const transaction = async <T>(operation: (session: ClientSession) => Promise<T>) => {
      const session = client!.startSession();
      try {
        return await session.withTransaction(() => operation(session));
      } finally {
        await session.endSession();
      }
    };
    const result = await runRetentionCleanup({
      database: store,
      transaction,
      now,
      batchSize: 2,
    });

    expect(result).toEqual({ expiredGames: 1, deletedGames: 2, revokedCapabilities: 3 });
    await expect(rawGames.countDocuments({ _id: futureId })).resolves.toBe(1);
    await expect(raw.collection("capabilities").countDocuments()).resolves.toBe(0);
    await expect(raw.collection("hostCapabilities").countDocuments()).resolves.toBe(0);
    await expect(raw.collection("gameEvents").countDocuments()).resolves.toBe(0);
    await expect(raw.collection("commandReceipts").countDocuments()).resolves.toBe(0);
    await expect(raw.collection("invitations").countDocuments()).resolves.toBe(0);
    await expect(raw.collection("auditLog").countDocuments()).resolves.toBe(0);
    await expect(
      runRetentionCleanup({ database: store, transaction, now, batchSize: 2 }),
    ).resolves.toEqual({ expiredGames: 0, deletedGames: 0, revokedCapabilities: 0 });
  });
});
