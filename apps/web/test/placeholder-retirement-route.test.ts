import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(() => ({})),
  withMongoTransaction: vi.fn(),
  placeholderRetirementStore: vi.fn(() => ({})),
  runPlaceholderRetirement: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  getDb: mocks.getDb,
  withMongoTransaction: mocks.withMongoTransaction,
}));
vi.mock("@/server/retention/placeholder-retirement", () => ({
  placeholderRetirementStore: mocks.placeholderRetirementStore,
  runPlaceholderRetirement: mocks.runPlaceholderRetirement,
}));
vi.mock("@/server/auth/capabilities", () => ({
  safeEqual: (left: string, right: string) => left === right,
}));
vi.mock("@/server/env", () => ({ env: { INTERNAL_CLEANUP_SECRET: "retirement-secret" } }));
vi.mock("@/server/http/guards", () => ({
  checkJsonContentType: () => ({ ok: true }),
  checkOrigin: () => ({ ok: true }),
  checkRateLimit: () => ({ ok: true }),
  checkRequestBodySize: async () => ({ ok: true }),
}));
vi.mock("@/server/http/responses", () => ({
  jsonError: (code: string) => Response.json({ code }, { status: 422 }),
  jsonOk: (body: unknown) => Response.json(body),
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/observability/telemetry", () => ({
  withRequestTelemetry: (_route: string, _request: Request, operation: () => Promise<Response>) =>
    operation(),
}));

const { POST } = await import("../src/app/api/internal/retire-placeholders/route");

function request(body: unknown, secret = "retirement-secret") {
  return new Request("http://localhost/api/internal/retire-placeholders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/internal/retire-placeholders", () => {
  it("does not reveal or execute the route with a missing or wrong secret", async () => {
    const missing = await POST(request({ mode: "dry-run" }, ""));
    const wrong = await POST(request({ mode: "execute" }, "wrong-secret"));

    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(mocks.runPlaceholderRetirement).not.toHaveBeenCalled();
  });

  it("validates the explicit mode and returns the operator result", async () => {
    const invalid = await POST(request({ mode: "run-it" }));
    expect(invalid.status).toBe(422);
    expect(mocks.runPlaceholderRetirement).not.toHaveBeenCalled();

    mocks.runPlaceholderRetirement.mockResolvedValueOnce({
      mode: "dry-run",
      candidateGames: 3,
      retiredGames: 0,
    });
    const response = await POST(request({ mode: "dry-run" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "dry-run",
      candidateGames: 3,
      retiredGames: 0,
    });
    expect(mocks.placeholderRetirementStore).toHaveBeenCalledWith({});
    expect(mocks.runPlaceholderRetirement).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dry-run",
        database: {},
        transaction: mocks.withMongoTransaction,
      }),
    );
  });
});
