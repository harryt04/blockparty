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

const SEED_BYTES = 32;
const UINT32_RANGE = 0x1_0000_0000;
const UINT32_SHIFT = 32n;
const UINT53_SHIFT = 53n;

function freezeState(words: [number, number, number, number], draws: number): PrngState {
  return Object.freeze({
    words: Object.freeze(words) as unknown as readonly [number, number, number, number],
    draws,
  });
}

function readUint32(seed: Uint8Array, offset: number): number {
  return (
    (((seed[offset] ?? 0) << 24) |
      ((seed[offset + 1] ?? 0) << 16) |
      ((seed[offset + 2] ?? 0) << 8) |
      (seed[offset + 3] ?? 0)) >>>
    0
  );
}

/** A fixed 32-bit avalanche used to expand the four seed words. */
function mix32(value: number): number {
  let mixed = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  mixed ^= mixed >>> 13;
  mixed = Math.imul(mixed, 0xc2b2ae35) >>> 0;
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function rotateLeft(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function nextWord(state: PrngState): { readonly value: number; readonly next: PrngState } {
  const [s0, s1, s2, s3] = state.words;
  const value = Math.imul(rotateLeft(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const nextS2 = (s2 ^ s0) >>> 0;
  const nextS3 = rotateLeft((s3 ^ s1) >>> 0, 11);

  return {
    value,
    next: freezeState(
      [(s0 ^ nextS3) >>> 0, (s1 ^ nextS2) >>> 0, (nextS2 ^ t) >>> 0, nextS3],
      state.draws + 1,
    ),
  };
}

/**
 * Derives the initial state from the secret 256-bit seed.
 *
 * The four big-endian seed words are independently mixed, then consumed by
 * xoshiro128**. Both steps use unsigned 32-bit operations, so the sequence is
 * identical across supported JavaScript runtimes. The algorithm is recorded in
 * `docs/engineering/game-engine.md`; changing it rewrites unexpired histories.
 */
export function deriveInitialState(seed: Uint8Array): PrngState {
  if (seed.byteLength !== SEED_BYTES) {
    throw new RangeError(`PRNG seed must be exactly ${SEED_BYTES} bytes.`);
  }

  const words = [0, 1, 2, 3].map((index) =>
    mix32(readUint32(seed, index * 4) ^ Math.imul(index + 1, 0x6d2b79f5)),
  ) as [number, number, number, number];

  // mix32 makes this unreachable for ordinary input, but xoshiro128** has no
  // all-zero orbit. Keep the full 256-bit seed domain valid regardless.
  if (words.every((word) => word === 0)) words[3] = 0x1;
  return freezeState(words, 0);
}

/** Draws one integer in [0, bound). Bound must be a positive safe integer. */
export function nextInt(state: PrngState, bound: number): PrngDraw {
  if (!Number.isSafeInteger(bound) || bound <= 0) {
    throw new RangeError("PRNG bound must be a positive safe integer.");
  }

  if (bound <= UINT32_RANGE) {
    const draw = nextWord(state);
    const value = Number((BigInt(draw.value) * BigInt(bound)) >> UINT32_SHIFT);
    return { value, next: draw.next };
  }

  // Two words provide a fixed-cost 53-bit sample for the remaining
  // safe-integer range. The top 27 and 26 bits are combined below 2^53.
  const draw = nextWord(state);
  const next = nextWord(draw.next);
  const sample = (draw.value >>> 5) * 0x4000000 + (next.value >>> 6);
  const value = Number((BigInt(sample) * BigInt(bound)) >> UINT53_SHIFT);
  return { value, next: next.next };
}
