import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mongo = vi.hoisted(() => ({
  getDb: vi.fn(() => ({})),
  withMongoTransaction: vi.fn(),
}));
const cleanup = vi.hoisted(() => ({
  retentionStore: vi.fn(() => ({})),
  runRetentionCleanup: vi.fn(),
}));

vi.mock("@/server/db/client", () => mongo);
vi.mock("@/server/retention/cleanup", () => cleanup);
vi.mock("@/server/auth/capabilities", () => ({
  safeEqual: (left: string, right: string) => left === right,
}));
vi.mock("@/server/http/responses", () => ({
  jsonError: (code: string) => Response.json({ code }, { status: 503 }),
  jsonOk: (body: unknown) => Response.json(body),
  notFound: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/env", () => ({
  env: { INTERNAL_CLEANUP_SECRET: "cleanup-secret-for-tests" },
}));

const { POST } = await import("../src/app/api/internal/cleanup/route");

describe("POST /api/internal/cleanup", () => {
  it("does not reveal or execute the route with a missing or wrong secret", async () => {
    const missing = await POST(
      new Request("http://localhost/api/internal/cleanup", { method: "POST" }),
    );
    const wrong = await POST(
      new Request("http://localhost/api/internal/cleanup", {
        method: "POST",
        headers: { "x-internal-secret": "wrong-secret" },
      }),
    );

    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(cleanup.runRetentionCleanup).not.toHaveBeenCalled();
  });

  it("runs the bounded retention job only after authenticating the scheduler", async () => {
    cleanup.runRetentionCleanup.mockResolvedValueOnce({
      expiredGames: 1,
      deletedGames: 2,
      revokedCapabilities: 3,
    });

    const response = await POST(
      new Request("http://localhost/api/internal/cleanup", {
        method: "POST",
        headers: { "x-internal-secret": "cleanup-secret-for-tests" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      expiredGames: 1,
      deletedGames: 2,
      revokedCapabilities: 3,
    });
    expect(mongo.getDb).toHaveBeenCalledOnce();
    expect(cleanup.retentionStore).toHaveBeenCalledOnce();
    expect(cleanup.runRetentionCleanup).toHaveBeenCalledOnce();
  });
});
