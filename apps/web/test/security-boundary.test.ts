import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { COOKIE_NAMES } from "../src/server/auth/capabilities";
import {
  checkCsrf,
  checkJsonContentType,
  checkOrigin,
  checkRateLimit,
  checkRequestBodySize,
  corsHeaders,
  MAX_REQUEST_BYTES,
  resetRateLimits,
} from "../src/server/http/guards";
import { redactLogContext, safeLog } from "../src/server/http/redaction";

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe("B11 security boundary", () => {
  it("rejects foreign origins while allowing the configured first-party origin", () => {
    expect(
      checkOrigin(
        new Request("http://localhost/api/games", { headers: { origin: "https://evil.example" } }),
      ),
    ).toEqual({
      ok: false,
      code: "FORBIDDEN",
      reason: "ORIGIN_NOT_ALLOWED",
    });
    expect(
      checkOrigin(
        new Request("http://localhost/api/games", { headers: { origin: "http://localhost:3000" } }),
      ),
    ).toEqual({ ok: true });
    expect(
      corsHeaders(
        new Request("http://localhost/api/games", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).toEqual({
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Origin": "http://localhost:3000",
      Vary: "Origin",
    });
    expect(
      corsHeaders(
        new Request("http://localhost/api/games", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toEqual({});
  });

  it("requires a matching double-submit token for capability-authenticated mutations", () => {
    const missing = new Request("http://localhost/api/games/game/commands", {
      method: "POST",
      headers: { cookie: `${COOKIE_NAMES.seat}=seat-secret` },
    });
    expect(checkCsrf(missing)).toMatchObject({ ok: false, reason: "CSRF_MISMATCH" });

    const mismatched = new Request("http://localhost/api/games/game/commands", {
      method: "POST",
      headers: {
        cookie: `${COOKIE_NAMES.seat}=seat-secret; ${COOKIE_NAMES.csrf}=csrf-cookie`,
        "x-csrf-token": "csrf-header",
      },
    });
    expect(checkCsrf(mismatched)).toMatchObject({ ok: false, reason: "CSRF_MISMATCH" });

    const valid = new Request("http://localhost/api/games/game/commands", {
      method: "POST",
      headers: {
        cookie: `${COOKIE_NAMES.seat}=seat-secret; ${COOKIE_NAMES.csrf}=csrf-cookie`,
        "x-csrf-token": "csrf-cookie",
      },
    });
    expect(checkCsrf(valid)).toEqual({ ok: true });
  });

  it("enforces a bounded body even when Content-Length is absent", async () => {
    const oversized = new Request("http://localhost/api/games", {
      method: "POST",
      body: "x".repeat(MAX_REQUEST_BYTES + 1),
    });
    expect(await checkRequestBodySize(oversized)).toEqual({
      ok: false,
      code: "INVALID_PAYLOAD",
      reason: "PAYLOAD_TOO_LARGE",
    });
    expect(checkJsonContentType(new Request("http://localhost/api/games"))).toMatchObject({
      ok: false,
      reason: "JSON_REQUIRED",
    });
  });

  it("isolates configured rate buckets by client and route and resets them by window", () => {
    vi.useFakeTimers();
    const request = () =>
      new Request("http://localhost/api/invites/example", {
        headers: { "x-forwarded-for": "198.51.100.10" },
      });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect(checkRateLimit(request(), "join")).toEqual({ ok: true });
    }
    expect(checkRateLimit(request(), "join")).toMatchObject({
      ok: false,
      code: "RATE_LIMITED",
    });
    expect(
      checkRateLimit(
        new Request("http://localhost/api/invites/example", {
          headers: { "x-forwarded-for": "198.51.100.11" },
        }),
        "join",
      ),
    ).toEqual({ ok: true });
    vi.advanceTimersByTime(60_000);
    expect(checkRateLimit(request(), "join")).toEqual({ ok: true });
  });

  it("removes capabilities, cookies, URLs, names, payloads, seeds, and private state at the logger boundary", () => {
    const canaries = {
      authorization: "Bearer capability-canary",
      cookie: "bp_seat=seat-canary",
      inviteUrl: "https://example.test/join/invite-canary",
      pseudonym: "Ada Canary",
      payload: { secretSeed: "seed-canary" },
      privateState: { deck: ["future-card-canary"] },
      route: "https://example.test/join/invite-canary",
      message: "raw exception with secret-canary",
    };
    const safe = JSON.stringify(redactLogContext(canaries));
    expect(safe).not.toContain("canary");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    safeLog("error", "command_failure", canaries);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain("canary");
    errorSpy.mockRestore();
  });
});
