import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ ok: true as const })),
  readSeatCapability: vi.fn(),
  ensureChangeStream: vi.fn(),
  subscribe: vi.fn(),
  canSubscribe: vi.fn(() => true),
}));

vi.mock("@/server/http/guards", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/server/auth/session", () => ({ readSeatCapability: mocks.readSeatCapability }));
vi.mock("@/server/sse/change-stream", () => ({ ensureChangeStream: mocks.ensureChangeStream }));
vi.mock("@/server/sse/registry", () => ({
  KEEP_ALIVE_FRAME: ": keep-alive\n\n",
  canSubscribe: mocks.canSubscribe,
  subscribe: mocks.subscribe,
  SseConnectionLimitError: class extends Error {},
}));

import { GET } from "../src/app/api/games/[gameId]/events/route";

const GAME_ID = "00000000-0000-4000-8000-000000000025";

describe("GET /api/games/[gameId]/events", () => {
  it("requires the game-seat cookie and never uses a URL capability", async () => {
    mocks.readSeatCapability.mockResolvedValue(undefined);
    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/events?capability=raw-secret`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.readSeatCapability).toHaveBeenCalledWith(GAME_ID);
    expect(mocks.ensureChangeStream).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("raw-secret");
  });

  it("authenticates before opening the bounded stream and emits keep-alives", async () => {
    const unsubscribe = vi.fn();
    mocks.readSeatCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: "seat-a",
      kind: "seat",
    });
    mocks.subscribe.mockReturnValue(unsubscribe);
    const response = await GET(new Request(`http://localhost/api/games/${GAME_ID}/events`), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(mocks.ensureChangeStream).toHaveBeenCalledOnce();
    expect(mocks.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GAME_ID, seatId: "seat-a" }),
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    const second = await reader.read();
    expect(
      `${new TextDecoder().decode(first.value)}${new TextDecoder().decode(second.value)}`,
    ).toContain(": keep-alive");
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
