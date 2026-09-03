import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mongo = vi.hoisted(() => ({
  getDb: vi.fn(),
  withMongoTransaction: vi.fn(),
}));
vi.mock("@/server/db/client", () => mongo);

import type { ClientSession } from "mongodb";
import { JoinGameRequest } from "@blockparty/contracts";
import { COLLECTIONS } from "../src/server/db/collections";
import {
  createGameInTransaction,
  type CreationStore,
  type GameDocument,
} from "../src/server/games/create-game";
import { COOKIE_NAMES } from "../src/server/auth/capabilities";
import { GET } from "../src/app/api/invites/[inviteId]/route";
import { POST } from "../src/app/api/invites/[inviteId]/join/route";

type AnyDocument = Record<string, unknown>;

function setupDatabase() {
  const documents = new Map<string, AnyDocument[]>();
  const names = [
    COLLECTIONS.games,
    COLLECTIONS.invitations,
    COLLECTIONS.capabilities,
    COLLECTIONS.hostCapabilities,
    COLLECTIONS.auditLog,
  ];
  const collections = new Map<string, AnyDocument>();
  for (const name of names) {
    const rows = documents.get(name) ?? [];
    documents.set(name, rows);
    collections.set(name, {
      insertOne: async (document: AnyDocument) => {
        rows.push(document);
        return { acknowledged: true, insertedId: "test" };
      },
      findOne: async (filter: AnyDocument) =>
        rows.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)) ??
        null,
      updateOne: async (filter: AnyDocument, update: AnyDocument) => {
        const row = rows.find(
          (candidate) =>
            candidate._id === filter._id &&
            candidate.status === filter.status &&
            JSON.stringify(candidate.seats) === JSON.stringify(filter.seats),
        );
        if (row === undefined) return { acknowledged: true, matchedCount: 0 };
        Object.assign(row, update.$set);
        return { acknowledged: true, matchedCount: 1 };
      },
    });
  }
  const database = { collection: (name: string) => collections.get(name)! };
  mongo.getDb.mockReturnValue(database);
  mongo.withMongoTransaction.mockImplementation(
    async (operation: (session: ClientSession) => Promise<unknown>) =>
      operation({} as ClientSession),
  );
  return { database, documents };
}

function requestFor(name: string, token: NonNullable<GameDocument["seats"][number]["token"]>) {
  return JSON.stringify(JoinGameRequest.parse({ name, token, acknowledged13Plus: true }));
}

describe("invite Route Handlers", () => {
  it("keeps invite admission generic and returns new authorities only as cookies", async () => {
    const { database, documents } = setupDatabase();
    const creationStore = {
      games: database.collection(COLLECTIONS.games),
      invitations: database.collection(COLLECTIONS.invitations),
      capabilities: database.collection(COLLECTIONS.capabilities),
      hostCapabilities: database.collection(COLLECTIONS.hostCapabilities),
      auditLog: database.collection(COLLECTIONS.auditLog),
    } as unknown as CreationStore;
    const created = await createGameInTransaction(creationStore, {} as ClientSession, {
      name: "Saturday on the Sidewalk",
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
    const game = documents.get(COLLECTIONS.games)![0] as unknown as GameDocument;
    const openSeat = game.seats.find((seat) => seat.kind === "open")!;
    const inviteId = created.lobby.invitePath!.slice("/join/".length);

    const gate = await GET(new Request("http://localhost/api/invites/" + inviteId), {
      params: Promise.resolve({ inviteId }),
    });
    expect(gate.status).toBe(200);
    expect(await gate.json()).toMatchObject({ status: "OPEN", openSeatCount: 1 });

    const joined = await POST(
      new Request("http://localhost/api/invites/" + inviteId + "/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestFor("  Ada   Lovelace ", openSeat.token),
      }),
      { params: Promise.resolve({ inviteId }) },
    );
    expect(joined.status).toBe(200);
    const body = await joined.json();
    expect(body.lobby.viewerSeatId).toBe(openSeat.seatId);
    expect(body).not.toHaveProperty("capabilities");
    expect(joined.cookies.get(COOKIE_NAMES.seat)?.value).toBeTruthy();
    expect(joined.cookies.get(COOKIE_NAMES.reclaim)?.value).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain(joined.cookies.get(COOKIE_NAMES.seat)?.value);
    expect(documents.get(COLLECTIONS.capabilities)).toHaveLength(4);

    const fullGate = await GET(new Request("http://localhost/api/invites/" + inviteId), {
      params: Promise.resolve({ inviteId }),
    });
    expect(await fullGate.json()).toEqual({ status: "FULL" });

    const unknown = await GET(new Request("http://localhost/api/invites/not-a-real-invite"), {
      params: Promise.resolve({ inviteId: "not-a-real-invite" }),
    });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual({ status: "INVALID" });
  });
});
