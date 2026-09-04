import "server-only";

import {
  PROTOCOL_VERSION,
  type ClosedEnvelope,
  type GameSnapshotProjection,
  type PresenceEnvelope,
} from "@blockparty/contracts";
import { env } from "../env";
import { observeSseConnections } from "../observability/telemetry";

/**
 * Process-local SSE subscriber registry. See PROTO-003.
 *
 * This is DELIVERY, not authority. A dropped publish never loses committed
 * state: the client reconnects and calls /sync. An in-memory buffer is never
 * the only durable catch-up source.
 *
 * In production one MongoDB change stream over committed event documents feeds
 * this registry. The stream is an optimization; the database snapshot is
 * always authoritative.
 */

export interface Subscriber {
  readonly gameId: string;
  readonly seatId: string;
  /** Read authority used to preserve reclaim-only projection affordances. */
  readonly capabilityKind?: "seat" | "reclaim";
  /** Writes one already-serialized SSE frame. */
  readonly send: (frame: string) => void;
  readonly close: () => void;
  /** Testable process-local connection tenure; never serialized. */
  readonly connectedAt?: number;
}

export class SseConnectionLimitError extends Error {
  constructor() {
    super("The SSE connection limit has been reached");
    this.name = "SseConnectionLimitError";
  }
}

const globalForSse = globalThis as unknown as {
  __blockpartySubscribers?: Map<string, Set<Subscriber>>;
  __blockpartyPresence?: Map<string, Map<string, number>>;
  __blockpartyPresenceTenure?: Map<string, Map<string, number>>;
  __blockpartyPresenceDisconnectTimers?: Map<string, ReturnType<typeof setTimeout>>;
  __blockpartySeenSeats?: Map<string, Set<string>>;
  __blockpartyLastSequences?: WeakMap<Subscriber, number>;
  __blockpartyPresenceRecovery?: (event: PresenceChange) => void | Promise<void>;
};

/**
 * Route transitions can close the old page's stream just before the new page
 * opens its stream. Keep that handoff from looking like a real disconnect.
 * This is transport recovery grace, not a gameplay timeout. See PROTO-003.
 */
export const PRESENCE_DISCONNECT_GRACE_MS = 1_000;

export interface PresenceChange {
  readonly gameId: string;
  readonly seatId: string;
  readonly state: "connected" | "disconnected";
}

function registry(): Map<string, Set<Subscriber>> {
  globalForSse.__blockpartySubscribers ??= new Map();
  return globalForSse.__blockpartySubscribers;
}

function presence(): Map<string, Map<string, number>> {
  globalForSse.__blockpartyPresence ??= new Map();
  return globalForSse.__blockpartyPresence;
}

function presenceTenure(): Map<string, Map<string, number>> {
  globalForSse.__blockpartyPresenceTenure ??= new Map();
  return globalForSse.__blockpartyPresenceTenure;
}

function presenceDisconnectTimers(): Map<string, ReturnType<typeof setTimeout>> {
  globalForSse.__blockpartyPresenceDisconnectTimers ??= new Map();
  return globalForSse.__blockpartyPresenceDisconnectTimers;
}

function seenSeats(): Map<string, Set<string>> {
  globalForSse.__blockpartySeenSeats ??= new Map();
  return globalForSse.__blockpartySeenSeats;
}

function lastSequences(): WeakMap<Subscriber, number> {
  globalForSse.__blockpartyLastSequences ??= new WeakMap();
  return globalForSse.__blockpartyLastSequences;
}

/** Installs the process-local hook that reconciles presence at a safe boundary. */
export function setPresenceRecoveryHandler(
  handler: (event: PresenceChange) => void | Promise<void>,
): void {
  globalForSse.__blockpartyPresenceRecovery = handler;
}

function notifyPresenceRecovery(event: PresenceChange): void {
  const handler = globalForSse.__blockpartyPresenceRecovery;
  if (handler === undefined) return;
  void Promise.resolve(handler(event)).catch(() => undefined);
}

function presenceKey(gameId: string, seatId: string): string {
  return `${gameId}:${seatId}`;
}

function cancelPendingDisconnect(gameId: string, seatId: string): boolean {
  const key = presenceKey(gameId, seatId);
  const timer = presenceDisconnectTimers().get(key);
  if (timer === undefined) return false;
  clearTimeout(timer);
  presenceDisconnectTimers().delete(key);
  return true;
}

function scheduleDisconnect(gameId: string, seatId: string): void {
  const timers = presenceDisconnectTimers();
  const key = presenceKey(gameId, seatId);
  cancelPendingDisconnect(gameId, seatId);
  const timer = setTimeout(() => {
    timers.delete(key);
    if (subscriberCount(gameId, seatId) !== 0) return;

    const bySeat = presence().get(gameId);
    const counts = bySeat?.get(seatId);
    if (counts !== undefined) bySeat?.delete(seatId);
    presenceTenure().get(gameId)?.delete(seatId);
    sendPresence(gameId, seatId, "disconnected");
    notifyPresenceRecovery({ gameId, seatId, state: "disconnected" });

    if (bySeat?.size === 0) {
      presence().delete(gameId);
      presenceTenure().delete(gameId);
    }
  }, PRESENCE_DISCONNECT_GRACE_MS);
  timer.unref?.();
  timers.set(key, timer);
}

function sendPresence(
  gameId: string,
  seatId: string,
  state: "connected" | "disconnected" | "reconnected",
) {
  const envelope: PresenceEnvelope = {
    protocolVersion: PROTOCOL_VERSION,
    type: "room.presence",
    gameId,
    serverTime: new Date().toISOString(),
    presence: [{ seatId, state }],
  };
  const frame = formatFrame("room.presence", envelope);
  for (const subscriber of registry().get(gameId) ?? []) {
    try {
      subscriber.send(frame);
    } catch {
      subscriber.close();
    }
  }
}

export function subscribe(subscriber: Subscriber): () => void {
  const handedOff = cancelPendingDisconnect(subscriber.gameId, subscriber.seatId);
  const byGame = registry();
  const set = byGame.get(subscriber.gameId) ?? new Set<Subscriber>();
  const seatConnections = [...set].filter((candidate) => candidate.seatId === subscriber.seatId);
  if (seatConnections.length >= env.RATE_LIMIT_SSE_CONNECTIONS) {
    throw new SseConnectionLimitError();
  }
  set.add(subscriber);
  byGame.set(subscriber.gameId, set);
  observeSseConnections(subscriberCount());

  const bySeat = presence();
  const counts = bySeat.get(subscriber.gameId) ?? new Map<string, number>();
  const priorCount = counts.get(subscriber.seatId) ?? 0;
  counts.set(subscriber.seatId, priorCount + 1);
  bySeat.set(subscriber.gameId, counts);

  const tenures = presenceTenure().get(subscriber.gameId) ?? new Map<string, number>();
  if (!tenures.has(subscriber.seatId)) {
    tenures.set(subscriber.seatId, subscriber.connectedAt ?? Date.now());
  }
  presenceTenure().set(subscriber.gameId, tenures);

  const knownSeats = seenSeats();
  const known = knownSeats.get(subscriber.gameId) ?? new Set<string>();
  const presenceState = known.has(subscriber.seatId) ? "reconnected" : "connected";
  known.add(subscriber.seatId);
  knownSeats.set(subscriber.gameId, known);
  sendPresence(subscriber.gameId, subscriber.seatId, presenceState);
  if (priorCount === 0 && !handedOff) {
    notifyPresenceRecovery({
      gameId: subscriber.gameId,
      seatId: subscriber.seatId,
      state: "connected",
    });
  }

  let active = true;

  return () => {
    if (!active) return;
    active = false;
    set.delete(subscriber);
    if (set.size === 0) byGame.delete(subscriber.gameId);

    const currentCount = counts.get(subscriber.seatId) ?? 1;
    if (currentCount <= 1) {
      counts.delete(subscriber.seatId);
      scheduleDisconnect(subscriber.gameId, subscriber.seatId);
    } else {
      counts.set(subscriber.seatId, currentCount - 1);
    }
    observeSseConnections(subscriberCount());
  };
}

/** Checks the configured per-seat cap before a stream body is created. */
export function canSubscribe(gameId: string, seatId: string): boolean {
  return subscriberCount(gameId, seatId) < env.RATE_LIMIT_SSE_CONNECTIONS;
}

export function subscriberCount(gameId?: string, seatId?: string): number {
  if (gameId === undefined) {
    return [...registry().values()].reduce((total, subscribers) => total + subscribers.size, 0);
  }
  const subscribers = registry().get(gameId);
  if (seatId === undefined) return subscribers?.size ?? 0;
  return [...(subscribers ?? [])].filter((subscriber) => subscriber.seatId === seatId).length;
}

/**
 * Ends every stream with a retryable shutdown envelope before the process
 * closes its transport. Clearing the process-local maps also prevents stale
 * presence from surviving a graceful restart. See ENG-004 and OPS-005.
 */
export function closeSseConnections(reason: ClosedEnvelope["reason"]): void {
  const subscribers = [...registry().values()].flatMap((gameSubscribers) => [...gameSubscribers]);
  const serverTime = new Date().toISOString();
  for (const subscriber of subscribers) {
    const frame = formatFrame("game.closed", {
      protocolVersion: PROTOCOL_VERSION,
      type: "game.closed",
      gameId: subscriber.gameId,
      serverTime,
      reason,
    });
    try {
      subscriber.send(frame);
    } catch {
      // The stream is already gone; closing it remains best effort.
    }
    try {
      subscriber.close();
    } catch {
      // A disconnected stream must not prevent the remaining streams closing.
    }
  }
  registry().clear();
  presence().clear();
  presenceTenure().clear();
  for (const timer of presenceDisconnectTimers().values()) clearTimeout(timer);
  presenceDisconnectTimers().clear();
  observeSseConnections(0);
}

/** Seat IDs currently subscribed in this process. Presence is never durable. */
export function subscribedSeatIds(gameId: string): readonly string[] {
  return [...new Set([...(registry().get(gameId) ?? [])].map((subscriber) => subscriber.seatId))];
}

/** Returns each subscribed seat/access pair for projection rebuilding. */
export function subscribedSeatAccess(
  gameId: string,
): readonly { readonly seatId: string; readonly capabilityKind: "seat" | "reclaim" }[] {
  const seen = new Set<string>();
  return [...(registry().get(gameId) ?? [])].flatMap((subscriber) => {
    const capabilityKind = subscriber.capabilityKind ?? "seat";
    const key = `${subscriber.seatId}:${capabilityKind}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ seatId: subscriber.seatId, capabilityKind }];
  });
}

/** Connected seat tenure used by deterministic host transfer. */
export function connectedSeatTenures(
  gameId: string,
): readonly { readonly seatId: string; readonly connectedAt: number }[] {
  return [...(presenceTenure().get(gameId) ?? new Map())].map(([seatId, connectedAt]) => ({
    seatId,
    connectedAt,
  }));
}

/**
 * Sends an allowlisted snapshot only to the seat it was built for. A snapshot
 * sequence is durable, so an older or duplicate change-stream delivery is
 * ignored by the subscriber. See PROTO-003, PROTO-004, and SEC-002.
 */
export function publishSnapshot(
  gameId: string,
  seatId: string,
  snapshot: GameSnapshotProjection,
  capabilityKind: "seat" | "reclaim" = "seat",
): void {
  const subscribers = registry().get(gameId);
  if (subscribers === undefined || snapshot.viewerSeatId !== seatId) return;
  const frame = formatFrame("game.snapshot", {
    protocolVersion: PROTOCOL_VERSION,
    type: "game.snapshot",
    gameId,
    serverTime: new Date().toISOString(),
    aggregateVersion: snapshot.aggregateVersion,
    sequence: snapshot.sequence,
    snapshot,
  });
  for (const subscriber of subscribers) {
    if (subscriber.seatId !== seatId || (subscriber.capabilityKind ?? "seat") !== capabilityKind)
      continue;
    const priorSequence = lastSequences().get(subscriber) ?? -1;
    if (snapshot.sequence <= priorSequence) continue;
    lastSequences().set(subscriber, snapshot.sequence);
    try {
      subscriber.send(frame);
    } catch {
      subscriber.close();
    }
  }
}

/** Formats one SSE frame. `event` is the transport type, such as game.events. */
export function formatFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment frame. Keeps proxies from closing an idle stream. */
export const KEEP_ALIVE_FRAME = ": keep-alive\n\n";
