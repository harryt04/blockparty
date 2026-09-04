import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DomainEvent, STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { canonicalHashBundle, getBundle, PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { resolve } from "@blockparty/game-engine";
import type { ClientSession } from "mongodb";
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
  verifyRestoredDataset,
  type RestoreIntegrityDatabase,
  type RestoreIntegrityError,
} from "../src/server/backup/restore-integrity";
import type {
  CommandReceiptDocument,
  GameEventDocument,
} from "../src/server/commands/handle-command";

type StoredCollections = {
  games: GameDocument[];
  events: GameEventDocument[];
  receipts: CommandReceiptDocument[];
  invitations: InvitationDocument[];
  capabilities: CapabilityDocument[];
  hostCapabilities: HostCapabilityDocument[];
  auditLog: AuditDocument[];
};

function collection<T>(documents: T[]) {
  const indexNames = new Set(["_id_"]);
  return {
    find: vi.fn(() => ({ toArray: vi.fn(async () => [...documents]) })),
    createIndexes: vi.fn(async (definitions: readonly { name?: string }[]) => {
      for (const definition of definitions) {
        if (definition.name !== undefined) indexNames.add(definition.name);
      }
      return [...indexNames];
    }),
    listIndexes: vi.fn(() => ({
      toArray: vi.fn(async () => [...indexNames].map((name) => ({ name }))),
    })),
  };
}

function database(collections: StoredCollections): RestoreIntegrityDatabase {
  const byName = new Map<string, ReturnType<typeof collection>>([
    ["games", collection(collections.games)],
    ["gameEvents", collection(collections.events)],
    ["commandReceipts", collection(collections.receipts)],
    ["invitations", collection(collections.invitations)],
    ["capabilities", collection(collections.capabilities)],
    ["hostCapabilities", collection(collections.hostCapabilities)],
    ["auditLog", collection(collections.auditLog)],
  ]);
  return { collection: (name: string) => byName.get(name)! } as unknown as RestoreIntegrityDatabase;
}

async function restoredFixture(completed = false): Promise<{
  database: RestoreIntegrityDatabase;
  data: StoredCollections;
}> {
  const data: StoredCollections = {
    games: [],
    events: [],
    receipts: [],
    invitations: [],
    capabilities: [],
    hostCapabilities: [],
    auditLog: [],
  };
  const store: CreationStore = {
    games: { insertOne: vi.fn(async (game) => void data.games.push(game)) },
    invitations: { insertOne: vi.fn(async (invitation) => void data.invitations.push(invitation)) },
    capabilities: {
      insertOne: vi.fn(async (capability) => void data.capabilities.push(capability)),
    },
    hostCapabilities: {
      insertOne: vi.fn(async (capability) => void data.hostCapabilities.push(capability)),
    },
    auditLog: { insertOne: vi.fn(async (audit) => void data.auditLog.push(audit)) },
  } as unknown as CreationStore;
  await createGameInTransaction(
    store,
    {} as ClientSession,
    {
      name: "Restore fixture",
      seatCount: 2,
      botSeatCount: 1,
      preset: "standard",
      configuration: STANDARD_CONFIGURATION,
      acknowledged13Plus: true,
    },
    new Date("2026-09-03T15:00:00.000Z"),
  );
  const game = data.games[0]!;
  const rules = {
    content: getBundle(PLACEHOLDER_BUNDLE.contentVersion)!,
    configuration: game.configuration,
  };
  const result = resolve(
    game.snapshot,
    { actorSeatId: game.hostSeatId, command: { type: "StartGame" } },
    rules,
  );
  if (!result.ok) throw new Error("Fixture failed to start");
  const occurredAt = "2026-09-03T15:01:00.000Z";
  const rulesEvent = DomainEvent.parse({
    gameId: game._id,
    sequence: 1,
    aggregateVersion: 1,
    type: "RulesConfigured",
    eventVersion: 1,
    actorSeatId: game.hostSeatId,
    occurredAt,
    payload: { configuration: game.configuration, contentHash: canonicalHashBundle(rules.content) },
  });
  const events = [
    rulesEvent,
    ...result.events.map((event, index) =>
      DomainEvent.parse({
        gameId: game._id,
        sequence: index + 2,
        aggregateVersion: 1,
        type: event.type,
        eventVersion: event.eventVersion,
        actorSeatId: event.actorSeatId,
        occurredAt,
        payload: event.payload,
      }),
    ),
  ];
  const completion = completed
    ? resolve(
        result.state,
        { actorSeatId: game.hostSeatId, command: { type: "EndNoContest" } },
        rules,
      )
    : undefined;
  if (completion !== undefined && !completion.ok) throw new Error("Fixture failed to complete");
  if (completion?.ok === true) {
    const event = completion.events[0]!;
    events.push(
      DomainEvent.parse({
        gameId: game._id,
        sequence: events.length + 1,
        aggregateVersion: 2,
        type: event.type,
        eventVersion: event.eventVersion,
        actorSeatId: event.actorSeatId,
        occurredAt,
        payload: event.payload,
      }),
    );
  }
  data.events.push(...events);
  data.receipts.push({
    gameId: game._id,
    commandId: "00000000-0000-4000-8000-000000000099",
    accepted: true,
    aggregateVersion: 1,
    firstSequence: 1,
    lastSequence: completed ? events.length - 1 : events.length,
    createdAt: new Date(occurredAt),
  });
  if (completed) {
    data.receipts.push({
      gameId: game._id,
      commandId: "00000000-0000-4000-8000-000000000100",
      accepted: true,
      aggregateVersion: 2,
      firstSequence: events.length,
      lastSequence: events.length,
      createdAt: new Date(occurredAt),
    });
  }
  data.games[0] = {
    ...game,
    status: completed ? "NO_CONTEST" : "ACTIVE",
    rulesConfigured: true,
    snapshot: Object.freeze({
      ...(completion?.ok === true ? completion.state : result.state),
      aggregateVersion: completed ? 2 : 1,
    }),
    aggregateVersion: completed ? 2 : 1,
    lastSequence: events.length,
    lastAuthoritativeActionAt: new Date(occurredAt),
    expiresAt: new Date("2026-10-03T15:01:00.000Z"),
  };
  return { database: database(data), data };
}

describe("F5 restored backup integrity", () => {
  it("verifies replay, receipts, captured versions, references, hashes, expiry, and indexes", async () => {
    const fixture = await restoredFixture();
    await expect(verifyRestoredDataset(fixture.database)).resolves.toMatchObject({
      gameCount: 1,
      eventCount: 3,
      receiptCount: 1,
      capabilityCount: 2,
      hostCapabilityCount: 1,
      replayedGameCount: 1,
      completedGameCount: 0,
    });
  });

  it("keeps a completed game readable through the authorized projection", async () => {
    const fixture = await restoredFixture(true);
    await expect(verifyRestoredDataset(fixture.database)).resolves.toMatchObject({
      completedGameCount: 1,
      readableCompletedGameCount: 1,
      replayedGameCount: 1,
    });
  });

  it("rejects corrupted snapshot data and raw capability material", async () => {
    const fixture = await restoredFixture();
    const game = fixture.data.games[0]!;
    fixture.data.games[0] = { ...game, snapshot: { ...game.snapshot, aggregateVersion: 99 } };
    fixture.data.capabilities[0] = { ...fixture.data.capabilities[0]!, token: "raw" } as never;

    await expect(verifyRestoredDataset(database(fixture.data))).rejects.toMatchObject({
      name: "RestoreIntegrityError",
      violations: expect.arrayContaining([
        "SNAPSHOT_VERSION_MISMATCH",
        "CAPABILITY_SECRET_PRESENT",
      ]),
    } satisfies Partial<RestoreIntegrityError>);
  });
});
