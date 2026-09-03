import "server-only";

/**
 * Request authentication. See SEC-002.
 *
 * The actor and the capability kind come from the SERVER credential. A
 * client-provided seat, game, phase, expected-version, or host flag is
 * untrusted input and never becomes authority.
 *
 * Capability hashes are resolved against the active, unexpired authority
 * documents before an actor is returned to a route.
 */
import { cookies } from "next/headers";
import { COOKIE_NAMES, hashCapability, safeEqual, type CapabilityKind } from "./capabilities";
import { getDb } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import type {
  CapabilityDocument,
  GameDocument,
  HostCapabilityDocument,
} from "../games/create-game";

export interface AuthenticatedSeat {
  readonly gameId: string;
  readonly seatId: string;
  readonly kind: CapabilityKind;
}

/**
 * Reads a capability cookie and returns its hash for lookup.
 * Returns undefined when the cookie is absent. The raw value never leaves
 * this module.
 */
async function readCapabilityHash(kind: CapabilityKind): Promise<string | undefined> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAMES[kind])?.value;
  if (raw === undefined || raw.length === 0) return undefined;
  return hashCapability(raw);
}

/**
 * Resolves the seat capability to one current seat.
 *
 * Invalid, expired, or out-of-scope capabilities all return the same absence.
 */
export async function readSeatCapability(gameId: string): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("seat");
  if (hash === undefined) return undefined;
  const database = getDb();
  const capability = await database
    .collection<CapabilityDocument>(COLLECTIONS.capabilities)
    .findOne({
      tokenHash: hash,
      gameId,
      kind: "seat",
      status: "active",
      expiresAt: { $gt: new Date() },
    });
  if (capability === null || !safeEqual(capability.tokenHash, hash)) return undefined;
  const game = await database.collection<GameDocument>(COLLECTIONS.games).findOne({ _id: gameId });
  if (game === null || game.status === "EXPIRED" || game.expiresAt <= new Date()) return undefined;
  return { gameId, seatId: capability.seatId, kind: "seat" };
}

/**
 * Resolves the separate host capability. Host authority is never inferred from
 * a seat capability and never accepted from the client. SEC-002.
 *
 * Host authority is looked up independently from seat command authority.
 */
export async function readHostCapability(gameId: string): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("host");
  if (hash === undefined) return undefined;
  const database = getDb();
  const capability = await database
    .collection<HostCapabilityDocument>(COLLECTIONS.hostCapabilities)
    .findOne({ tokenHash: hash, gameId, status: "active", expiresAt: { $gt: new Date() } });
  if (capability === null || !safeEqual(capability.tokenHash, hash)) return undefined;
  const game = await database.collection<GameDocument>(COLLECTIONS.games).findOne({ _id: gameId });
  if (game === null || game.status === "EXPIRED" || game.expiresAt <= new Date()) return undefined;
  return { gameId, seatId: capability.seatId, kind: "host" };
}

/**
 * Resolves the reclaim claim. A reclaim claim is NOT a command credential: it
 * only lets a replaced player request control. The host approves, and a new
 * seat capability is issued at the next safe command boundary. PRD-FUN-012.
 *
 * Reclaim claims are resolved independently and are not accepted as commands.
 */
export async function readReclaimClaim(gameId: string): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("reclaim");
  if (hash === undefined) return undefined;
  const database = getDb();
  const capability = await database
    .collection<CapabilityDocument>(COLLECTIONS.capabilities)
    .findOne({
      tokenHash: hash,
      gameId,
      kind: "reclaim",
      status: "active",
      expiresAt: { $gt: new Date() },
    });
  if (capability === null || !safeEqual(capability.tokenHash, hash)) return undefined;
  return { gameId, seatId: capability.seatId, kind: "reclaim" };
}
