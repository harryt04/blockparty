import type { ContentBundle } from "./types";

/**
 * The hash is deliberately excluded from the input so a bundle can carry its
 * own recorded digest. Object keys are sorted recursively; array order is
 * content and is therefore retained. CONTENT-001.
 */
export function canonicalSerializeBundle(bundle: ContentBundle): string {
  const { hash: _hash, ...withoutHash } = bundle;
  return JSON.stringify(sortObjectKeys(withoutHash));
}

/** Return the lowercase SHA-256 digest of a bundle's canonical bytes. */
export function canonicalHashBundle(bundle: ContentBundle): string {
  return sha256(encodeUtf8(canonicalSerializeBundle(bundle)));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (typeof value !== "object" || value === null) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) continue;
    if (codePoint > 0xffff) index += 1;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

const ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const add = (...values: number[]): number =>
  values.reduce((total, value) => (total + value) >>> 0, 0);

const rotateRight = (value: number, amount: number): number =>
  ((value >>> amount) | (value << (32 - amount))) >>> 0;

function sha256(input: Uint8Array): string {
  const bitLength = input.length * 8;
  const paddedLength = ((input.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const lengthOffset = padded.length - 8;
  for (let byte = 0; byte < 8; byte += 1) {
    padded[lengthOffset + byte] = Math.floor(bitLength / 2 ** (56 - byte * 8)) & 0xff;
  }

  const hash: number[] = [...INITIAL_HASH];
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      schedule[index] =
        (padded[position]! << 24) |
        (padded[position + 1]! << 16) |
        (padded[position + 2]! << 8) |
        padded[position + 3]!;
    }
    for (let index = 16; index < 64; index += 1) {
      const older = schedule[index - 15]!;
      const oldest = schedule[index - 2]!;
      const sigma0 = rotateRight(older, 7) ^ rotateRight(older, 18) ^ (older >>> 3);
      const sigma1 = rotateRight(oldest, 17) ^ rotateRight(oldest, 19) ^ (oldest >>> 10);
      schedule[index] = add(schedule[index - 16]!, sigma0, schedule[index - 7]!, sigma1);
    }

    let [a, b, c, d, e, f, g, h] = hash as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = add(h, sigma1, choice, ROUND_CONSTANTS[index]!, schedule[index]!);
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = add(sigma0, majority);
      h = g;
      g = f;
      f = e;
      e = add(d, temporary1);
      d = c;
      c = b;
      b = a;
      a = add(temporary1, temporary2);
    }
    hash[0] = add(hash[0]!, a);
    hash[1] = add(hash[1]!, b);
    hash[2] = add(hash[2]!, c);
    hash[3] = add(hash[3]!, d);
    hash[4] = add(hash[4]!, e);
    hash[5] = add(hash[5]!, f);
    hash[6] = add(hash[6]!, g);
    hash[7] = add(hash[7]!, h);
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}
