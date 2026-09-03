/**
 * Claims the host capability selected by the safe-boundary presence recovery.
 * The seat cookie authenticates the selected human; the new host capability is
 * issued only as a cookie and is never returned in JSON. See PRD-FUN-014,
 * PROTO-003, and SEC-002.
 */
import { readSeatCapability } from "@/server/auth/session";
import { getDb, withMongoTransaction } from "@/server/db/client";
import { COLLECTIONS } from "@/server/db/collections";
import {
  claimTransferredHostInTransaction,
  type HostClaimStore,
} from "@/server/recovery/presence-recovery";
import type {
  AuditDocument,
  GameDocument,
  HostCapabilityDocument,
} from "@/server/games/create-game";
import { COOKIE_NAMES, COOKIE_OPTIONS } from "@/server/auth/capabilities";
import { guardMutation } from "@/server/http/guards";
import { jsonError, jsonOk } from "@/server/http/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const guard = guardMutation(request, "commands");
  if (!guard.ok) return jsonError(guard.code, { gameId, reason: guard.reason });

  const actor = await readSeatCapability(gameId);
  if (actor === undefined) return jsonError("UNAUTHENTICATED", { gameId });

  try {
    const database = getDb();
    const claimed = await withMongoTransaction((session) =>
      claimTransferredHostInTransaction(
        {
          games: database.collection<GameDocument>(COLLECTIONS.games),
          hostCapabilities: database.collection<HostCapabilityDocument>(
            COLLECTIONS.hostCapabilities,
          ),
          auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
        } satisfies HostClaimStore,
        session,
        gameId,
        actor.seatId,
      ),
    );
    const response = jsonOk({ ok: true });
    response.cookies.set(COOKIE_NAMES.host, claimed.token, COOKIE_OPTIONS);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return jsonError("FORBIDDEN", { gameId });
    }
    return jsonError("SERVER_BUSY", { gameId });
  }
}
