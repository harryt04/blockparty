import { describe, expect, it, vi } from "vitest";
import {
  STANDARD_CONFIGURATION,
  type GameSnapshotProjection,
  type ServerEnvelope,
} from "@blockparty/contracts";
import { GameSyncClient } from "../src/client/sync/sync-client";
import type { EventSourceLike } from "../src/client/sync/event-source";

const GAME_ID = "00000000-0000-4000-8000-000000000031";

function snapshot(sequence: number, aggregateVersion = sequence): GameSnapshotProjection {
  return {
    gameId: GAME_ID,
    status: "LOBBY",
    phase: "Lobby",
    aggregateVersion,
    sequence,
    versions: {
      contentVersion: "1.0.0",
      rulesSchemaVersion: "1.0.0",
      variantSchemaVersion: "1.0.0",
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    viewerSeatId: "seat-a",
    seats: [
      {
        seatId: "seat-a",
        name: "Host",
        kind: "human",
        status: "active",
        token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
        isHost: true,
        connected: true,
        isSelf: true,
      },
    ],
    board: [],
    legalActions: [{ type: "StartGame" }],
    actionAvailability: [],
    recovery: {
      safeBoundary: true,
      replacementSeatIds: [],
      viewerCanRequestReclaim: false,
      viewerCanClaimHost: false,
    },
    paused: false,
    expiresAt: "2026-10-03T15:00:00.000Z",
    configuration: STANDARD_CONFIGURATION,
  };
}

function bootstrapBody(value: GameSnapshotProjection) {
  return {
    snapshot: value,
    aggregateVersion: value.aggregateVersion,
    sequence: value.sequence,
    serverTime: "2026-09-03T15:00:00.000Z",
  };
}

function snapshotEnvelope(value: GameSnapshotProjection): ServerEnvelope {
  return {
    protocolVersion: 1,
    type: "game.snapshot",
    gameId: GAME_ID,
    serverTime: "2026-09-03T15:00:00.000Z",
    aggregateVersion: value.aggregateVersion,
    sequence: value.sequence,
    snapshot: value,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

class FakeEventSource implements EventSourceLike {
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, (event: Event) => void>();
  closed = false;

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.(new Event("open"));
  }

  error(): void {
    this.onerror?.(new Event("error"));
  }

  emit(envelope: ServerEnvelope): void {
    const listener = this.listeners.get(envelope.type);
    listener?.(new MessageEvent(envelope.type, { data: JSON.stringify(envelope) }));
  }

  emitRaw(type: string, data: string): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data }));
  }
}

function eventsEnvelope(firstSequence: number, lastSequence: number): ServerEnvelope {
  return {
    protocolVersion: 1,
    type: "game.events",
    gameId: GAME_ID,
    serverTime: "2026-09-03T15:00:00.000Z",
    aggregateVersion: lastSequence,
    firstSequence,
    lastSequence,
    events: Array.from({ length: lastSequence - firstSequence + 1 }, (_, index) => ({
      gameId: GAME_ID,
      sequence: firstSequence + index,
      aggregateVersion: firstSequence + index,
      type: "TurnStarted",
      eventVersion: 1,
      occurredAt: "2026-09-03T15:00:00.000Z",
      payload: {},
    })),
  };
}

describe("GameSyncClient", () => {
  it("bootstraps with credentials, consumes named snapshots, and never persists state", async () => {
    const source = new FakeEventSource();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(bootstrapBody(snapshot(0))));
    const states: string[] = [];
    const client = new GameSyncClient({
      gameId: GAME_ID,
      fetchImpl,
      eventSourceFactory: () => source,
      onState: (state) => states.push(state.connection),
      jitter: () => 0,
    });

    await client.start();
    source.open();
    source.emit({
      protocolVersion: 1,
      type: "game.snapshot",
      gameId: GAME_ID,
      serverTime: "2026-09-03T15:00:00.000Z",
      aggregateVersion: 2,
      sequence: 2,
      snapshot: snapshot(2),
    });
    source.emit({
      protocolVersion: 1,
      type: "game.snapshot",
      gameId: GAME_ID,
      serverTime: "2026-09-03T15:00:00.000Z",
      aggregateVersion: 1,
      sequence: 1,
      snapshot: snapshot(1),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/games/${GAME_ID}/bootstrap`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(client.currentState.snapshot?.sequence).toBe(2);
    expect(states).toContain("live");
    expect(states).not.toContain("closed");
    expect(JSON.stringify(client.currentState)).not.toContain("capability");
  });

  it("accepts only contiguous event ranges, then replaces them with the sync snapshot", async () => {
    const sources: FakeEventSource[] = [];
    const current = snapshot(0);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(bootstrapBody(current)))
      .mockResolvedValueOnce(response(snapshotEnvelope(snapshot(2))));
    const client = new GameSyncClient({
      gameId: GAME_ID,
      fetchImpl,
      eventSourceFactory: () => {
        const source = new FakeEventSource();
        sources.push(source);
        return source;
      },
      onState: () => undefined,
      jitter: () => 0,
    });

    await client.start();
    sources[0]!.open();
    sources[0]!.emit(eventsEnvelope(1, 1));
    await vi.waitFor(() => expect(client.currentState.snapshot?.sequence).toBe(2));

    expect(fetchImpl).toHaveBeenLastCalledWith(
      `/api/games/${GAME_ID}/sync?lastSequence=1&aggregateVersion=1`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(sources[0]!.closed).toBe(true);
  });

  it("resyncs a gap and retries transport loss with exponential backoff", async () => {
    vi.useFakeTimers();
    try {
      const sources: FakeEventSource[] = [];
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(bootstrapBody(snapshot(0))))
        .mockResolvedValueOnce(response(snapshotEnvelope(snapshot(2))))
        .mockResolvedValueOnce(response(snapshotEnvelope(snapshot(2))));
      const connections: string[] = [];
      const client = new GameSyncClient({
        gameId: GAME_ID,
        fetchImpl,
        eventSourceFactory: () => {
          const source = new FakeEventSource();
          sources.push(source);
          return source;
        },
        onState: (state) => connections.push(state.connection),
        backoffBaseMs: 100,
        jitter: () => 0,
      });

      await client.start();
      sources[0]!.open();
      sources[0]!.emit(eventsEnvelope(2, 2));
      expect(client.currentState.connection).toBe("resyncing");
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(client.currentState.snapshot?.sequence).toBe(2);

      sources[1]!.open();
      sources[1]!.error();
      expect(client.currentState.connection).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(74);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
      expect(connections).toContain("reconnecting");
      expect(connections).toContain("resyncing");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects after a retryable server shutdown frame", async () => {
    vi.useFakeTimers();
    try {
      const sources: FakeEventSource[] = [];
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response(bootstrapBody(snapshot(0))))
        .mockResolvedValueOnce(response(snapshotEnvelope(snapshot(1))));
      const client = new GameSyncClient({
        gameId: GAME_ID,
        fetchImpl,
        eventSourceFactory: () => {
          const source = new FakeEventSource();
          sources.push(source);
          return source;
        },
        onState: () => undefined,
        jitter: () => 0,
      });

      await client.start();
      sources[0]!.open();
      sources[0]!.emit({
        protocolVersion: 1,
        type: "game.closed",
        gameId: GAME_ID,
        serverTime: "2026-09-03T15:00:00.000Z",
        reason: "SERVER_SHUTDOWN",
      });

      expect(sources[0]!.closed).toBe(true);
      expect(client.currentState.connection).toBe("reconnecting");
      expect(client.currentState.connection).not.toBe("closed");

      await vi.advanceTimersByTimeAsync(188);
      await vi.waitFor(() => expect(client.currentState.snapshot?.sequence).toBe(1));
      expect(sources).toHaveLength(2);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats malformed named frames as a gap and closes on terminal authorization errors", async () => {
    const source = new FakeEventSource();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(bootstrapBody(snapshot(0))))
      .mockResolvedValueOnce(response({}, 403));
    const client = new GameSyncClient({
      gameId: GAME_ID,
      fetchImpl,
      eventSourceFactory: () => source,
      onState: () => undefined,
      jitter: () => 0,
    });

    await client.start();
    source.open();
    source.emitRaw("game.snapshot", "not-json");
    await vi.waitFor(() => expect(client.currentState.connection).toBe("closed"));
    expect(client.currentState.error).toBe("This game is unavailable.");
  });
});
