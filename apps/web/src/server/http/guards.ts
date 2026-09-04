import "server-only";

/**
 * Route admission controls. See SEC-001, SEC-003, SEC-004, and SEC-006.
 *
 * This is intentionally a process-local limiter: the initial deployment has a
 * single web replica. The key contains only one-way hashes of request identity
 * and path scope, so the limiter cannot become a secret or URL log.
 */
import { createHash } from "node:crypto";
import { COOKIE_NAMES, safeEqual } from "../auth/capabilities";
import { allowedOrigins, env } from "../env";

export interface GuardFailure {
  readonly ok: false;
  readonly code: "INVALID_PAYLOAD" | "FORBIDDEN" | "RATE_LIMITED";
  readonly reason: string;
}

export type GuardResult = { readonly ok: true } | GuardFailure;

const PASS: GuardResult = { ok: true };
const WINDOW_MS = 60_000;
export const MAX_REQUEST_BYTES = 32 * 1024;

type RateBucket = "create" | "join" | "commands" | "sync" | "sse" | "internal";

const globalForGuards = globalThis as unknown as {
  __blockpartyRateLimits?: Map<string, { startedAt: number; count: number }>;
};

function rateLimits(): Map<string, { startedAt: number; count: number }> {
  globalForGuards.__blockpartyRateLimits ??= new Map();
  return globalForGuards.__blockpartyRateLimits;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

function requestIdentity(request: Request): string {
  // The proxy must overwrite these headers. Hashing keeps the process-local
  // limiter from retaining an operational identifier in plain text.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return digest(address.slice(0, 128));
}

function requestScope(request: Request): string {
  // Never retain the complete URL: query strings may contain untrusted secret
  // canaries. A digest still gives game/invite routes isolated buckets.
  let pathname = "/";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // Request.url is validated by the runtime; use a stable fallback for tests.
  }
  return digest(pathname.slice(0, 512));
}

function configuredLimit(bucket: RateBucket): number {
  switch (bucket) {
    case "create":
      return env.RATE_LIMIT_CREATE_PER_MINUTE;
    case "join":
      return env.RATE_LIMIT_JOIN_PER_MINUTE;
    case "commands":
      return env.RATE_LIMIT_COMMANDS_PER_MINUTE;
    case "sync":
      return env.RATE_LIMIT_SYNC_PER_MINUTE;
    case "sse":
      return env.RATE_LIMIT_SSE_CONNECTIONS;
    case "internal":
      return env.RATE_LIMIT_INTERNAL_PER_MINUTE;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

function hasCapabilityCookie(request: Request): boolean {
  return (
    cookieValue(request, COOKIE_NAMES.seat) !== undefined ||
    cookieValue(request, COOKIE_NAMES.host) !== undefined ||
    cookieValue(request, COOKIE_NAMES.reclaim) !== undefined
  );
}

/** Validates the Origin header against the configured first-party allowlist. */
export function checkOrigin(request: Request): GuardResult {
  const origin = request.headers.get("origin");

  // Same-origin clients and non-browser schedulers may omit Origin. Cookie
  // mutations still require the synchronizer token below.
  if (origin === null) return PASS;
  if (!allowedOrigins.includes(origin)) {
    return { ok: false, code: "FORBIDDEN", reason: "ORIGIN_NOT_ALLOWED" };
  }
  return PASS;
}

/** CORS is opt-in and credentialed only for the configured first-party origin. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

/**
 * Double-submit CSRF check for cookie-authenticated mutations. The token is
 * readable only so same-origin browser code can mirror it into this header;
 * it is independent of all game capabilities and compared in constant time.
 */
export function checkCsrf(request: Request): GuardResult {
  const cookieToken = cookieValue(request, COOKIE_NAMES.csrf);
  const headerToken = request.headers.get("x-csrf-token");
  const needsToken = hasCapabilityCookie(request) || cookieToken !== undefined;
  if (!needsToken && cookieToken === undefined && headerToken === null) return PASS;
  if (cookieToken === undefined || headerToken === null) {
    return { ok: false, code: "FORBIDDEN", reason: "CSRF_MISMATCH" };
  }
  if (
    cookieToken.length > 256 ||
    headerToken.length > 256 ||
    !safeEqual(cookieToken, headerToken)
  ) {
    return { ok: false, code: "FORBIDDEN", reason: "CSRF_MISMATCH" };
  }
  return PASS;
}

/** Rate limits by hashed IP plus hashed route scope. */
export function checkRateLimit(request: Request, bucket: RateBucket): GuardResult {
  const key = `${bucket}:${requestIdentity(request)}:${requestScope(request)}`;
  const now = Date.now();
  const limit = configuredLimit(bucket);
  const current = rateLimits().get(key);
  if (current === undefined || now - current.startedAt >= WINDOW_MS) {
    rateLimits().set(key, { startedAt: now, count: 1 });
    return PASS;
  }
  if (current.count >= limit) {
    return { ok: false, code: "RATE_LIMITED", reason: "REQUEST_LIMIT" };
  }
  current.count += 1;
  return PASS;
}

/** Test seam for isolated adversarial matrices; production never needs it. */
export function resetRateLimits(): void {
  rateLimits().clear();
}

export function guardMutation(
  request: Request,
  bucket: "create" | "join" | "commands" | "internal",
): GuardResult {
  const origin = checkOrigin(request);
  if (!origin.ok) return origin;
  const csrf = checkCsrf(request);
  if (!csrf.ok) return csrf;
  return checkRateLimit(request, bucket);
}

/** Rejects a declared payload larger than the configured bound. */
export function checkPayloadSize(request: Request): GuardResult {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { ok: false, code: "INVALID_PAYLOAD", reason: "INVALID_CONTENT_LENGTH" };
    }
    if (length > MAX_REQUEST_BYTES) {
      return { ok: false, code: "INVALID_PAYLOAD", reason: "PAYLOAD_TOO_LARGE" };
    }
  }
  return PASS;
}

/**
 * Checks the actual body as well as Content-Length. Cloning preserves the
 * original stream for the Route Handler's subsequent JSON parse.
 */
export async function checkRequestBodySize(request: Request): Promise<GuardResult> {
  const declared = checkPayloadSize(request);
  if (!declared.ok) return declared;
  try {
    const body = await request.clone().arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) {
      return { ok: false, code: "INVALID_PAYLOAD", reason: "PAYLOAD_TOO_LARGE" };
    }
  } catch {
    return { ok: false, code: "INVALID_PAYLOAD", reason: "INVALID_BODY" };
  }
  return PASS;
}

/** POST JSON routes reject other media types before parsing. */
export function checkJsonContentType(request: Request): GuardResult {
  const contentType = request.headers.get("content-type");
  if (contentType === null || !contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, code: "INVALID_PAYLOAD", reason: "JSON_REQUIRED" };
  }
  return PASS;
}
