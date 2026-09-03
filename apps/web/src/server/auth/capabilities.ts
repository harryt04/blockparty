import "server-only";

/**
 * Capability material. See SEC-002.
 *
 * Four capabilities are DISTINCT and never interchangeable:
 *
 *   invite     admits a joiner; it never operates an occupied seat
 *   seat       authorizes commands for one seat in one game
 *   host       lobby and recovery controls
 *   reclaim    a replaced player's claim; it is not a command credential
 *
 * A raw token exists only in the Set-Cookie header. MongoDB stores the hash.
 * A capability never appears in a URL, in localStorage, in a log, in an
 * analytics event, or in an SSE query string.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type CapabilityKind = "seat" | "host" | "reclaim";

/**
 * Cookie names. The `__Host-` prefix requires Secure, Path=/, and no Domain,
 * so it cannot be set over plain HTTP. Development falls back to an unprefixed
 * name because localhost is not served over TLS.
 */
const usePrefix = process.env.NODE_ENV === "production";
const name = (suffix: string) => (usePrefix ? `__Host-bp_${suffix}` : `bp_${suffix}`);

export const COOKIE_NAMES: Readonly<Record<CapabilityKind | "csrf", string>> = {
  seat: name("seat"),
  host: name("host"),
  reclaim: name("reclaim"),
  csrf: name("csrf"),
};

/** Cookie attributes for every capability. Max-Age is bounded by retention. */
export const RETENTION_DAYS = 30;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: usePrefix,
  sameSite: "lax",
  path: "/",
  maxAge: RETENTION_DAYS * 24 * 60 * 60,
} as const;

/** Minimum 32 bytes of CSPRNG entropy. SEC-002. */
export function generateCapability(): string {
  return randomBytes(32).toString("base64url");
}

/** Invite IDs carry at least 128 bits of entropy and are URL-safe. SEC-002. */
export function generateInviteId(): string {
  return randomBytes(24).toString("base64url");
}

/** Stored at rest instead of the raw token. */
export function hashCapability(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Constant-time comparison, so a hash cannot be probed by timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
