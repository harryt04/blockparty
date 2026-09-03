/**
 * GET /api/games/[gameId]/events - authenticated Server-Sent Events.
 * See ENG-003 and PROTO-003.
 *
 * SSE is DELIVERY, never an authorization mechanism. The request authenticates
 * the secure seat cookie before subscribing, and a capability is never accepted
 * in a query parameter. A subscriber receives only its seat's authorized
 * projection.
 *
 * A dropped stream loses nothing: the client reconnects and calls /sync.
 */
import { KEEP_ALIVE_FRAME, subscribe } from "@/server/sse/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy idle timeouts must exceed this. See ENG-004. */
const KEEP_ALIVE_MS = 15_000;

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  // TODO(PROTO-003): authenticate the seat capability before subscribing and
  // return 401 when it is absent. Also enforce the per-seat connection cap.
  //
  //   const actor = await readSeatCapability(gameId);
  //   if (actor === undefined) return new Response(null, { status: 401 });
  const seatId = "seat-1";

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (frame: string) => {
        controller.enqueue(encoder.encode(frame));
      };

      // Tell the client how long to wait before reconnecting.
      write("retry: 3000\n\n");
      write(KEEP_ALIVE_FRAME);

      unsubscribe = subscribe({
        gameId,
        seatId,
        send: write,
        close: () => controller.close(),
      });

      keepAlive = setInterval(() => {
        try {
          write(KEEP_ALIVE_FRAME);
        } catch {
          // The stream is gone; cancel() cleans up.
        }
      }, KEEP_ALIVE_MS);

      request.signal.addEventListener("abort", () => {
        if (keepAlive !== undefined) clearInterval(keepAlive);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      if (keepAlive !== undefined) clearInterval(keepAlive);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
