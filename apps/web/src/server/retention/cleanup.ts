import "server-only";

/**
 * Application-controlled retention cleanup. The transition and the cascade
 * are separate bounded transactions: a retry can finish either phase without
 * extending retention or deleting a newly active game. See ENG-017,
 * PRD-FUN-013, SEC-005, and OPS-007.
 */
import { DomainEvent } from "@blockparty/contracts";
import type { ClientSession, Collection, Db, Filter, UpdateFilter } from "mongodb";
import { COLLECTIONS } from "../db/collections";
import type {
  AuditDocument,
  CapabilityDocument,
  GameDocument,
  HostCapabilityDocument,
  InvitationDocument,
} from "../games/create-game";
import type { CommandReceiptDocument, GameEventDocument } from "../commands/handle-command";

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CLEANUP_BATCH_SIZE = 100;

const IN_PROGRESS_STATUSES = ["LOBBY", "ACTIVE"] as const;
const RETAINED_STATUSES = ["COMPLETED", "NO_CONTEST", "EXPIRED"] as const;

export interface RetentionStore {
  readonly games: Pick<Collection<GameDocument>, "find" | "findOne" | "updateOne" | "deleteMany">;
  readonly gameEvents: Pick<Collection<GameEventDocument>, "insertOne" | "deleteMany">;
  readonly commandReceipts: Pick<Collection<CommandReceiptDocument>, "deleteMany">;
  readonly invitations: Pick<Collection<InvitationDocument>, "deleteMany">;
  readonly capabilities: Pick<Collection<CapabilityDocument>, "updateMany" | "deleteMany">;
  readonly hostCapabilities: Pick<Collection<HostCapabilityDocument>, "updateMany" | "deleteMany">;
  readonly auditLog: Pick<Collection<AuditDocument>, "deleteMany">;
}

export interface CleanupResult {
  readonly expiredGames: number;
  readonly deletedGames: number;
  readonly revokedCapabilities: number;
}

export interface RetentionOptions {
  readonly database?: RetentionStore;
  readonly transaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  readonly now?: Date;
  readonly batchSize?: number;
}

export function retentionStore(database: Pick<Db, "collection">): RetentionStore {
  return {
    games: database.collection<GameDocument>(COLLECTIONS.games),
    gameEvents: database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
    commandReceipts: database.collection<CommandReceiptDocument>(COLLECTIONS.commandReceipts),
    invitations: database.collection<InvitationDocument>(COLLECTIONS.invitations),
    capabilities: database.collection<CapabilityDocument>(COLLECTIONS.capabilities),
    hostCapabilities: database.collection<HostCapabilityDocument>(COLLECTIONS.hostCapabilities),
    auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
  };
}

function assertBatchSize(batchSize: number): void {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > CLEANUP_BATCH_SIZE) {
    throw new Error("Invalid cleanup batch size");
  }
}

async function expireGameInTransaction(
  store: RetentionStore,
  session: ClientSession,
  gameId: GameDocument["_id"],
  now: Date,
): Promise<{ transitioned: number; revokedCapabilities: number }> {
  const game = await store.games.findOne(
    { _id: gameId, status: { $in: IN_PROGRESS_STATUSES }, expiresAt: { $lte: now } },
    { session },
  );
  if (game === null) return { transitioned: 0, revokedCapabilities: 0 };

  const nextVersion = game.aggregateVersion + 1;
  const nextSequence = game.lastSequence + 1;
  const event = DomainEvent.parse({
    gameId: game._id,
    sequence: nextSequence,
    aggregateVersion: nextVersion,
    type: "GameExpired",
    eventVersion: 1,
    occurredAt: now.toISOString(),
    payload: {},
  });
  const nextSnapshot = Object.freeze({ ...game.snapshot, aggregateVersion: nextVersion });

  await store.gameEvents.insertOne(event, { session });
  const update: UpdateFilter<GameDocument> = {
    $set: {
      status: "EXPIRED",
      snapshot: nextSnapshot,
      aggregateVersion: nextVersion,
      lastSequence: nextSequence,
    },
  };
  const filter: Filter<GameDocument> = {
    _id: game._id,
    status: game.status,
    aggregateVersion: game.aggregateVersion,
    lastSequence: game.lastSequence,
    expiresAt: { $lte: now },
  };
  const updated = await store.games.updateOne(filter, update, { session });
  if (updated.matchedCount !== 1) throw new Error("EXPIRY_CONFLICT");

  const revokedSeat = await store.capabilities.updateMany(
    { gameId: game._id, status: "active" },
    { $set: { status: "revoked" } },
    { session },
  );
  const revokedHost = await store.hostCapabilities.updateMany(
    { gameId: game._id, status: "active" },
    { $set: { status: "revoked" } },
    { session },
  );
  return {
    transitioned: 1,
    revokedCapabilities: revokedSeat.modifiedCount + revokedHost.modifiedCount,
  };
}

async function deleteGamesInTransaction(
  store: RetentionStore,
  session: ClientSession,
  gameIds: readonly GameDocument["_id"][],
  now: Date,
): Promise<number> {
  if (gameIds.length === 0) return 0;
  const eligible = await store.games
    .find(
      {
        _id: { $in: gameIds },
        status: { $in: RETAINED_STATUSES },
        expiresAt: { $lte: now },
      },
      { session },
    )
    .toArray();
  const eligibleIds = eligible.map((game) => game._id);
  if (eligibleIds.length === 0) return 0;

  const filter = { gameId: { $in: eligibleIds } };
  await store.gameEvents.deleteMany(filter, { session });
  await store.commandReceipts.deleteMany(filter, { session });
  await store.invitations.deleteMany(filter, { session });
  await store.capabilities.deleteMany(filter, { session });
  await store.hostCapabilities.deleteMany(filter, { session });
  await store.auditLog.deleteMany(filter, { session });
  const deleted = await store.games.deleteMany(
    { _id: { $in: eligibleIds }, status: { $in: RETAINED_STATUSES }, expiresAt: { $lte: now } },
    { session },
  );
  return deleted.deletedCount;
}

/**
 * Transitions all due in-progress games before deleting any retained game.
 * Every query is capped, and each phase is safe to repeat after a partial
 * scheduler failure. Presence, reads, and rejected commands never touch the
 * expiry fields; only the command path advances them. See PRD-FUN-013.
 */
export async function runRetentionCleanup(options: RetentionOptions = {}): Promise<CleanupResult> {
  const store = options.database ?? retentionStore((await import("../db/client")).getDb());
  const transaction = options.transaction ?? (await import("../db/client")).withMongoTransaction;
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? CLEANUP_BATCH_SIZE;
  assertBatchSize(batchSize);

  let expiredGames = 0;
  let revokedCapabilities = 0;
  for (;;) {
    const due = await store.games
      .find({ status: { $in: IN_PROGRESS_STATUSES }, expiresAt: { $lte: now } })
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (due.length === 0) break;
    let madeProgress = false;
    for (const game of due) {
      const result = await transaction((session) =>
        expireGameInTransaction(store, session, game._id, now),
      );
      expiredGames += result.transitioned;
      revokedCapabilities += result.revokedCapabilities;
      madeProgress ||= result.transitioned > 0;
    }
    if (due.length < batchSize || !madeProgress) break;
  }

  let deletedGames = 0;
  for (;;) {
    const due = await store.games
      .find({ status: { $in: RETAINED_STATUSES }, expiresAt: { $lte: now } })
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (due.length === 0) break;
    const deleted = await transaction((session) =>
      deleteGamesInTransaction(
        store,
        session,
        due.map((game) => game._id),
        now,
      ),
    );
    deletedGames += deleted;
    if (due.length < batchSize) break;
  }

  return { expiredGames, deletedGames, revokedCapabilities };
}
