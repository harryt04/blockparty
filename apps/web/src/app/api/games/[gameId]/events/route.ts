/**
 * GET /api/games/[gameId]/events - authenticated Server-Sent Events.
 * See ENG-003 and PROTO-003.
 *
 * SSE is DELIVERY, never an authorization mechanism. The request authenticates
 * the secure seat/reclaim cookie before subscribing, and a capability is never accepted
 * in a query parameter. A subscriber receives only its seat's authorized
 * projection.
 *
 * A dropped stream loses nothing: the client reconnects and calls /sync.
 */
import { SyncQuery } from "@blockparty/contracts";
import { getDb } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import type { GameDocument } from "@/server/games/create-game";
import { recover, recoveryStore, type RecoveryEnvelope } from "@/server/sync/recovery";
import { canSubscribe, formatFrame, KEEP_ALIVE_FRAME, subscribe } from "@/server/sse/registry";
import { ensureChangeStream } from "@/server/sse/change-stream";
import { readGameCapability } from "@/server/auth/session";
import { checkOrigin, checkRateLimit, corsHeaders } from "@/server/http/guards";
import { jsonError } from "@/server/http/responses";
import { SseConnectionLimitError } from "@/server/sse/registry";
import { installPresenceRecovery } from "@/server/recovery/presence-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy idle timeouts must exceed this. See ENG-004. */
const KEEP_ALIVE_MS = 15_000;

export async function GET(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const origin = checkOrigin(request);
  if (!origin.ok) return jsonError(origin.code, { gameId, reason: origin.reason });
  const limit = checkRateLimit(request, "sse");
  if (!limit.ok) return jsonError(limit.code, { gameId, reason: limit.reason });

  const url = new URL(request.url);
  const hasRecoveryQuery =
    url.searchParams.has("lastSequence") || url.searchParams.has("aggregateVersion");
  let recoveryQuery:
    { readonly lastSequence: number; readonly aggregateVersion: number } | undefined;
  if (hasRecoveryQuery) {
    const lastSequence = url.searchParams.get("lastSequence");
    const aggregateVersion = url.searchParams.get("aggregateVersion");
    if (lastSequence === null || aggregateVersion === null) {
      return jsonError("INVALID_PAYLOAD", { gameId });
    }
    const parsed = SyncQuery.safeParse({
      lastSequence,
      aggregateVersion,
    });
    if (!parsed.success) return jsonError("INVALID_PAYLOAD", { gameId });
    recoveryQuery = parsed.data;
  }

  try {
    const actor = await readGameCapability(gameId);
    if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });
    if (!canSubscribe(gameId, actor.seatId)) {
      return jsonError("RATE_LIMITED", { gameId, reason: "SSE_CONNECTION_LIMIT" });
    }
    installPresenceRecovery();
    ensureChangeStream();

    let recovery: RecoveryEnvelope | undefined;
    if (recoveryQuery !== undefined) {
      const database = getDb();
      const game = await database
        .collection<GameDocument>(COLLECTIONS.games)
        .findOne({ _id: gameId });
      if (game === null) return jsonError("NOT_FOUND", { gameId });
      if (game.status === "EXPIRED" || game.expiresAt <= new Date()) {
        return jsonError("GAME_EXPIRED", { gameId });
      }
      if (!game.seats.some((seat) => seat.seatId === actor.seatId)) {
        return jsonError("FORBIDDEN", { gameId });
      }
      recovery = await recover(
        recoveryStore(database),
        game,
        actor.seatId,
        recoveryQuery.lastSequence,
        recoveryQuery.aggregateVersion,
        actor.kind === "reclaim" ? "reclaim" : "seat",
      );
      if (recovery === undefined) return jsonError("CONTENT_UNSUPPORTED", { gameId });
    }

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
          capabilityKind: actor.kind === "reclaim" ? "reclaim" : "seat",
          send: write,
          close: () => controller.close(),
        });

        // A requested range/snapshot is sent after subscription admission so
        // the connection remains live for changes that follow the recovery
        // read. The envelope is already authorized and bounded by recover().
        if (recovery !== undefined) write(formatFrame(recovery.type, recovery));

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
        ...corsHeaders(request),
      },
    });
  } catch (error) {
    if (error instanceof SseConnectionLimitError) {
      return jsonError("RATE_LIMITED", { gameId, reason: "SSE_CONNECTION_LIMIT" });
    }
    return jsonError("SERVER_BUSY", { gameId });
  }
}
