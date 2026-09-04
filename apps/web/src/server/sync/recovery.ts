import "server-only";

/**
 * Durable recovery reads for /sync and the initial /events catch-up frame.
 * The journal is delivery data only: a missing or malformed range falls back
 * to the authoritative snapshot instead of inventing continuity. See
 * PROTO-002, PROTO-003, PROTO-004, and PRD-NFR-004.
 */
import {
  DomainEvent,
  EventsEnvelope,
  PROTOCOL_VERSION,
  SnapshotEnvelope,
  type AggregateVersion,
  type DomainEvent as DomainEventType,
  type EventsEnvelope as EventsEnvelopeType,
  type GameSnapshotProjection,
  type SnapshotEnvelope as SnapshotEnvelopeType,
} from "@blockparty/contracts";
import type { Collection, Db } from "mongodb";
import { publicEvent, type GameEventDocument } from "../commands/handle-command";
import { COLLECTIONS } from "../db/collections";
import type { GameDocument } from "../games/create-game";
import { buildSeatProjection, type ProjectionSeatSource } from "../projections/authorize";
import { canonicalHashBundle, getBundle } from "@blockparty/game-content";
import { isProduction } from "../env";
import { subscriberCount } from "../sse/registry";

/** The transport schema and the recovery contract both cap one range at 256. */
export const MAX_RECOVERY_EVENTS = 256;
/** The game shell needs recent history, but never an unbounded journal dump. */
export const MAX_PUBLIC_HISTORY = 100;

export type RecoveryEnvelope = EventsEnvelopeType | SnapshotEnvelopeType;

export interface RecoveryStore {
  readonly games: Pick<Collection<GameDocument>, "findOne">;
  readonly gameEvents: Pick<Collection<GameEventDocument>, "find">;
}

export function recoveryStore(database: Pick<Db, "collection">): RecoveryStore {
  return {
    games: database.collection<GameDocument>(COLLECTIONS.games),
    gameEvents: database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
  };
}

export function projectionSeats(game: GameDocument): ProjectionSeatSource[] {
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

/** Reads only redacted, ordered journal entries for the public event feed. */
export async function readPublicEvents(
  gameEvents: Pick<Collection<GameEventDocument>, "find">,
  gameId: string,
): Promise<readonly DomainEventType[]> {
  const stored = await gameEvents
    .find({ gameId })
    .sort({ sequence: -1 })
    .limit(MAX_PUBLIC_HISTORY)
    .toArray();

  return stored
    .reverse()
    .map((event) => DomainEvent.safeParse(publicEvent(event)))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
}

/** Builds the only snapshot shape that recovery may return to a seat. */
export function authorizedSnapshot(
  game: GameDocument,
  seatId: string,
  publicEvents: readonly DomainEventType[] = [],
  viewerCapabilityKind: "seat" | "reclaim" = "seat",
): GameSnapshotProjection | undefined {
  if (!game.seats.some((seat) => seat.seatId === seatId)) return undefined;
  const bundle = getBundle(game.contentVersion, { production: isProduction });
  if (bundle === undefined || canonicalHashBundle(bundle) !== game.contentHash) return undefined;

  return buildSeatProjection(game.snapshot, seatId, {
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
    sequence: game.lastSequence,
    hostSeatId: game.hostSeatId,
    seats: projectionSeats(game),
    paused: game.paused ?? false,
    publicEvents,
    viewerCapabilityKind,
    safeBoundary:
      game.snapshot.effectQueue.length === 0 && game.snapshot.pendingChoice === undefined,
    pendingSeatReclaimId: game.pendingSeatReclaimId,
    pendingHostClaimSeatId: game.pendingHostClaimSeatId,
  });
}

function snapshotEnvelope(
  game: GameDocument,
  snapshot: GameSnapshotProjection,
): SnapshotEnvelopeType {
  return SnapshotEnvelope.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: "game.snapshot",
    gameId: game._id,
    serverTime: new Date().toISOString(),
    aggregateVersion: game.aggregateVersion,
    sequence: game.lastSequence,
    snapshot,
  });
}

function contiguousPublicEvents(
  events: readonly GameEventDocument[],
  lastSequence: number,
  aggregateVersion: AggregateVersion,
): readonly DomainEventType[] | undefined {
  if (events.length === 0 || events[0]!.sequence !== lastSequence + 1) return undefined;

  const publicEvents: DomainEventType[] = [];
  let expectedSequence = lastSequence + 1;
  for (const stored of events) {
    if (stored.sequence !== expectedSequence || stored.aggregateVersion < aggregateVersion) {
      return undefined;
    }
    const parsed = DomainEvent.safeParse(publicEvent(stored));
    if (!parsed.success) return undefined;
    publicEvents.push(parsed.data);
    expectedSequence += 1;
  }
  return publicEvents;
}

/**
 * Chooses a contiguous authorized event range when the journal can prove it,
 * otherwise returns the terminal authorized snapshot. The caller must have
 * authenticated the seat before invoking this function.
 */
export async function recover(
  store: RecoveryStore,
  game: GameDocument,
  seatId: string,
  lastSequence: number,
  aggregateVersion: number,
  viewerCapabilityKind: "seat" | "reclaim" = "seat",
): Promise<RecoveryEnvelope | undefined> {
  const publicEvents = await readPublicEvents(store.gameEvents, game._id);
  const snapshot = authorizedSnapshot(game, seatId, publicEvents, viewerCapabilityKind);
  if (snapshot === undefined) return undefined;

  const needsSnapshot =
    lastSequence >= game.lastSequence ||
    lastSequence < 0 ||
    aggregateVersion < 0 ||
    aggregateVersion > game.aggregateVersion;
  if (needsSnapshot) return snapshotEnvelope(game, snapshot);

  const stored = await store.gameEvents
    .find({
      gameId: game._id,
      sequence: { $gt: lastSequence, $lte: game.lastSequence },
    })
    .sort({ sequence: 1 })
    .limit(MAX_RECOVERY_EVENTS)
    .toArray();
  const events = contiguousPublicEvents(stored, lastSequence, aggregateVersion);
  if (events === undefined) return snapshotEnvelope(game, snapshot);

  const firstSequence = events[0]!.sequence;
  const lastReturnedSequence = events.at(-1)!.sequence;
  return EventsEnvelope.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: "game.events",
    gameId: game._id,
    serverTime: new Date().toISOString(),
    aggregateVersion: events.at(-1)!.aggregateVersion,
    firstSequence,
    lastSequence: lastReturnedSequence,
    events,
  });
}
