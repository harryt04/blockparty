import "client-only";

/**
 * The browser SSE subscriber. See PROTO-003 and PROTO-004.
 *
 * The stream carries the seat cookie automatically; a capability is NEVER put
 * in the URL. The client applies an event range only when its first sequence
 * equals the local sequence + 1, and falls back to /sync on any gap, decode
 * failure, stale version, reconnect, or visibility resume.
 */
import { ServerEnvelope } from "@blockparty/contracts";

export interface GameStreamHandlers {
  readonly onEnvelope: (envelope: ServerEnvelope) => void;
  readonly onGap: () => void;
  readonly onConnectionChange: (connected: boolean) => void;
}

/**
 * Opens the stream and returns a close function.
 *
 * TODO(PROTO-003): add exponential backoff with jitter on reconnect and the
 * visibility-resume resync.
 */
export function openGameStream(
  gameId: string,
  handlers: GameStreamHandlers,
): () => void {
  const source = new EventSource(`/api/games/${encodeURIComponent(gameId)}/events`, {
    withCredentials: true,
  });

  source.onopen = () => handlers.onConnectionChange(true);
  source.onerror = () => handlers.onConnectionChange(false);

  source.onmessage = (message: MessageEvent<string>) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.data);
    } catch {
      // A decode failure is a gap: stop applying and resync.
      handlers.onGap();
      return;
    }

    // Validate the frame BEFORE applying it. An SSE frame is delivery, not
    // authority, and a malformed frame must never mutate local state.
    const envelope = ServerEnvelope.safeParse(parsed);
    if (!envelope.success) {
      handlers.onGap();
      return;
    }
    handlers.onEnvelope(envelope.data);
  };

  return () => source.close();
}
