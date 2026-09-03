import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CreateGameRequest, type DomainEvent } from "@blockparty/contracts";
import { createGameInTransaction, type GameDocument } from "../src/server/games/create-game";
import {
  claimTransferredHostInTransaction,
  reconcilePresenceInTransaction,
  type ConnectedSeatTenure,
  type RecoveryStore,
} from "../src/server/recovery/presence-recovery";
import {
  connectedSeatTenures,
  setPresenceRecoveryHandler,
  subscribe,
} from "../src/server/sse/registry";
import type { ClientSession, Filter, UpdateFilter } from "mongodb";

const request = CreateGameRequest.parse({
  seatCount: 3,
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

function makeFixture() {
  const documents: GameDocument[] = [];
  const events: DomainEvent[] = [];
  const audits: unknown[] = [];
  const revoked: unknown[] = [];
  const insertedHosts: unknown[] = [];
  const store: RecoveryStore = {
    games: {
      findOne: vi.fn(async () => documents[0] ?? null),
      updateOne: vi.fn(
        async (_filter: Filter<GameDocument>, update: UpdateFilter<GameDocument>) => {
          Object.assign(documents[0]!, update.$set ?? {});
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as never;
        },
      ),
    },
    gameEvents: {
      insertMany: vi.fn(async (items: readonly DomainEvent[]) => {
        events.push(...items);
        return { acknowledged: true, insertedCount: items.length, insertedIds: {} } as never;
      }),
    },
    hostCapabilities: {
      updateOne: vi.fn(async (_filter, update) => {
        revoked.push(update);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 } as never;
      }),
      insertOne: vi.fn(async (host) => {
        insertedHosts.push(host);
        return { acknowledged: true, insertedId: "host" } as never;
      }),
    },
    auditLog: {
      insertOne: vi.fn(async (audit) => {
        audits.push(audit);
        return { acknowledged: true, insertedId: "audit" } as never;
      }),
    },
  };

  return createGameInTransaction(
    {
      games: {
        insertOne: vi.fn(async (game) => {
          documents.push(game);
          return { acknowledged: true, insertedId: game._id } as never;
        }),
      },
      invitations: { insertOne: vi.fn(async () => ({}) as never) },
      capabilities: { insertOne: vi.fn(async () => ({}) as never) },
      hostCapabilities: { insertOne: vi.fn(async () => ({}) as never) },
      auditLog: { insertOne: vi.fn(async () => ({}) as never) },
    },
    {} as ClientSession,
    request,
    new Date("2026-09-03T15:00:00.000Z"),
  ).then(() => ({
    game: documents[0]!,
    events,
    audits,
    revoked,
    insertedHosts,
    store,
  }));
}

function promoteToActive(game: GameDocument): void {
  const mutable = game as Mutable<GameDocument>;
  const humanSeats = game.seats.map((seat) =>
    seat.kind === "bot" || seat.kind === "open"
      ? { ...seat, kind: "human" as const, name: "Player" }
      : seat,
  );
  mutable.seats = humanSeats;
  mutable.status = "ACTIVE";
  mutable.snapshot = {
    ...game.snapshot,
    phase: "AwaitRoll",
    activeSeatId: game.hostSeatId,
    prioritySeatId: game.hostSeatId,
    obligation: {
      debtorSeatId: game.hostSeatId,
      amount: 1,
      reasonCode: "TEST",
      continuation: [],
    },
    seats: game.snapshot.seats.map((seat) =>
      seat.kind === "bot" || seat.kind === "open" ? { ...seat, kind: "human" as const } : seat,
    ),
  };
  mutable.lobby = {
    ...game.lobby,
    seats: game.lobby.seats.map((seat) =>
      seat.kind === "bot" || seat.kind === "open" ? { ...seat, kind: "human" as const } : seat,
    ),
  };
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function run(
  fixture: Awaited<ReturnType<typeof makeFixture>>,
  tenures: readonly ConnectedSeatTenure[],
) {
  return reconcilePresenceInTransaction(
    fixture.store,
    {} as ClientSession,
    fixture.game._id,
    tenures,
    new Date("2026-09-03T16:00:00.000Z"),
  );
}

describe("B8 presence recovery", () => {
  it("tracks one tenure per seat across tabs and emits recovery edges", () => {
    const gameId = "presence-test-game";
    const changes: string[] = [];
    setPresenceRecoveryHandler((change) => {
      changes.push(`${change.state}:${change.seatId}`);
    });
    const first = subscribe({
      gameId,
      seatId: "seat-a",
      connectedAt: 100,
      send: () => undefined,
      close: () => undefined,
    });
    const second = subscribe({
      gameId,
      seatId: "seat-a",
      connectedAt: 200,
      send: () => undefined,
      close: () => undefined,
    });

    expect(connectedSeatTenures(gameId)).toEqual([{ seatId: "seat-a", connectedAt: 100 }]);
    first();
    expect(changes).toEqual(["connected:seat-a"]);
    second();
    expect(changes).toEqual(["connected:seat-a", "disconnected:seat-a"]);
    setPresenceRecoveryHandler(() => undefined);
  });

  it.each(["TurnStart", "AwaitRoll", "AwaitAuction", "AwaitDebt", "AwaitChoice"])(
    "pauses %s without fabricating a gameplay action",
    async (phase) => {
      const fixture = await makeFixture();
      promoteToActive(fixture.game);
      (fixture.game as Mutable<GameDocument>).snapshot = {
        ...fixture.game.snapshot,
        phase: phase as never,
      };

      const result = await run(fixture, []);

      expect(result.events.map((event) => event.type)).toEqual(["PlayPaused"]);
      expect(fixture.game.paused).toBe(true);
      expect(fixture.game.pausedSeatId).toBe(fixture.game.hostSeatId);
      expect(fixture.events.map((event) => event.type)).toEqual(["PlayPaused"]);
      expect(fixture.game.lastAuthoritativeActionAt.toISOString()).toBe("2026-09-03T15:00:00.000Z");
    },
  );

  it("transfers host at the safe boundary to the longest-tenured connected human", async () => {
    const fixture = await makeFixture();
    promoteToActive(fixture.game);
    const [host, second, third] = fixture.game.seats;

    const result = await run(fixture, [
      { seatId: second!.seatId, connectedAt: 200 },
      { seatId: third!.seatId, connectedAt: 100 },
    ]);

    expect(result.events.map((event) => event.type)).toEqual(["PlayPaused", "HostTransferred"]);
    expect(fixture.game.hostSeatId).toBe(third!.seatId);
    expect(fixture.game.pendingHostClaimSeatId).toBe(third!.seatId);
    expect(fixture.revoked).toEqual([{ $set: { status: "revoked" } }]);
    expect(host!.seatId).not.toBe(fixture.game.hostSeatId);
    expect(fixture.audits).toHaveLength(2);
  });

  it("uses seat order as the deterministic tie-break and resumes on reconnect", async () => {
    const fixture = await makeFixture();
    promoteToActive(fixture.game);
    const host = fixture.game.hostSeatId;
    const candidates = fixture.game.seats.filter((seat) => seat.seatId !== host);
    await run(fixture, [
      { seatId: candidates[0]!.seatId, connectedAt: 100 },
      { seatId: candidates[1]!.seatId, connectedAt: 100 },
    ]);
    expect(fixture.game.hostSeatId).toBe(candidates[0]!.seatId);

    const resumed = await run(fixture, [
      { seatId: host, connectedAt: 50 },
      { seatId: candidates[0]!.seatId, connectedAt: 100 },
      { seatId: candidates[1]!.seatId, connectedAt: 100 },
    ]);
    expect(resumed.events.map((event) => event.type)).toEqual(["PlayResumed"]);
    expect(fixture.game.paused).toBe(false);
  });

  it("does not pause a connected required actor when only the host disconnects", async () => {
    const fixture = await makeFixture();
    promoteToActive(fixture.game);
    const requiredSeat = fixture.game.seats[1]!.seatId;
    (fixture.game as Mutable<GameDocument>).snapshot = {
      ...fixture.game.snapshot,
      activeSeatId: requiredSeat,
    };

    const result = await run(fixture, [{ seatId: requiredSeat, connectedAt: 10 }]);

    expect(result.events.map((event) => event.type)).toEqual(["HostTransferred"]);
    expect(fixture.game.paused).toBe(false);
    expect(fixture.game.hostSeatId).toBe(requiredSeat);
  });

  it("keeps play paused when no connected human can take over", async () => {
    const fixture = await makeFixture();
    promoteToActive(fixture.game);

    const result = await run(fixture, []);

    expect(result.transferredHostSeatId).toBeUndefined();
    expect(fixture.game.paused).toBe(true);
    expect(fixture.game.hostSeatId).toBe(fixture.game.seats[0]!.seatId);
    expect(fixture.revoked).toHaveLength(0);
  });

  it("issues the separate host capability only after the selected seat claims it", async () => {
    const fixture = await makeFixture();
    promoteToActive(fixture.game);
    const target = fixture.game.seats[1]!.seatId;
    await run(fixture, [{ seatId: target, connectedAt: 10 }]);

    const claimed = await claimTransferredHostInTransaction(
      fixture.store,
      {} as ClientSession,
      fixture.game._id,
      target,
      new Date("2026-09-03T16:01:00.000Z"),
    );

    expect(claimed.token).toHaveLength(43);
    expect(fixture.insertedHosts[0]).toMatchObject({ seatId: target, status: "active" });
    expect(JSON.stringify(fixture.insertedHosts[0])).not.toContain(claimed.token);
    expect(fixture.game.pendingHostClaimSeatId).toBeUndefined();
    expect(fixture.audits.at(-1)).toMatchObject({
      action: "host_transfer_claimed",
      reasonCode: "HOST_TRANSFER_CLAIMED",
    });
  });
});
