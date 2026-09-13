import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkOrigin: vi.fn(() => ({ ok: true as const })),
  checkRateLimit: vi.fn(() => ({ ok: true as const })),
  corsHeaders: vi.fn(() => ({})),
  readGameCapability: vi.fn(),
  getDb: vi.fn(),
  ensureChangeStream: vi.fn(),
  subscribe: vi.fn(),
  canSubscribe: vi.fn(() => true),
  formatFrame: vi.fn(
    (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  ),
  recover: vi.fn(),
  recoveryStore: vi.fn(),
  installPresenceRecovery: vi.fn(),
}));

vi.mock("@/server/http/guards", () => ({
  checkOrigin: mocks.checkOrigin,
  checkRateLimit: mocks.checkRateLimit,
  corsHeaders: mocks.corsHeaders,
}));
vi.mock("@/server/auth/session", () => ({ readGameCapability: mocks.readGameCapability }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/sse/change-stream", () => ({ ensureChangeStream: mocks.ensureChangeStream }));
vi.mock("@/server/sync/recovery", () => ({
  recover: mocks.recover,
  recoveryStore: mocks.recoveryStore,
}));
vi.mock("@/server/recovery/presence-recovery", () => ({
  installPresenceRecovery: mocks.installPresenceRecovery,
}));
vi.mock("@/server/sse/registry", () => ({
  KEEP_ALIVE_FRAME: ": keep-alive\n\n",
  canSubscribe: mocks.canSubscribe,
  formatFrame: mocks.formatFrame,
  subscribe: mocks.subscribe,
  SseConnectionLimitError: class extends Error {},
}));

import { GET } from "../src/app/api/games/[gameId]/events/route";

const GAME_ID = "00000000-0000-4000-8000-000000000025";

describe("GET /api/games/[gameId]/events", () => {
  it("requires the game-seat cookie and never uses a URL capability", async () => {
    mocks.readGameCapability.mockResolvedValue(undefined);
    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/events?capability=raw-secret`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.readGameCapability).toHaveBeenCalledWith(GAME_ID);
    expect(mocks.ensureChangeStream).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("raw-secret");
  });

  it("authenticates before opening the bounded stream and emits keep-alives", async () => {
    const unsubscribe = vi.fn();
    mocks.readGameCapability.mockResolvedValue({
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

  it("sends an authorized bounded recovery envelope when reconnecting with a position", async () => {
    const unsubscribe = vi.fn();
    mocks.readGameCapability.mockResolvedValue({
      gameId: GAME_ID,
      seatId: "seat-a",
      kind: "seat",
    });
    mocks.subscribe.mockReturnValue(unsubscribe);
    mocks.getDb.mockReturnValue({
      collection: () => ({
        findOne: vi.fn().mockResolvedValue({
          _id: GAME_ID,
          status: "ACTIVE",
          expiresAt: new Date("2026-10-03T15:00:00.000Z"),
          seats: [{ seatId: "seat-a" }],
        }),
      }),
    });
    mocks.recoveryStore.mockReturnValue({});
    mocks.recover.mockResolvedValue({
      protocolVersion: 1,
      type: "game.events",
      gameId: GAME_ID,
      serverTime: "2026-09-03T15:00:00.000Z",
      aggregateVersion: 2,
      firstSequence: 3,
      lastSequence: 4,
      events: [],
    });

    const response = await GET(
      new Request(`http://localhost/api/games/${GAME_ID}/events?lastSequence=2&aggregateVersion=1`),
      { params: Promise.resolve({ gameId: GAME_ID }) },
    );
    const reader = response.body!.getReader();
    const frames: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const chunk = await reader.read();
      frames.push(new TextDecoder().decode(chunk.value));
    }
    expect(frames.join("")).toContain("event: game.events");
    expect(mocks.recover).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ seats: [{ seatId: "seat-a" }] }),
      "seat-a",
      2,
      1,
      "seat",
    );
    await reader.cancel();
  });
});
