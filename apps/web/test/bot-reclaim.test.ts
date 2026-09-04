import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CreateGameRequest, type Command } from "@blockparty/contracts";
import { hashCapability } from "../src/server/auth/capabilities";
import {
  createGameInTransaction,
  type AuditDocument,
  type CapabilityDocument,
  type GameDocument,
  type GameSeatRecord,
} from "../src/server/games/create-game";
import {
  handleCommand,
  type CommandPathOptions,
  type CommandReceiptDocument,
  type CommandStore,
  type GameEventDocument,
} from "../src/server/commands/handle-command";
import type { ClientSession, Filter, UpdateFilter } from "mongodb";

const request = CreateGameRequest.parse({
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
});

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

async function fixture() {
  let game: GameDocument;
  const events: GameEventDocument[] = [];
  const receipts: CommandReceiptDocument[] = [];
  const capabilities: CapabilityDocument[] = [];
  const audits: AuditDocument[] = [];
  const created = await createGameInTransaction(
    {
      games: {
        insertOne: vi.fn(async (document) => {
          game = document;
          return { acknowledged: true, insertedId: document._id } as never;
        }),
      },
      invitations: { insertOne: vi.fn(async () => ({}) as never) },
      capabilities: {
        insertOne: vi.fn(async (document) => {
          capabilities.push(document);
          return { acknowledged: true, insertedId: "capability" } as never;
        }),
      },
      hostCapabilities: { insertOne: vi.fn(async () => ({}) as never) },
      auditLog: { insertOne: vi.fn(async () => ({}) as never) },
    },
    {} as ClientSession,
    request,
    new Date("2026-09-03T15:00:00.000Z"),
  );
  const storedGame = game!;
  const returningSeat = storedGame.seats[1]!;
  const reclaimToken = "reclaim-token-for-returning-player";
  const oldSeatToken = "old-seat-token-for-returning-player";
  capabilities.push(
    {
      tokenHash: hashCapability(reclaimToken),
      gameId: storedGame._id,
      seatId: returningSeat.seatId,
      kind: "reclaim",
      status: "active",
      createdAt: storedGame.createdAt,
      expiresAt: storedGame.expiresAt,
    },
    {
      tokenHash: hashCapability(oldSeatToken),
      gameId: storedGame._id,
      seatId: returningSeat.seatId,
      kind: "seat",
      status: "active",
      createdAt: storedGame.createdAt,
      expiresAt: storedGame.expiresAt,
    },
  );
  const mutable = storedGame as Mutable<GameDocument>;
  mutable.status = "ACTIVE";
  mutable.seats = storedGame.seats.map((seat) =>
    seat.seatId === returningSeat.seatId
      ? ({ ...seat, kind: "human" as const, name: "Returning Player" } satisfies GameSeatRecord)
      : seat,
  );
  mutable.snapshot = {
    ...storedGame.snapshot,
    phase: "AwaitRoll",
    activeSeatId: storedGame.hostSeatId,
    prioritySeatId: storedGame.hostSeatId,
    seats: storedGame.snapshot.seats.map((seat) =>
      seat.seatId === returningSeat.seatId ? { ...seat, kind: "human" as const } : seat,
    ),
  };
  mutable.lobby = {
    ...storedGame.lobby,
    seats: storedGame.lobby.seats.map((seat) =>
      seat.seatId === returningSeat.seatId
        ? { ...seat, kind: "human" as const, name: "Returning Player", connected: false }
        : seat,
    ),
  };

  const commandStore: CommandStore = {
    games: {
      findOne: vi.fn(async () => storedGame),
      updateOne: vi.fn(async (filter: Filter<GameDocument>, update: UpdateFilter<GameDocument>) => {
        if (
          filter._id !== storedGame._id ||
          filter.aggregateVersion !== storedGame.aggregateVersion ||
          filter.lastSequence !== storedGame.lastSequence
        ) {
          return { acknowledged: true, matchedCount: 0 } as never;
        }
        Object.assign(storedGame, update.$set ?? {});
        return { acknowledged: true, matchedCount: 1 } as never;
      }),
    },
    gameEvents: {
      insertMany: vi.fn(async (documents) => {
        events.push(...documents);
        return { acknowledged: true, insertedCount: documents.length } as never;
      }),
    },
    commandReceipts: {
      findOne: vi.fn(async (...args: unknown[]) => {
        const filter = args[0] as { gameId: string; commandId: string };
        return (
          receipts.find(
            (receipt) => receipt.gameId === filter.gameId && receipt.commandId === filter.commandId,
          ) ?? null
        );
      }) as unknown as CommandStore["commandReceipts"]["findOne"],
      insertOne: vi.fn(async (receipt) => {
        receipts.push(receipt);
        return { acknowledged: true, insertedId: "receipt" } as never;
      }),
    },
    capabilities: {
      updateOne: vi.fn(async (filter, update) => {
        const capability = capabilities.find(
          (candidate) =>
            candidate.gameId === filter.gameId &&
            candidate.seatId === filter.seatId &&
            candidate.kind === filter.kind &&
            candidate.status === filter.status,
        );
        if (capability !== undefined) Object.assign(capability, update.$set ?? {});
        return { acknowledged: true, matchedCount: capability === undefined ? 0 : 1 } as never;
      }),
      insertOne: vi.fn(async (capability) => {
        capabilities.push(capability);
        return { acknowledged: true, insertedId: "new-capability" } as never;
      }),
    },
    auditLog: {
      insertOne: vi.fn(async (audit) => {
        audits.push(audit);
        return { acknowledged: true, insertedId: "audit" } as never;
      }),
    },
  };
  const transaction: NonNullable<CommandPathOptions["transaction"]> = async (operation) =>
    operation({} as ClientSession);
  return {
    created,
    game: storedGame,
    returningSeat,
    capabilities,
    audits,
    events,
    commandStore,
    transaction,
  };
}

function command(gameId: string, commandId: string, expectedVersion: number, payload: Command) {
  return {
    protocolVersion: 1 as const,
    type: "game.command" as const,
    requestId: `${commandId.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    gameId,
    commandId,
    expectedVersion,
    payload,
  };
}

describe("B9 bot replacement and reclaim", () => {
  it("runs request, replacement, approval, revocation, and transfer at committed boundaries", async () => {
    const fixtureState = await fixture();
    const published: string[] = [];
    const host = {
      gameId: fixtureState.game._id,
      seatId: fixtureState.game.hostSeatId,
      kind: "host" as const,
    };
    const before = fixtureState.game.snapshot.seats.find(
      (seat) => seat.seatId === fixtureState.returningSeat.seatId,
    )!;

    const replaced = await handleCommand(
      command(fixtureState.game._id, "11111111-1111-4111-8111-111111111111", 0, {
        type: "ReplaceSeatWithBot",
        seatId: fixtureState.returningSeat.seatId,
      }),
      host,
      {
        database: fixtureState.commandStore,
        transaction: fixtureState.transaction,
        publish: () => {
          published.push("replacement");
          expect(fixtureState.game.seats[1]!.kind).toBe("bot");
        },
      },
    );
    expect(replaced).toMatchObject({
      ok: true,
      aggregateVersion: 1,
      firstSequence: 2,
      lastSequence: 2,
    });
    expect(fixtureState.game.snapshot.seats[1]!.kind).toBe("bot");
    expect(fixtureState.game.snapshot.seats[1]!.balance).toBe(before.balance);
    expect(fixtureState.game.snapshot.seats[1]!.deedIds).toEqual(before.deedIds);
    expect(
      fixtureState.capabilities.find(
        (capability) =>
          capability.kind === "seat" && capability.seatId === fixtureState.returningSeat.seatId,
      )?.status,
    ).toBe("revoked");

    const requested = await handleCommand(
      command(fixtureState.game._id, "22222222-2222-4222-8222-222222222222", 1, {
        type: "RequestSeatReclaim",
      }),
      { gameId: fixtureState.game._id, seatId: fixtureState.returningSeat.seatId, kind: "reclaim" },
      {
        database: fixtureState.commandStore,
        transaction: fixtureState.transaction,
        publish: () => undefined,
      },
    );
    expect(requested).toMatchObject({ ok: true, aggregateVersion: 2 });
    expect(fixtureState.game.pendingSeatReclaimId).toBe(fixtureState.returningSeat.seatId);

    const approved = await handleCommand(
      command(fixtureState.game._id, "33333333-3333-4333-8333-333333333333", 2, {
        type: "ApproveSeatReclaim",
        seatId: fixtureState.returningSeat.seatId,
      }),
      host,
      {
        database: fixtureState.commandStore,
        transaction: fixtureState.transaction,
        publish: () => undefined,
      },
    );
    expect(approved).toMatchObject({ ok: true, aggregateVersion: 3 });
    expect(approved).toHaveProperty("seatCapability");
    expect(fixtureState.game.seats[1]!.kind).toBe("human");
    expect(fixtureState.game.seats[1]!.status).toBe("active");
    expect(fixtureState.game.pendingSeatReclaimId).toBeUndefined();
    expect(
      fixtureState.capabilities.find(
        (capability) =>
          capability.kind === "reclaim" && capability.seatId === fixtureState.returningSeat.seatId,
      )?.status,
    ).toBe("revoked");
    expect(
      fixtureState.capabilities.filter(
        (capability) =>
          capability.kind === "seat" && capability.seatId === fixtureState.returningSeat.seatId,
      ),
    ).toHaveLength(2);
    expect(fixtureState.events.map((event) => event.type)).toEqual([
      "SeatReplacedWithBot",
      "SeatReclaimRequested",
      "SeatReclaimApproved",
    ]);
    expect(fixtureState.audits.map((audit) => audit.action)).toEqual([
      "seat_replaced_with_bot",
      "seat_capability_revoked",
      "seat_reclaim_requested",
      "seat_reclaim_approved",
      "seat_reclaim_transferred",
    ]);
    expect(published).toEqual(["replacement"]);
  });

  it("rejects replacement while an effect continuation is still in progress", async () => {
    const fixtureState = await fixture();
    const mutable = fixtureState.game as Mutable<GameDocument>;
    mutable.snapshot = {
      ...fixtureState.game.snapshot,
      effectQueue: [{ sourceId: "pending", effect: { type: "MoveBy", spaces: 1 } }],
    };
    mutable.lobby = {
      ...fixtureState.game.lobby,
      seats: fixtureState.game.lobby.seats.map((seat) =>
        seat.seatId === fixtureState.returningSeat.seatId ? { ...seat, connected: false } : seat,
      ),
    };
    const result = await handleCommand(
      command(fixtureState.game._id, "44444444-4444-4444-8444-444444444444", 0, {
        type: "ReplaceSeatWithBot",
        seatId: fixtureState.returningSeat.seatId,
      }),
      { gameId: fixtureState.game._id, seatId: fixtureState.game.hostSeatId, kind: "host" },
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );
    expect(result).toEqual({
      ok: false,
      code: "PHASE_MISMATCH",
      reason: "RECOVERY_NOT_AT_SAFE_BOUNDARY",
    });
    expect(fixtureState.events).toHaveLength(0);
  });
});
