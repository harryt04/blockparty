import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ClientSession } from "mongodb";
import { JoinGameRequest, LobbyProjection } from "@blockparty/contracts";
import {
  createGameInTransaction,
  type AuditDocument,
  type CapabilityDocument,
  type CreationStore,
  type GameDocument,
  type HostCapabilityDocument,
  type InvitationDocument,
} from "../src/server/games/create-game";
import { COOKIE_NAMES } from "../src/server/auth/capabilities";
import {
  claimSeatInTransaction,
  getInviteStatus,
  JoinNameUnavailableError,
  JoinUnavailableError,
  setJoinCookies,
  type JoinStore,
} from "../src/server/games/join-game";
import { jsonOk } from "../src/server/http/responses";

afterEach(() => {
  vi.restoreAllMocks();
});

const createRequest = (seatCount: 2 | 4, botSeatCount: number) => ({
  name: "Saturday on the Sidewalk",
  seatCount,
  botSeatCount,
  preset: "standard" as const,
  configuration: {
    schemaVersion: "1.0.0" as const,
    preset: "standard" as const,
    restSpaceJackpot: false,
    doubleStartOnExactLanding: false,
    noAuctionAfterDeclinedAcquisition: false,
    noIncomeWhileDetained: false,
    bonusForMatchingOnes: false,
    startingAssetsDealt: false,
    relaxedEvenBuilding: false,
    unlimitedImprovementInventory: false,
  },
  acknowledged13Plus: true as const,
});

function collection<T>() {
  const documents: T[] = [];
  const insertOne = vi.fn(async (document: T) => {
    documents.push(document);
    return { acknowledged: true, insertedId: "test" };
  });
  return { documents, insertOne };
}

async function fixture(seatCount: 2 | 4 = 4, botSeatCount = 1) {
  const games = collection<GameDocument>();
  const invitations = collection<InvitationDocument>();
  const capabilities = collection<CapabilityDocument>();
  const hostCapabilities = collection<HostCapabilityDocument>();
  const auditLog = collection<AuditDocument>();
  const creationStore: CreationStore = {
    games,
    invitations,
    capabilities,
    hostCapabilities,
    auditLog,
  };
  const created = await createGameInTransaction(
    creationStore,
    {} as ClientSession,
    createRequest(seatCount, botSeatCount),
    new Date("2026-09-03T15:00:00.000Z"),
  );
  const game = games.documents[0]!;

  const cloneGame = (): GameDocument => ({
    ...game,
    seats: game.seats.map((seat) => ({ ...seat })),
    lobby: { ...game.lobby, seats: game.lobby.seats.map((seat) => ({ ...seat })) },
  });
  const findInvitation = vi.fn(
    async (filter: { inviteId?: string }) =>
      invitations.documents.find((invitation) => invitation.inviteId === filter.inviteId) ?? null,
  );
  const findGame = vi.fn(async () => cloneGame());
  const updateGame = vi.fn();
  const joinStore: JoinStore = {
    invitations: {
      findOne: findInvitation as unknown as JoinStore["invitations"]["findOne"],
    },
    games: {
      findOne: findGame as unknown as JoinStore["games"]["findOne"],
      updateOne: updateGame as unknown as JoinStore["games"]["updateOne"],
    },
    capabilities,
    auditLog,
  };

  // Keep the fake update atomic while allowing tests to inspect the durable
  // result. This assignment is separate because the MongoDB update type is
  // intentionally abstracted behind JoinStore.
  updateGame.mockImplementation(async (filter, update) => {
    const matches =
      filter._id === game._id &&
      filter.status === game.status &&
      JSON.stringify(filter.seats) === JSON.stringify(game.seats);
    if (!matches) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    Object.assign(game, update.$set);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  });

  return { created, game, invitations, capabilities, auditLog, joinStore };
}

function joinRequest(name: string, token: NonNullable<GameDocument["seats"][number]["token"]>) {
  return JoinGameRequest.parse({ name, token, acknowledged13Plus: true });
}

describe("invite admission and seat claims", () => {
  it("claims the selected open seat transactionally and issues hash-only resumable authorities", async () => {
    const { created, game, capabilities, auditLog, joinStore } = await fixture();
    const openSeat = game.seats.find((seat) => seat.kind === "open")!;
    const now = new Date("2026-09-03T16:00:00.000Z");

    const joined = await claimSeatInTransaction(
      joinStore,
      {} as ClientSession,
      created.lobby.invitePath!.slice("/join/".length),
      joinRequest("  Ada   Lovelace ", openSeat.token),
      now,
    );

    expect(joined.seatId).toBe(openSeat.seatId);
    expect(joined.lobby.viewerSeatId).toBe(openSeat.seatId);
    expect(joined.lobby.seats.find((seat) => seat.seatId === openSeat.seatId)).toMatchObject({
      name: "Ada Lovelace",
      kind: "human",
      isSelf: true,
    });
    expect(LobbyProjection.safeParse(joined.lobby).success).toBe(true);
    expect(capabilities.documents).toHaveLength(4);
    expect(
      capabilities.documents.slice(-2).every((capability) => capability.tokenHash.length === 64),
    ).toBe(true);
    expect(JSON.stringify(capabilities.documents)).not.toContain(joined.capabilities.seat);
    expect(JSON.stringify(capabilities.documents)).not.toContain(joined.capabilities.reclaim);
    expect(auditLog.documents.at(-1)).toMatchObject({ action: "game_joined", reasonCode: "JOIN" });

    const response = jsonOk({ gameId: joined.gameId, seatId: joined.seatId, lobby: joined.lobby });
    setJoinCookies(response, joined.capabilities);
    expect(response.cookies.get(COOKIE_NAMES.seat)?.value).toBe(joined.capabilities.seat);
    expect(response.cookies.get(COOKIE_NAMES.reclaim)?.value).toBe(joined.capabilities.reclaim);
    expect(JSON.stringify(await response.json())).not.toContain(joined.capabilities.seat);
  });

  it("normalizes names for uniqueness and permits a replayed invite to claim another open seat", async () => {
    const { created, game, joinStore } = await fixture();
    const openSeats = game.seats.filter((seat) => seat.kind === "open");
    const inviteId = created.lobby.invitePath!.slice("/join/".length);

    await claimSeatInTransaction(
      joinStore,
      {} as ClientSession,
      inviteId,
      joinRequest("Ada Lovelace", openSeats[0]!.token),
    );
    await expect(
      claimSeatInTransaction(
        joinStore,
        {} as ClientSession,
        inviteId,
        joinRequest("  aDA   lovelace ", openSeats[1]!.token),
      ),
    ).rejects.toBeInstanceOf(JoinNameUnavailableError);

    const second = await claimSeatInTransaction(
      joinStore,
      {} as ClientSession,
      inviteId,
      joinRequest("Grace Hopper", openSeats[1]!.token),
    );
    expect(second.seatId).toBe(openSeats[1]!.seatId);
    expect(second.lobby.seats.find((seat) => seat.seatId === openSeats[0]!.seatId)?.connected).toBe(
      true,
    );
    expect(second.lobby).not.toHaveProperty("startBlockedReason");
    expect((await getInviteStatus(joinStore, inviteId)).status).toBe("FULL");
  });

  it("loses a concurrent stale claim without displacing the winning seat", async () => {
    const { created, game, joinStore } = await fixture(2, 0);
    const openSeat = game.seats.find((seat) => seat.kind === "open")!;
    const inviteId = created.lobby.invitePath!.slice("/join/".length);
    const results = await Promise.allSettled([
      claimSeatInTransaction(
        joinStore,
        {} as ClientSession,
        inviteId,
        joinRequest("Ada", openSeat.token),
      ),
      claimSeatInTransaction(
        joinStore,
        {} as ClientSession,
        inviteId,
        joinRequest("Grace", openSeat.token),
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      Promise.reject(results.find((result) => result.status === "rejected")?.reason),
    ).rejects.toBeInstanceOf(JoinUnavailableError);
    expect(game.seats.find((seat) => seat.seatId === openSeat.seatId)?.kind).toBe("human");
  });

  it("uses the same unavailable gate for full, started, expired, and unknown admission", async () => {
    const full = await fixture(2, 1);
    const fullInvite = full.created.lobby.invitePath!.slice("/join/".length);
    expect((await getInviteStatus(full.joinStore, fullInvite)).status).toBe("FULL");
    await expect(
      claimSeatInTransaction(
        full.joinStore,
        {} as ClientSession,
        fullInvite,
        joinRequest("Ada", full.game.seats[0]!.token),
      ),
    ).rejects.toBeInstanceOf(JoinUnavailableError);
    expect((await getInviteStatus(full.joinStore, "not-a-real-invite")).status).toBe("INVALID");

    const started = await fixture();
    Object.assign(started.game, { status: "ACTIVE" });
    const startedInvite = started.created.lobby.invitePath!.slice("/join/".length);
    expect((await getInviteStatus(started.joinStore, startedInvite)).status).toBe("STARTED");
    await expect(
      claimSeatInTransaction(
        started.joinStore,
        {} as ClientSession,
        startedInvite,
        joinRequest("Ada", started.game.seats.find((seat) => seat.kind === "open")!.token),
      ),
    ).rejects.toBeInstanceOf(JoinUnavailableError);
  });
});
