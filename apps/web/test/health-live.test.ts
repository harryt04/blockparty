import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/server/observability/telemetry", () => ({
  withRequestTelemetry: vi.fn((_name: string, _request: Request, handler: () => unknown) =>
    handler(),
  ),
}));

import { GET } from "../src/app/api/health/live/route";

describe("GET /api/health/live", () => {
  it("returns only the process liveness contract", async () => {
    const response = await GET(new Request("http://localhost/api/health/live"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });
});
