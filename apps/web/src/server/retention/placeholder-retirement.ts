import "server-only";

/**
 * Retires the pre-overhaul placeholder bundle without rewriting its captured
 * state. This is an operator-only, idempotent lifecycle transition; it is not
 * a player command and never calls the pure engine. See PRD-FUN-024, ENG-031,
 * and UX-047.
 */
import {
  DomainEvent,
  type DomainEvent as DomainEventType,
  type GameStatus,
} from "@blockparty/contracts";
import type { ClientSession, Collection, Db, Filter, UpdateFilter } from "mongodb";
import { ensureChangeStream } from "../sse/change-stream";
import { COLLECTIONS } from "../db/collections";
import type {
  AuditDocument,
  CapabilityDocument,
  GameDocument,
  HostCapabilityDocument,
} from "../games/create-game";
import type { GameEventDocument } from "../commands/handle-command";

export const PLACEHOLDER_CONTENT_VERSION = "0.0.0-placeholder" as const;
export const PLACEHOLDER_RETIREMENT_BATCH_SIZE = 100;
export const RETIREMENT_STATUSES = ["LOBBY", "ACTIVE"] as const satisfies readonly GameStatus[];
export type PlaceholderRetirementMode = "dry-run" | "execute";

export interface PlaceholderRetirementStore {
  readonly games: Pick<
    Collection<GameDocument>,
    "countDocuments" | "find" | "findOne" | "updateOne"
  >;
  readonly gameEvents: Pick<Collection<GameEventDocument>, "insertOne">;
  readonly capabilities: Pick<Collection<CapabilityDocument>, "updateMany">;
  readonly hostCapabilities: Pick<Collection<HostCapabilityDocument>, "updateMany">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface PlaceholderRetirementResult {
  readonly mode: PlaceholderRetirementMode;
  readonly candidateGames: number;
  readonly retiredGames: number;
}

export interface PlaceholderRetirementOptions {
  readonly mode?: PlaceholderRetirementMode;
  readonly database?: PlaceholderRetirementStore;
  readonly transaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  readonly now?: Date;
  readonly batchSize?: number;
  /** The callback runs only after the retirement transaction has committed. */
  readonly publish?: (gameId: string, events: readonly DomainEventType[]) => void | Promise<void>;
}

function assertBatchSize(batchSize: number): void {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > PLACEHOLDER_RETIREMENT_BATCH_SIZE
  ) {
    throw new Error("Invalid placeholder retirement batch size");
  }
}

function candidateFilter(): Filter<GameDocument> {
  return {
    contentVersion: PLACEHOLDER_CONTENT_VERSION,
    status: { $in: [...RETIREMENT_STATUSES] },
  };
}

export function placeholderRetirementStore(
  database: Pick<Db, "collection">,
): PlaceholderRetirementStore {
  return {
    games: database.collection<GameDocument>(COLLECTIONS.games),
    gameEvents: database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
    capabilities: database.collection<CapabilityDocument>(COLLECTIONS.capabilities),
    hostCapabilities: database.collection<HostCapabilityDocument>(COLLECTIONS.hostCapabilities),
    auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
  };
}

function retiredSnapshot(game: GameDocument, aggregateVersion: number): GameDocument["snapshot"] {
  return Object.freeze({
    ...game.snapshot,
    aggregateVersion,
    phase: "Finished" as const,
    terminalReason: "NO_CONTEST" as const,
    winnerSeatId: undefined,
    pendingTrade: undefined,
    pendingSeatReclaimId: undefined,
    pendingAuction: undefined,
    pendingAcquisitionDeedId: undefined,
    effectQueue: [],
    pendingChoice: undefined,
    obligation: undefined,
    scarceImprovementDemands: undefined,
    pendingImprovementAuction: undefined,
    resolvingCard: undefined,
    resolvingCardStack: undefined,
  });
}

async function retireGameInTransaction(
  store: PlaceholderRetirementStore,
  session: ClientSession,
  gameId: GameDocument["_id"],
  now: Date,
): Promise<{ readonly event: DomainEventType } | undefined> {
  const game = await store.games.findOne({ ...candidateFilter(), _id: gameId }, { session });
  if (game === null) return undefined;

  const aggregateVersion = game.aggregateVersion + 1;
  const event = DomainEvent.parse({
    gameId: game._id,
    sequence: game.lastSequence + 1,
    aggregateVersion,
    type: "GameEndedNoContest",
    eventVersion: 1,
    occurredAt: now.toISOString(),
    payload: {
      priorPhase: game.snapshot.phase,
      reason: "CONTENT_RETIRED",
    },
  });
  const update: UpdateFilter<GameDocument> = {
    $set: {
      status: "NO_CONTEST",
      snapshot: retiredSnapshot(game, aggregateVersion),
      aggregateVersion,
      lastSequence: game.lastSequence + 1,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
    $unset: {
      paused: "",
      pausedSeatId: "",
      pendingHostClaimSeatId: "",
      pendingSeatReclaimId: "",
    },
  };
  const filter: Filter<GameDocument> = {
    ...candidateFilter(),
    _id: game._id,
    aggregateVersion: game.aggregateVersion,
    lastSequence: game.lastSequence,
  };
  await store.gameEvents.insertOne({ ...event }, { session });
  const updated = await store.games.updateOne(filter, update, { session });
  if (updated.matchedCount !== 1) throw new Error("PLACEHOLDER_RETIREMENT_CONFLICT");

  await store.capabilities.updateMany(
    { gameId: game._id, status: "active" },
    { $set: { status: "revoked" } },
    { session },
  );
  await store.hostCapabilities.updateMany(
    { gameId: game._id, status: "active" },
    { $set: { status: "revoked" } },
    { session },
  );
  await store.auditLog.insertOne(
    {
      gameId: game._id,
      action: "game_retired",
      reasonCode: "CONTENT_RETIRED",
      occurredAt: now,
    },
    { session },
  );
  return { event };
}

/**
 * Counts candidates without mutating them, or retires them in bounded,
 * independently committed transactions. A failed transaction leaves its
 * candidate eligible for the next run, so interrupted batches resume safely.
 */
export async function runPlaceholderRetirement(
  options: PlaceholderRetirementOptions = {},
): Promise<PlaceholderRetirementResult> {
  const mode = options.mode ?? "dry-run";
  const store =
    options.database ?? placeholderRetirementStore((await import("../db/client")).getDb());
  const transaction = options.transaction ?? (await import("../db/client")).withMongoTransaction;
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? PLACEHOLDER_RETIREMENT_BATCH_SIZE;
  assertBatchSize(batchSize);

  const candidateGames = await store.games.countDocuments(candidateFilter());
  if (mode === "dry-run") return { mode, candidateGames, retiredGames: 0 };

  let retiredGames = 0;
  for (;;) {
    const candidates = await store.games
      .find(candidateFilter())
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (candidates.length === 0) break;

    let madeProgress = false;
    for (const candidate of candidates) {
      const result = await transaction((session) =>
        retireGameInTransaction(store, session, candidate._id, now),
      );
      if (result === undefined) continue;
      retiredGames += 1;
      madeProgress = true;
      const publish =
        options.publish ??
        (() => {
          // The change stream sees the committed event and rebuilds the
          // authorized projection for each subscriber after this transaction.
          ensureChangeStream();
        });
      await publish(candidate._id, [result.event]);
    }
    if (!madeProgress) throw new Error("PLACEHOLDER_RETIREMENT_STALLED");
  }

  return { mode, candidateGames, retiredGames };
}
