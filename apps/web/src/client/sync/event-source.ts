import "client-only";

/**
 * The browser SSE subscriber. See PROTO-003 and PROTO-004.
 *
 * EventSource only delivers named SSE events through addEventListener. The
 * server uses named transport events, so listening only to `onmessage` would
 * silently drop every state frame.
 */
import { ServerEnvelope } from "@blockparty/contracts";

export interface EventSourceLike {
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  close: () => void;
}

export type EventSourceFactory = (
  url: string,
  init: { readonly withCredentials: boolean },
) => EventSourceLike;

export interface GameStreamHandlers {
  readonly onEnvelope: (envelope: ServerEnvelope) => void;
  readonly onGap: () => void;
  readonly onConnectionChange: (connected: boolean) => void;
}

const NAMED_EVENTS = [
  "game.snapshot",
  "game.events",
  "game.commandAck",
  "game.error",
  "room.presence",
  "game.closed",
] as const;

function parseFrame(message: Event): ServerEnvelope | undefined {
  const data = (message as MessageEvent<string>).data;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  const envelope = ServerEnvelope.safeParse(parsed);
  return envelope.success ? envelope.data : undefined;
}

/** Opens the authenticated stream and returns a close function. */
export function openGameStream(
  gameId: string,
  handlers: GameStreamHandlers,
  createEventSource: EventSourceFactory = (url, init) => new EventSource(url, init),
): () => void {
  const source = createEventSource(`/api/games/${encodeURIComponent(gameId)}/events`, {
    withCredentials: true,
  });

  const handleMessage = (message: Event) => {
    const envelope = parseFrame(message);
    if (envelope === undefined || envelope.gameId !== gameId) {
      handlers.onGap();
      return;
    }
    handlers.onEnvelope(envelope);
  };

  source.onopen = () => handlers.onConnectionChange(true);
  source.onerror = () => handlers.onConnectionChange(false);
  for (const eventName of NAMED_EVENTS) source.addEventListener(eventName, handleMessage);

  return () => source.close();
}
