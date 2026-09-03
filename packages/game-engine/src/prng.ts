/**
 * Seeded PRNG. See ENG-022.
 *
 * The server generates a cryptographically random 256-bit seed at creation and
 * stores it as secret server data. The engine derives `PrngState` from it with
 * fixed integer operations only.
 *
 * The seed, the state, and future deck order NEVER reach a client projection,
 * an analytics event, a URL, or a log.
 *
 * Replaying events needs no PRNG. Replaying commands from the seed must
 * reproduce the same events, so this must stay deterministic and pure: no
 * `Math.random`, no clock, no host entropy.
 */

/** Opaque, serializable PRNG state carried inside the game snapshot. */
export interface PrngState {
  /** Four 32-bit words. Fixed integer operations only. */
  readonly words: readonly [number, number, number, number];
  /** Draws consumed so far. One resolution consumes a known count. */
  readonly draws: number;
}

export interface PrngDraw {
  readonly value: number;
  readonly next: PrngState;
}

/**
 * Derives the initial state from the secret 256-bit seed.
 *
 * TODO(ENG-022): implement the documented derivation and pin it with golden
 * fixtures. The algorithm choice is normative once fixtures exist, because
 * changing it re-writes the history of every unexpired game.
 */
export function deriveInitialState(_seed: Uint8Array): PrngState {
  throw new Error("UNIMPLEMENTED: PRNG derivation. See ENG-022.");
}

/** Draws one integer in [0, bound). Bound must be a positive safe integer. */
export function nextInt(_state: PrngState, _bound: number): PrngDraw {
  throw new Error("UNIMPLEMENTED: PRNG draw. See ENG-022.");
}
