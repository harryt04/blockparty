import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ClientSession } from "mongodb";
import { CreateGameRequest, LobbyProjection } from "@blockparty/contracts";
import { jsonOk } from "../src/server/http/responses";
import {
  createGameInTransaction,
  setCreationCookies,
  type AuditDocument,
  type CapabilityDocument,
  type CreationStore,
  type GameDocument,
  type HostCapabilityDocument,
  type InvitationDocument,
} from "../src/server/games/create-game";
import { COOKIE_NAMES } from "../src/server/auth/capabilities";

afterEach(() => {
  vi.restoreAllMocks();
});

function collection<T>() {
  const documents: T[] = [];
  const insertOne = vi.fn(async (document: T) => {
    documents.push(document);
    return { acknowledged: true, insertedId: "test" };
  });
  return { documents, insertOne };
}

function store(): {
  store: CreationStore;
  documents: {
    games: GameDocument[];
    invitations: InvitationDocument[];
    capabilities: CapabilityDocument[];
    hostCapabilities: HostCapabilityDocument[];
    auditLog: AuditDocument[];
  };
} {
  const games = collection<GameDocument>();
  const invitations = collection<InvitationDocument>();
  const capabilities = collection<CapabilityDocument>();
  const hostCapabilities = collection<HostCapabilityDocument>();
  const auditLog = collection<AuditDocument>();
  return {
    store: { games, invitations, capabilities, hostCapabilities, auditLog },
    documents: {
      games: games.documents,
      invitations: invitations.documents,
      capabilities: capabilities.documents,
      hostCapabilities: hostCapabilities.documents,
      auditLog: auditLog.documents,
    },
  };
}

const request = CreateGameRequest.parse({
  name: "Saturday on the Sidewalk",
  seatCount: 4,
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
});

describe("game creation and capability issuance", () => {
  it("persists a complete lobby with captured versions, seed, expiry, and hash-only authorities", async () => {
    const createdAt = new Date("2026-09-03T15:00:00.000Z");
    const { store: database, documents } = store();
    const created = await createGameInTransaction(
      database,
      {} as ClientSession,
      request,
      createdAt,
    );

    const game = documents.games[0]!;
    expect(documents.games).toHaveLength(1);
    expect(documents.invitations).toHaveLength(1);
    expect(documents.capabilities).toHaveLength(2);
    expect(documents.hostCapabilities).toHaveLength(1);
    expect(documents.auditLog).toHaveLength(1);
    expect(game._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(game.secretSeed.value()).toHaveLength(32);
    expect(game.expiresAt.toISOString()).toBe("2026-10-03T15:00:00.000Z");
    expect(game.lobby).toMatchObject({
      gameId: game._id,
      status: "LOBBY",
      seatCount: 4,
      invitePath: expect.stringMatching(/^\/join\/[A-Za-z0-9_-]{32}$/),
      canStart: false,
    });
    expect(LobbyProjection.safeParse(created.lobby).success).toBe(true);
    expect(game.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(game.lobby).not.toHaveProperty("secretSeed");

    const storedSecrets = JSON.stringify({
      game,
      ...documents.capabilities,
      ...documents.hostCapabilities,
    });
    expect(storedSecrets).not.toContain(created.capabilities.seat);
    expect(storedSecrets).not.toContain(created.capabilities.host);
    expect(storedSecrets).not.toContain(created.capabilities.reclaim);
    expect(documents.capabilities.every((capability) => capability.tokenHash.length === 64)).toBe(
      true,
    );
    expect(documents.hostCapabilities[0]!.tokenHash).toHaveLength(64);
    expect(
      new Set([created.capabilities.seat, created.capabilities.host, created.capabilities.reclaim])
        .size,
    ).toBe(3);
  });

  it("puts the issued authorities only in cookies, never in the response body", async () => {
    const { store: database } = store();
    const created = await createGameInTransaction(database, {} as ClientSession, request);
    const response = jsonOk({ gameId: created.lobby.gameId, lobby: created.lobby });
    setCreationCookies(response, created.capabilities);

    const body = await response.json();
    expect(body).not.toHaveProperty("capabilities");
    expect(JSON.stringify(body)).not.toContain(created.capabilities.seat);
    expect(JSON.stringify(body)).not.toContain(created.capabilities.host);
    expect(JSON.stringify(body)).not.toContain(created.capabilities.reclaim);

    expect(response.cookies.get(COOKIE_NAMES.seat)?.value).toBe(created.capabilities.seat);
    expect(response.cookies.get(COOKIE_NAMES.host)?.value).toBe(created.capabilities.host);
    expect(response.cookies.get(COOKIE_NAMES.reclaim)?.value).toBe(created.capabilities.reclaim);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
  });
});
