import "server-only";

/**
 * Request authentication. See SEC-002.
 *
 * The actor and the capability kind come from the SERVER credential. A
 * client-provided seat, game, phase, expected-version, or host flag is
 * untrusted input and never becomes authority.
 *
 * SCAFFOLD: these read the cookie and stop. Verification against the
 * `capabilities` and `hostCapabilities` collections is the auth ticket.
 */
import { cookies } from "next/headers";
import { COOKIE_NAMES, hashCapability, type CapabilityKind } from "./capabilities";

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
 * TODO(SEC-002): look the hash up in `capabilities`, confirm it is active and
 * unexpired, confirm it belongs to `gameId`, check game status, and return the
 * seat. Compare in constant time and return a generic failure either way.
 */
export async function readSeatCapability(
  _gameId: string,
): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("seat");
  if (hash === undefined) return undefined;
  return undefined;
}

/**
 * Resolves the separate host capability. Host authority is never inferred from
 * a seat capability and never accepted from the client. SEC-002.
 *
 * TODO(SEC-002): look the hash up in `hostCapabilities`.
 */
export async function readHostCapability(
  _gameId: string,
): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("host");
  if (hash === undefined) return undefined;
  return undefined;
}

/**
 * Resolves the reclaim claim. A reclaim claim is NOT a command credential: it
 * only lets a replaced player request control. The host approves, and a new
 * seat capability is issued at the next safe command boundary. PRD-FUN-012.
 *
 * TODO(SEC-002): look the hash up in `capabilities` with kind "reclaim".
 */
export async function readReclaimClaim(
  _gameId: string,
): Promise<AuthenticatedSeat | undefined> {
  const hash = await readCapabilityHash("reclaim");
  if (hash === undefined) return undefined;
  return undefined;
}
