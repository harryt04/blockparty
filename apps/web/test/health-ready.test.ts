import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  pingDatabase: vi.fn(),
}));

vi.mock("../src/server/db/client", () => ({ pingDatabase: mocks.pingDatabase }));
vi.mock("../src/server/observability/telemetry", () => ({
  withRequestTelemetry: vi.fn((_name: string, _request: Request, handler: () => unknown) =>
    handler(),
  ),
}));

import { GET } from "../src/app/api/health/ready/route";

describe("GET /api/health/ready", () => {
  it("validates the configured classic bundle even when MongoDB is absent", async () => {
    mocks.pingDatabase.mockResolvedValue("not_configured");

    const response = await GET(new Request("http://localhost/api/health/ready"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      checks: { database: "not_configured", contentBundle: "ok" },
    });
  });
});
