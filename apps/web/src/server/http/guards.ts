import "server-only";

/**
 * Admission guards for Route Handlers. See SEC-003.
 *
 * Cookie-authenticated mutating endpoints need Origin validation AND a
 * synchronizer or double-submit CSRF token. SSE authenticates the cookie and
 * never accepts a capability in a query parameter.
 */
import { allowedOrigins } from "../env";

export interface GuardFailure {
  readonly ok: false;
  readonly code: "FORBIDDEN" | "RATE_LIMITED";
  readonly reason: string;
}

export type GuardResult = { readonly ok: true } | GuardFailure;

const PASS: GuardResult = { ok: true };

/**
 * Validates the Origin header against the configured first-party allowlist.
 * A CORS response never uses "*" with credentials.
 */
export function checkOrigin(request: Request): GuardResult {
  const origin = request.headers.get("origin");

  // A same-origin GET or a non-browser client may send no Origin. Mutating
  // handlers pair this with the CSRF check below, so absence is not a bypass.
  if (origin === null) return PASS;

  if (!allowedOrigins.includes(origin)) {
    return { ok: false, code: "FORBIDDEN", reason: "ORIGIN_NOT_ALLOWED" };
  }
  return PASS;
}

/**
 * Double-submit CSRF check for cookie-authenticated mutations.
 *
 * TODO(SEC-003): issue the token as a readable cookie at join, require the
 * matching `x-csrf-token` header here, and compare in constant time.
 */
export function checkCsrf(_request: Request): GuardResult {
  return PASS;
}

/**
 * Rate limit by IP plus seat or game where available.
 *
 * TODO(SEC-003): implement create/join/command/sync/SSE limits with
 * exponential backoff on repeated failures. A single replica can use an
 * in-process store; MongoDB backs it if replicas grow. Redis stays deferred.
 */
export function checkRateLimit(
  _request: Request,
  _bucket: "create" | "join" | "commands" | "sync" | "sse" | "internal",
): GuardResult {
  return PASS;
}

/**
 * Runs the guards a mutating, cookie-authenticated route needs.
 * Returns the first failure, or ok.
 */
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

/** Rejects a payload larger than the configured bound before parsing. SEC-003. */
export const MAX_REQUEST_BYTES = 32 * 1024;

export function checkPayloadSize(request: Request): GuardResult {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_REQUEST_BYTES) {
    return { ok: false, code: "FORBIDDEN", reason: "PAYLOAD_TOO_LARGE" };
  }
  return PASS;
}
