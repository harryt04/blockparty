import { afterAll, describe, expect, it, vi } from "vitest";

// Server-only is enforced by Next.js in the application build. Vitest runs
// this Node-side integration suite outside that build boundary.
vi.mock("server-only", () => ({}));

import { ensureIndexes, INDEXES } from "../src/server/db/collections";

const replicaSetUri = process.env.MONGODB_TEST_URI;
const databaseName = `blockparty_b1_${process.pid}`;
if (replicaSetUri !== undefined) {
  process.env.MONGODB_URI = replicaSetUri;
  process.env.MONGODB_DB = databaseName;
}
const clientAdapter = await import("../src/server/db/client");

describe("MongoDB readiness", () => {
  it("distinguishes an absent database configuration", async () => {
    if (replicaSetUri !== undefined) return;
    await expect(clientAdapter.pingDatabase()).resolves.toBe("not_configured");
  });

  it("accepts only a writable replica-set primary", async () => {
    await expect(
      clientAdapter.checkDatabaseReadiness({
        command: async () => ({ setName: "blockparty-rs", isWritablePrimary: true }),
      }),
    ).resolves.toBe("ok");

    await expect(
      clientAdapter.checkDatabaseReadiness({
        command: async () => ({ isWritablePrimary: true }),
      }),
    ).resolves.toBe("unreachable");

    await expect(
      clientAdapter.checkDatabaseReadiness({
        command: async () => ({ setName: "blockparty-rs", isWritablePrimary: false }),
      }),
    ).resolves.toBe("unreachable");

    await expect(
      clientAdapter.checkDatabaseReadiness({
        command: async () => {
          throw new Error("connection refused");
        },
      }),
    ).resolves.toBe("unreachable");
  });
});

/**
 * Set MONGODB_TEST_URI to an ephemeral replica-set URI to run the protocol
 * integration portion locally or in CI. The normal no-database gate remains
 * runnable without infrastructure.
 */
const integration = describe.skipIf(replicaSetUri === undefined);

integration("MongoDB replica-set integration", () => {
  afterAll(async () => {
    if (replicaSetUri === undefined) return;
    await clientAdapter.closeMongoClient();
  });

  it("applies the complete index plan idempotently and supports transactions", async () => {
    const client = clientAdapter.getMongoClient();
    await client.connect();
    const database = clientAdapter.getDb();
    await expect(clientAdapter.pingDatabase()).resolves.toBe("ok");

    const first = await ensureIndexes(database);
    const second = await ensureIndexes(database);
    expect(second).toEqual(first);
    expect(first).toEqual({
      collections: Object.keys(INDEXES).length,
      indexes: 15,
    });

    for (const [collectionName, definitions] of Object.entries(INDEXES)) {
      const names = (await database.collection(collectionName).listIndexes().toArray()).map(
        (index) => index.name,
      );
      expect(names).toEqual(
        expect.arrayContaining([
          "_id_",
          ...definitions.map((definition) => definition.options.name),
        ]),
      );
    }

    const receipts = database.collection("commandReceipts");

    await clientAdapter.withMongoTransaction(async (session) => {
      await receipts.insertOne({ gameId: "game-1", commandId: "command-1" }, { session });
    });
    await expect(receipts.countDocuments({ gameId: "game-1" })).resolves.toBe(1);
    expect(clientAdapter.activeMongoSessionCount()).toBe(0);

    await database.dropDatabase();
    await clientAdapter.closeMongoClient();
    expect(clientAdapter.activeMongoSessionCount()).toBe(0);
  });
});
