import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mongo = vi.hoisted(() => ({
  getDb: vi.fn(),
  withMongoTransaction: vi.fn(),
}));
vi.mock("@/server/db/client", () => mongo);

import type { ClientSession } from "mongodb";
import { COOKIE_NAMES, hashCapability } from "../src/server/auth/capabilities";

const validBody = {
  seatCount: 2,
  botSeatCount: 1,
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
};

describe("POST /api/games", () => {
  it("commits creation before returning the lobby and capability cookies", async () => {
    const documents = new Map<string, Record<string, unknown>[]>();
    const collections = new Map<
      string,
      { insertOne: (document: Record<string, unknown>) => Promise<unknown> }
    >();
    for (const name of ["games", "invitations", "capabilities", "hostCapabilities", "auditLog"]) {
      const collection = {
        insertOne: async (document: Record<string, unknown>) => {
          documents.set(name, [...(documents.get(name) ?? []), document]);
          return { acknowledged: true, insertedId: "test" };
        },
      };
      collections.set(name, collection);
    }
    mongo.getDb.mockReturnValue({ collection: (name: string) => collections.get(name)! });
    mongo.withMongoTransaction.mockImplementation(
      async (operation: (session: ClientSession) => Promise<unknown>) =>
        operation({} as ClientSession),
    );

    const { POST } = await import("../src/app/api/games/route");
    const response = await POST(
      new Request("http://localhost/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.gameId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.invitePath).toMatch(/^\/join\/[A-Za-z0-9_-]{32}$/);
    expect(body).not.toHaveProperty("capabilities");
    expect(JSON.stringify(body)).not.toContain("secretSeed");
    expect(documents.get("games")).toHaveLength(1);
    expect(documents.get("invitations")).toHaveLength(1);
    expect(documents.get("capabilities")).toHaveLength(2);
    expect(documents.get("hostCapabilities")).toHaveLength(1);

    const seatCookie = response.cookies.get(COOKIE_NAMES.seat)?.value;
    const hostCookie = response.cookies.get(COOKIE_NAMES.host)?.value;
    const reclaimCookie = response.cookies.get(COOKIE_NAMES.reclaim)?.value;
    expect(new Set([seatCookie, hostCookie, reclaimCookie]).size).toBe(3);
    expect(documents.get("capabilities")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tokenHash: hashCapability(seatCookie!) }),
        expect.objectContaining({ tokenHash: hashCapability(reclaimCookie!) }),
      ]),
    );
    expect(documents.get("hostCapabilities")).toEqual([
      expect.objectContaining({ tokenHash: hashCapability(hostCookie!) }),
    ]);
  });
});
