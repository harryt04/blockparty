import "server-only";

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
  /** Writes one already-serialized SSE frame. */
  readonly send: (frame: string) => void;
  readonly close: () => void;
}

const globalForSse = globalThis as unknown as {
  __blockpartySubscribers?: Map<string, Set<Subscriber>>;
};

function registry(): Map<string, Set<Subscriber>> {
  globalForSse.__blockpartySubscribers ??= new Map();
  return globalForSse.__blockpartySubscribers;
}

export function subscribe(subscriber: Subscriber): () => void {
  const byGame = registry();
  const set = byGame.get(subscriber.gameId) ?? new Set<Subscriber>();
  set.add(subscriber);
  byGame.set(subscriber.gameId, set);

  return () => {
    set.delete(subscriber);
    if (set.size === 0) byGame.delete(subscriber.gameId);
  };
}

export function subscriberCount(gameId: string): number {
  return registry().get(gameId)?.size ?? 0;
}

/**
 * Publishes a committed event range to this process's subscribers.
 *
 * Called ONLY after the MongoDB transaction commits. A failure here is not a
 * correctness problem; clients recover through /sync. See ENG-015 step 7.
 *
 * TODO(PROTO-003): build a per-seat authorized projection instead of one
 * shared frame. A subscriber receives only what its seat may see.
 */
export function publish(gameId: string, frame: string): void {
  const subscribers = registry().get(gameId);
  if (subscribers === undefined) return;
  for (const subscriber of subscribers) {
    try {
      subscriber.send(frame);
    } catch {
      // A broken stream is dropped silently. The client resyncs.
    }
  }
}

/** Formats one SSE frame. `event` is the transport type, such as game.events. */
export function formatFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment frame. Keeps proxies from closing an idle stream. */
export const KEEP_ALIVE_FRAME = ": keep-alive\n\n";
