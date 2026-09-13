import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  readHostCapability: vi.fn(),
  readReclaimClaim: vi.fn(),
  readSeatCapability: vi.fn(),
  handleCommand: vi.fn(),
  scheduleBotTurns: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  readHostCapability: mocks.readHostCapability,
  readReclaimClaim: mocks.readReclaimClaim,
  readSeatCapability: mocks.readSeatCapability,
}));
vi.mock("@/server/commands/handle-command", () => ({
  handleCommand: mocks.handleCommand,
}));
vi.mock("@/server/commands/run-bot-turn", () => ({
  scheduleBotTurns: mocks.scheduleBotTurns,
}));
vi.mock("@/server/observability/telemetry", () => ({
  withRequestTelemetry: vi.fn((_name: string, _request: Request, handler: () => unknown) =>
    handler(),
  ),
}));

import { resetRateLimits } from "../src/server/http/guards";
import { POST } from "../src/app/api/games/[gameId]/commands/route";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";
const COMMAND_ID = "00000000-0000-4000-8000-000000000003";

function envelope(payload: Record<string, unknown> = { type: "RollDice" }) {
  return {
    protocolVersion: 1,
    type: "game.command",
    requestId: REQUEST_ID,
    gameId: GAME_ID,
    commandId: COMMAND_ID,
    expectedVersion: 4,
    payload,
  };
}

function request(body: unknown = envelope(), contentType = "application/json") {
  return new Request(`http://localhost/api/games/${GAME_ID}/commands`, {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  resetRateLimits();
});

describe("POST /api/games/[gameId]/commands", () => {
  it("selects the seat capability for ordinary commands and returns the durable ACK", async () => {
    mocks.readSeatCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    mocks.handleCommand.mockResolvedValue({
      ok: true,
      commandId: COMMAND_ID,
      aggregateVersion: 5,
      firstSequence: 9,
      lastSequence: 10,
    });

    const response = await POST(request(), { params: Promise.resolve({ gameId: GAME_ID }) });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      type: "game.commandAck",
      requestId: REQUEST_ID,
      commandId: COMMAND_ID,
      aggregateVersion: 5,
    });
    expect(mocks.readSeatCapability).toHaveBeenCalledWith(GAME_ID);
    expect(mocks.handleCommand).toHaveBeenCalledWith(expect.objectContaining({ gameId: GAME_ID }), {
      gameId: GAME_ID,
      seatId: "seat-a",
      kind: "seat",
    });
    expect(mocks.scheduleBotTurns).toHaveBeenCalledWith(GAME_ID);
  });

  it("uses separate host and reclaim capabilities for their command classes", async () => {
    mocks.readHostCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "host", kind: "host" });
    mocks.readReclaimClaim.mockResolvedValue({
      gameId: GAME_ID,
      seatId: "seat-a",
      kind: "reclaim",
    });
    mocks.handleCommand.mockResolvedValue({
      ok: true,
      commandId: COMMAND_ID,
      aggregateVersion: 5,
      firstSequence: 9,
      lastSequence: 9,
    });

    await POST(request({ ...envelope({ type: "StartGame" }) }), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    await POST(request({ ...envelope({ type: "RequestSeatReclaim" }) }), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });

    expect(mocks.readHostCapability).toHaveBeenCalledWith(GAME_ID);
    expect(mocks.readReclaimClaim).toHaveBeenCalledWith(GAME_ID);
    expect(mocks.readSeatCapability).not.toHaveBeenCalled();
  });

  it("rejects malformed, out-of-scope, and unauthenticated requests before resolution", async () => {
    const malformed = await POST(request({ ...envelope(), gameId: "other-game" }), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(malformed.status).toBe(400);

    const unauthenticated = await POST(request(), { params: Promise.resolve({ gameId: GAME_ID }) });
    expect(unauthenticated.status).toBe(401);

    const wrongContentType = await POST(request({}, "text/plain"), {
      params: Promise.resolve({ gameId: GAME_ID }),
    });
    expect(wrongContentType.status).toBe(400);
    expect(mocks.handleCommand).not.toHaveBeenCalled();
  });

  it("maps authentication failures and rejected commands to safe errors", async () => {
    mocks.readSeatCapability.mockRejectedValue(new Error("database secret"));
    const unavailable = await POST(request(), { params: Promise.resolve({ gameId: GAME_ID }) });
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("database secret");

    mocks.readSeatCapability.mockResolvedValue({ gameId: GAME_ID, seatId: "seat-a", kind: "seat" });
    mocks.handleCommand.mockResolvedValue({
      ok: false,
      code: "STALE_VERSION",
      reason: "STALE_VERSION",
    });
    const rejected = await POST(request(), { params: Promise.resolve({ gameId: GAME_ID }) });
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      type: "game.error",
      error: { code: "STALE_VERSION", reason: "STALE_VERSION" },
    });
  });
});
