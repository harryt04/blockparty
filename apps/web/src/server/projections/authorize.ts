import "server-only";

/**
 * The presentation seam: internal state to an authorized projection.
 * See PROTO-004.
 *
 * A projection NEVER contains seed material, PRNG state, future deck order,
 * raw capabilities, token hashes, host or reclaim credentials, or another
 * seat's private state. Bots receive public state only. The server must never
 * serialize an internal full-state object to a client.
 *
 * Field names stay in the canonical wire layer. The UI maps them to display
 * names at the component boundary. See docs/product/glossary.md.
 */
import type { GameSnapshotProjection } from "@blockparty/contracts";
import type { GameState } from "@blockparty/game-engine";

/**
 * Builds the snapshot one seat is authorized to see.
 *
 * TODO(PROTO-004): implement field-by-field. Build the projection by
 * CONSTRUCTING an allowed shape, never by deleting fields from the state
 * object: a spread-then-delete leaks every field a later ticket adds.
 */
export function buildSeatProjection(
  _state: GameState,
  _viewerSeatId: string | undefined,
): GameSnapshotProjection {
  throw new Error("UNIMPLEMENTED: buildSeatProjection. See PROTO-004.");
}
