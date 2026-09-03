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
import { canSubscribe, KEEP_ALIVE_FRAME, subscribe } from "@/server/sse/registry";
import { ensureChangeStream } from "@/server/sse/change-stream";
import { readSeatCapability } from "@/server/auth/session";
import { checkRateLimit } from "@/server/http/guards";
import { jsonError } from "@/server/http/responses";
import { SseConnectionLimitError } from "@/server/sse/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy idle timeouts must exceed this. See ENG-004. */
const KEEP_ALIVE_MS = 15_000;

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const limit = checkRateLimit(request, "sse");
  if (!limit.ok) return jsonError(limit.code, { gameId, reason: limit.reason });

  try {
    const actor = await readSeatCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });
    if (!canSubscribe(gameId, actor.seatId)) {
      return jsonError("RATE_LIMITED", { gameId, reason: "SSE_CONNECTION_LIMIT" });
    }
    ensureChangeStream();

    const seatId = actor.seatId;

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
  } catch (error) {
    if (error instanceof SseConnectionLimitError) {
      return jsonError("RATE_LIMITED", { gameId, reason: "SSE_CONNECTION_LIMIT" });
    }
    return jsonError("SERVER_BUSY", { gameId });
  }
}
