import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ClientSession, Filter, UpdateFilter } from "mongodb";
import { CreateGameRequest } from "@blockparty/contracts";
import {
  createGameInTransaction,
  type AuditDocument,
  type CapabilityDocument,
  type CreationStore,
  type GameDocument,
  type HostCapabilityDocument,
  type InvitationDocument,
} from "../src/server/games/create-game";
import {
  handleCommand,
  type CommandPathOptions,
  type CommandReceiptDocument,
  type CommandStore,
  type GameEventDocument,
} from "../src/server/commands/handle-command";
import { RETENTION_MS } from "../src/server/retention/cleanup";

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

function insertion<T>() {
  const documents: T[] = [];
  return {
    documents,
    insertOne: vi.fn(async (document: T) => {
      documents.push(document);
      return { acknowledged: true, insertedId: "test" };
    }),
  };
}

async function fixture() {
  const games = insertion<GameDocument>();
  const invitations = insertion<InvitationDocument>();
  const capabilities = insertion<CapabilityDocument>();
  const hostCapabilities = insertion<HostCapabilityDocument>();
  const auditLog = insertion<AuditDocument>();
  const created = await createGameInTransaction(
    { games, invitations, capabilities, hostCapabilities, auditLog } satisfies CreationStore,
    {} as ClientSession,
    request,
    new Date("2026-09-03T15:00:00.000Z"),
  );
  const game = games.documents[0]!;
  const events: GameEventDocument[] = [];
  const receipts: CommandReceiptDocument[] = [];

  const commandStore = {
    games: {
      findOne: vi.fn(async () => game),
      updateOne: vi.fn(async (filter: Filter<GameDocument>, update: UpdateFilter<GameDocument>) => {
        const matches =
          filter._id === game._id &&
          filter.aggregateVersion === game.aggregateVersion &&
          filter.lastSequence === game.lastSequence;
        if (!matches)
          return {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedId: null,
          };
        Object.assign(game, update.$set ?? {});
        return {
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          upsertedId: null,
        };
      }),
    },
    gameEvents: {
      insertMany: vi.fn(async (documents: readonly GameEventDocument[]) => {
        events.push(...documents);
        return { acknowledged: true, insertedCount: documents.length, insertedIds: {} };
      }),
    },
    commandReceipts: {
      findOne: vi.fn(
        async (filter: { gameId: string; commandId: string }) =>
          receipts.find(
            (receipt) => receipt.gameId === filter.gameId && receipt.commandId === filter.commandId,
          ) ?? null,
      ),
      insertOne: vi.fn(async (receipt: CommandReceiptDocument) => {
        receipts.push(receipt);
        return { acknowledged: true, insertedId: "receipt" };
      }),
    },
  } as unknown as CommandStore;

  const transaction: NonNullable<CommandPathOptions["transaction"]> = async (operation) => {
    const priorGame = { ...game };
    const priorEventCount = events.length;
    const priorReceiptCount = receipts.length;
    try {
      return await operation({} as ClientSession);
    } catch (error) {
      Object.assign(game, priorGame);
      events.splice(priorEventCount);
      receipts.splice(priorReceiptCount);
      throw error;
    }
  };
  return { created, game, events, receipts, commandStore, transaction };
}

function startCommand(gameId: string, commandId: string, expectedVersion: number) {
  return {
    protocolVersion: 1 as const,
    type: "game.command" as const,
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    gameId,
    commandId,
    expectedVersion,
    payload: { type: "StartGame" as const },
  };
}

function endNoContestCommand(gameId: string, commandId: string, expectedVersion: number) {
  return {
    protocolVersion: 1 as const,
    type: "game.command" as const,
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    gameId,
    commandId,
    expectedVersion,
    payload: { type: "EndNoContest" as const },
  };
}

function configureCommand(gameId: string, commandId: string, expectedVersion: number) {
  return {
    protocolVersion: 1 as const,
    type: "game.command" as const,
    requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    gameId,
    commandId,
    expectedVersion,
    payload: {
      type: "ConfigureRules" as const,
      configuration: {
        ...request.configuration,
        preset: "custom" as const,
        restSpaceJackpot: true,
      },
    },
  };
}

describe("transactional command path", () => {
  it("extends active retention only on authoritative play and anchors completion", async () => {
    const fixtureState = await fixture();
    const actor = {
      gameId: fixtureState.game._id,
      seatId: fixtureState.game.hostSeatId,
      kind: "host" as const,
    };
    const startedAt = new Date("2026-09-03T15:00:00.000Z");
    const start = startCommand(fixtureState.game._id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 0);
    const started = await handleCommand(start, actor, {
      database: fixtureState.commandStore,
      transaction: fixtureState.transaction,
      now: () => startedAt,
    });
    expect(started.ok).toBe(true);
    expect(fixtureState.game.lastAuthoritativeActionAt).toBe(startedAt);
    expect(fixtureState.game.expiresAt).toEqual(new Date(startedAt.getTime() + RETENTION_MS));

    const duplicate = await handleCommand(start, actor, {
      database: fixtureState.commandStore,
      transaction: fixtureState.transaction,
      now: () => new Date(startedAt.getTime() + 1_000),
    });
    expect(duplicate).toEqual(started);
    expect(fixtureState.game.expiresAt).toEqual(new Date(startedAt.getTime() + RETENTION_MS));

    const completedAt = new Date("2026-09-10T15:00:00.000Z");
    const completed = await handleCommand(
      endNoContestCommand(fixtureState.game._id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 1),
      actor,
      {
        database: fixtureState.commandStore,
        transaction: fixtureState.transaction,
        now: () => completedAt,
      },
    );
    expect(completed.ok).toBe(true);
    expect(fixtureState.game.status).toBe("NO_CONTEST");
    expect(fixtureState.game.lastAuthoritativeActionAt).toBe(completedAt);
    expect(fixtureState.game.expiresAt).toEqual(new Date(completedAt.getTime() + RETENTION_MS));
  });

  it("writes contiguous events, snapshot, and receipt, then publishes only after commit", async () => {
    const fixtureState = await fixture();
    let committed = false;
    const published: GameEventDocument[][] = [];
    const command = startCommand(fixtureState.game._id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 0);

    const outcome = await handleCommand(
      command,
      {
        gameId: fixtureState.game._id,
        seatId: fixtureState.game.hostSeatId,
        kind: "host",
      },
      {
        database: fixtureState.commandStore,
        transaction: async (operation) => {
          const result = await fixtureState.transaction(operation);
          committed = true;
          return result;
        },
        publish: (_gameId, events) => {
          expect(committed).toBe(true);
          published.push(events as GameEventDocument[]);
        },
      },
    );

    expect(outcome).toEqual({
      ok: true,
      commandId: command.commandId,
      aggregateVersion: 1,
      firstSequence: 1,
      lastSequence: 2,
    });
    expect(fixtureState.game.aggregateVersion).toBe(1);
    expect(fixtureState.game.lastSequence).toBe(2);
    expect(fixtureState.events.map((event) => event.sequence)).toEqual([1, 2]);
    expect(fixtureState.events.every((event) => event.aggregateVersion === 1)).toBe(true);
    expect(fixtureState.receipts).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(published[0]![0]!.payload).not.toHaveProperty("deckOrders");
  });

  it("returns the durable ACK for a duplicate without resolving or publishing again", async () => {
    const fixtureState = await fixture();
    const command = startCommand(fixtureState.game._id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 0);
    const actor = {
      gameId: fixtureState.game._id,
      seatId: fixtureState.game.hostSeatId,
      kind: "host" as const,
    };
    const options = { database: fixtureState.commandStore, transaction: fixtureState.transaction };
    const first = await handleCommand(command, actor, options);
    const publish = vi.fn();
    const duplicate = await handleCommand(command, actor, { ...options, publish });

    expect(duplicate).toEqual(first);
    expect(fixtureState.events).toHaveLength(2);
    expect(fixtureState.receipts).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects stale commands and rolls back journal work when persistence fails", async () => {
    const fixtureState = await fixture();
    const actor = {
      gameId: fixtureState.game._id,
      seatId: fixtureState.game.hostSeatId,
      kind: "host" as const,
    };
    const first = await handleCommand(
      startCommand(fixtureState.game._id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 0),
      actor,
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );
    expect(first.ok).toBe(true);
    const stale = await handleCommand(
      startCommand(fixtureState.game._id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 0),
      actor,
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );
    expect(stale).toEqual({ ok: false, code: "STALE_VERSION", reason: "STALE_VERSION" });
    expect(fixtureState.receipts).toHaveLength(1);

    const rollbackFixture = await fixture();
    rollbackFixture.commandStore.gameEvents.insertMany = vi.fn(async () => {
      throw new Error("simulated journal failure");
    });
    const failed = await handleCommand(
      startCommand(rollbackFixture.game._id, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", 0),
      { gameId: rollbackFixture.game._id, seatId: rollbackFixture.game.hostSeatId, kind: "host" },
      { database: rollbackFixture.commandStore, transaction: rollbackFixture.transaction },
    );
    expect(failed).toEqual({
      ok: false,
      code: "SERVER_BUSY",
      reason: "COMMAND_TRANSACTION_FAILED",
    });
    expect(rollbackFixture.game.aggregateVersion).toBe(0);
    expect(rollbackFixture.game.lastSequence).toBe(0);
    expect(rollbackFixture.receipts).toHaveLength(0);
  });

  it("commits host-only lobby rules atomically and locks them after start", async () => {
    const fixtureState = await fixture();
    const host = {
      gameId: fixtureState.game._id,
      seatId: fixtureState.game.hostSeatId,
      kind: "host" as const,
    };
    const configured = await handleCommand(
      configureCommand(fixtureState.game._id, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", 0),
      host,
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );

    expect(configured).toMatchObject({
      ok: true,
      aggregateVersion: 1,
      firstSequence: 1,
      lastSequence: 1,
    });
    expect(fixtureState.game.configuration.restSpaceJackpot).toBe(true);
    expect(fixtureState.events[0]?.type).toBe("RulesConfigured");

    const started = await handleCommand(
      startCommand(fixtureState.game._id, "ffffffff-ffff-4fff-8fff-ffffffffffff", 1),
      host,
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );
    expect(started.ok).toBe(true);

    const locked = await handleCommand(
      configureCommand(fixtureState.game._id, "11111111-1111-4111-8111-111111111111", 2),
      host,
      { database: fixtureState.commandStore, transaction: fixtureState.transaction },
    );
    expect(locked).toEqual({
      ok: false,
      code: "PHASE_MISMATCH",
      reason: "RULES_LOCKED_AFTER_START",
    });
  });
});
