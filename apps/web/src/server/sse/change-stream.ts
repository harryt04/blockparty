import "server-only";

/**
 * MongoDB change-stream fan-out for committed game events. The change stream
 * is delivery only; each event reloads the authoritative game document and
 * constructs a seat-scoped snapshot before it reaches SSE. See ENG-007,
 * PROTO-003, PROTO-004, and SEC-002.
 */
import { DomainEvent, type DomainEvent as DomainEventType } from "@blockparty/contracts";
import { canonicalHashBundle, getBundle } from "@blockparty/game-content";
import type { ChangeStream, Db } from "mongodb";
import { getDb } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import { isDatabaseConfigured, isProduction } from "../env";
import type { GameEventDocument } from "../commands/handle-command";
import type { GameDocument } from "../games/create-game";
import { buildSeatProjection, type ProjectionSeatSource } from "../projections/authorize";
import { publishSnapshot, subscriberCount, subscribedSeatIds } from "./registry";

interface ChangeDocument {
  readonly operationType?: string;
  readonly fullDocument?: Record<string, unknown>;
}

interface ChangeStreamRuntime {
  stream?: ChangeStream;
  consuming?: Promise<void>;
}

const globalForChangeStream = globalThis as unknown as {
  __blockpartyChangeStream?: ChangeStreamRuntime;
};

function runtime(): ChangeStreamRuntime {
  globalForChangeStream.__blockpartyChangeStream ??= {};
  return globalForChangeStream.__blockpartyChangeStream;
}

function eventFromChange(change: ChangeDocument): GameEventDocument | undefined {
  if (change.operationType !== "insert" || change.fullDocument === undefined) return undefined;
  const raw = change.fullDocument;
  const parsed = DomainEvent.safeParse({
    gameId: raw.gameId,
    sequence: raw.sequence,
    aggregateVersion: raw.aggregateVersion,
    type: raw.type,
    eventVersion: raw.eventVersion,
    ...(raw.actorSeatId === undefined ? {} : { actorSeatId: raw.actorSeatId }),
    occurredAt: raw.occurredAt,
    payload: raw.payload,
  });
  return parsed.success ? parsed.data : undefined;
}

function projectionSeats(game: GameDocument): ProjectionSeatSource[] {
  return game.seats.map((seat) => ({
    seatId: seat.seatId,
    kind: seat.kind,
    ...(seat.name === undefined ? {} : { name: seat.name }),
    token: seat.token,
    isHost: seat.seatId === game.hostSeatId,
    connected:
      seat.kind === "bot" ||
      subscriberCount(game._id, seat.seatId) > 0 ||
      game.lobby.seats.some((candidate) => candidate.seatId === seat.seatId && candidate.connected),
  }));
}

/**
 * Rebuilds and publishes the committed projection for one durable event.
 * Exported so protocol tests can exercise the exact change-stream boundary
 * without needing to fabricate an SSE cursor.
 */
export async function publishCommittedProjection(
  event: Pick<DomainEventType, "gameId" | "sequence" | "aggregateVersion">,
  database: Pick<Db, "collection"> = getDb(),
): Promise<void> {
  const game = await database
    .collection<GameDocument>(COLLECTIONS.games)
    .findOne({ _id: event.gameId });
  if (game === null) return;

  const bundle = getBundle(game.contentVersion, { production: isProduction });
  if (bundle === undefined || canonicalHashBundle(bundle) !== game.contentHash) return;

  for (const seatId of subscribedSeatIds(game._id)) {
    const snapshot = buildSeatProjection(game.snapshot, seatId, {
      rules: { content: bundle, configuration: game.configuration },
      status: game.status,
      versions: {
        contentVersion: game.contentVersion,
        rulesSchemaVersion: game.rulesSchemaVersion,
        variantSchemaVersion: game.variantSchemaVersion,
        stateSchemaVersion: game.stateSchemaVersion,
        engineVersion: game.engineVersion,
      },
      configuration: game.configuration,
      expiresAt: game.expiresAt,
      sequence: Math.max(game.lastSequence, event.sequence),
      hostSeatId: game.hostSeatId,
      seats: projectionSeats(game),
      paused: game.paused ?? false,
    });
    publishSnapshot(game._id, seatId, snapshot);
  }
}

async function consume(stream: ChangeStream): Promise<void> {
  try {
    for await (const change of stream) {
      const event = eventFromChange(change as ChangeDocument);
      if (event !== undefined) await publishCommittedProjection(event);
    }
  } catch {
    // A dropped cursor cannot lose state. Clients reconnect and call /sync.
  } finally {
    const state = runtime();
    if (state.stream === stream) {
      state.stream = undefined;
      state.consuming = undefined;
    }
  }
}

/** Starts one process-local stream lazily, after a client has authenticated. */
export function ensureChangeStream(database?: Pick<Db, "collection">): void {
  // The no-database scaffold remains buildable and its command tests have no
  // durable stream to consume. A configured deployment always reaches the
  // MongoDB cursor path.
  if (database === undefined && !isDatabaseConfigured) return;
  const state = runtime();
  if (state.stream !== undefined || state.consuming !== undefined) return;
  const source = database ?? getDb();
  const stream = source
    .collection<GameEventDocument>(COLLECTIONS.gameEvents)
    .watch([{ $match: { operationType: "insert" } }]);
  state.stream = stream;
  state.consuming = consume(stream);
}

/** Closes the process-local cursor during shutdown and in isolated tests. */
export async function stopChangeStream(): Promise<void> {
  const state = runtime();
  const stream = state.stream;
  state.stream = undefined;
  state.consuming = undefined;
  if (stream !== undefined) await stream.close();
}
