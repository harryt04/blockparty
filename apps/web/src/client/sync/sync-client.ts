import "client-only";

/**
 * Authoritative browser synchronization coordinator. See PROTO-002 through
 * PROTO-004 and UX-001/UX-018.
 *
 * Event ranges advance a delivery cursor only. The browser does not replay the
 * engine or invent a projection from domain events; it follows a contiguous
 * range with /sync and replaces local state with the returned authorized
 * snapshot. Capabilities and game state are never written to browser storage.
 */
import {
  BootstrapResponse,
  ServerEnvelope,
  type GameSnapshotProjection,
  type PresenceEnvelope,
} from "@blockparty/contracts";
import { openGameStream, type EventSourceFactory } from "./event-source";
import type { ConnectionState } from "@/components/shell/connection-status";

export interface GameSyncState {
  readonly connection: ConnectionState;
  readonly snapshot?: GameSnapshotProjection;
  readonly lastSequence: number;
  readonly aggregateVersion: number;
  readonly resyncing: boolean;
  readonly error?: string;
}

export interface SyncClientOptions {
  readonly gameId: string;
  readonly fetchImpl?: typeof fetch;
  readonly eventSourceFactory?: EventSourceFactory;
  readonly onState: (state: GameSyncState) => void;
  readonly onPresence?: (envelope: PresenceEnvelope) => void;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
  readonly jitter?: () => number;
  readonly visibilityTarget?: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >;
}

type RetryTimer = ReturnType<typeof setTimeout>;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TERMINAL_STATUS = new Set([401, 403, 404, 410, 422, 426]);

function initialState(): GameSyncState {
  return { connection: "connecting", lastSequence: 0, aggregateVersion: 0, resyncing: true };
}

function isTerminalStatus(status: number): boolean {
  return TERMINAL_STATUS.has(status) || !RETRYABLE_STATUS.has(status);
}

export class GameSyncClient {
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceFactory?: EventSourceFactory;
  private readonly options: SyncClientOptions;
  private state = initialState();
  private streamClose?: () => void;
  private retryTimer?: RetryTimer;
  private visibilityTarget?: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >;
  private started = false;
  private closed = false;
  private syncing = false;
  private retryAttempt = 0;

  constructor(options: SyncClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.eventSourceFactory = options.eventSourceFactory;
    this.visibilityTarget = options.visibilityTarget;
  }

  get currentState(): GameSyncState {
    return this.state;
  }

  /** Bootstraps once, then keeps the authenticated SSE stream alive. */
  async start(): Promise<void> {
    if (this.started || this.closed) return;
    this.started = true;
    this.emit({ connection: "connecting", resyncing: true });
    this.installVisibilityHandler();
    await this.bootstrap();
  }

  /** Stops all browser listeners and network activity. */
  close(): void {
    this.closed = true;
    this.started = false;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.streamClose?.();
    this.streamClose = undefined;
    this.removeVisibilityHandler();
    this.emit({ connection: "closed", resyncing: false });
  }

  /** Reconciles immediately after a command or an explicit retry request. */
  refresh(): void {
    // An ACK can race the SSE event for the same committed command. Let the
    // in-flight event-driven sync finish instead of closing its live stream
    // and making it reopen after every command.
    if (this.closed || !this.started || this.syncing) return;
    // The stream is delivery evidence and remains useful while the ACK-driven
    // sync catches up. Closing it here creates one new connection per command
    // when the ACK wins the race against the SSE event.
    void this.synchronize(false);
  }

  private emit(change: Partial<GameSyncState>): void {
    this.state = { ...this.state, ...change };
    this.options.onState(this.state);
  }

  private async bootstrap(): Promise<void> {
    try {
      const response = await this.fetchImpl(this.bootstrapUrl(), {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new SyncHttpError(response.status);
      const parsed = BootstrapResponse.safeParse(await response.json());
      if (!parsed.success || parsed.data.snapshot.gameId !== this.gameId) {
        throw new SyncProtocolError();
      }
      this.applySnapshot(parsed.data.snapshot);
      this.retryAttempt = 0;
      this.openStream();
    } catch (error) {
      this.handleFailure(error);
    }
  }

  private openStream(): void {
    if (this.closed) return;
    this.streamClose?.();
    this.streamClose = openGameStream(
      this.gameId,
      {
        onEnvelope: (envelope) => this.handleEnvelope(envelope),
        onGap: () => this.requestResync(),
        onConnectionChange: (connected) => {
          if (connected) {
            this.retryAttempt = 0;
            this.emit({ connection: "live", error: undefined });
          } else {
            this.handleTransportLoss();
          }
        },
      },
      this.eventSourceFactory,
    );
  }

  private handleEnvelope(envelope: ServerEnvelope): void {
    if (this.closed || envelope.gameId !== this.gameId) return;
    switch (envelope.type) {
      case "game.snapshot":
        if (envelope.snapshot.gameId !== this.gameId) return this.requestResync();
        if (
          envelope.sequence < this.state.lastSequence ||
          envelope.aggregateVersion < this.state.aggregateVersion
        ) {
          return;
        }
        this.applySnapshot(envelope.snapshot);
        return;
      case "game.events":
        if (!this.isContiguousEvents(envelope)) return this.requestResync();
        this.emit({
          lastSequence: envelope.lastSequence,
          aggregateVersion: envelope.aggregateVersion,
          connection: "resyncing",
          resyncing: true,
          error: undefined,
        });
        // A normal committed event range does not require a new SSE socket.
        // Keep the authenticated stream open while /sync replaces the
        // delivery evidence with the authoritative snapshot. Reconnecting
        // for every command exhausts the per-seat connection cap in a live
        // game with several bot events.
        void this.synchronize(false);
        return;
      case "room.presence":
        this.options.onPresence?.(envelope);
        return;
      case "game.closed":
        if (envelope.reason === "SERVER_SHUTDOWN") {
          this.handleTransportLoss();
          return;
        }
        this.closed = true;
        this.started = false;
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.streamClose?.();
        this.streamClose = undefined;
        this.removeVisibilityHandler();
        this.emit({ connection: "closed", resyncing: false });
        return;
      case "game.commandAck":
        return;
    }
  }

  private isContiguousEvents(envelope: Extract<ServerEnvelope, { type: "game.events" }>): boolean {
    if (
      envelope.firstSequence !== this.state.lastSequence + 1 ||
      envelope.lastSequence < envelope.firstSequence ||
      envelope.events.length !== envelope.lastSequence - envelope.firstSequence + 1 ||
      envelope.aggregateVersion < this.state.aggregateVersion
    ) {
      return false;
    }
    return envelope.events.every(
      (event, index) =>
        event.gameId === this.gameId && event.sequence === envelope.firstSequence + index,
    );
  }

  private requestResync(): void {
    if (this.closed || this.syncing) return;
    this.streamClose?.();
    this.streamClose = undefined;
    void this.synchronize();
  }

  private async synchronize(reopenStream = true): Promise<void> {
    if (this.closed || this.syncing) return;
    this.syncing = true;
    this.emit({ connection: "resyncing", resyncing: true, error: undefined });
    try {
      for (;;) {
        const response = await this.fetchImpl(this.syncUrl(), {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new SyncHttpError(response.status);
        const parsed = ServerEnvelope.safeParse(await response.json());
        if (!parsed.success || parsed.data.gameId !== this.gameId) throw new SyncProtocolError();
        if (parsed.data.type === "game.snapshot") {
          if (
            parsed.data.sequence < this.state.lastSequence ||
            parsed.data.aggregateVersion < this.state.aggregateVersion
          ) {
            throw new SyncProtocolError();
          }
          this.applySnapshot(parsed.data.snapshot);
          break;
        }
        if (parsed.data.type !== "game.events") throw new SyncProtocolError();
        if (!this.isContiguousEvents(parsed.data)) {
          // A newer SSE snapshot may arrive while this request is in flight.
          // The older range is already represented by the current delivery
          // cursor, so it is safe to ask again from that newer position.
          if (
            parsed.data.lastSequence <= this.state.lastSequence &&
            parsed.data.aggregateVersion <= this.state.aggregateVersion
          ) {
            continue;
          }
          throw new SyncProtocolError();
        }
        // Domain events are delivery evidence. Follow the range until the
        // server returns the authoritative seat projection snapshot.
        this.emit({
          lastSequence: parsed.data.lastSequence,
          aggregateVersion: parsed.data.aggregateVersion,
        });
      }
      this.retryAttempt = 0;
      if (!this.closed && reopenStream) this.openStream();
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.syncing = false;
    }
  }

  private handleTransportLoss(): void {
    if (this.closed) return;
    this.streamClose?.();
    this.streamClose = undefined;
    if (this.syncing) return;
    this.schedule(() => void this.synchronize());
  }

  private handleFailure(error: unknown): void {
    if (this.closed) return;
    if (error instanceof SyncHttpError && isTerminalStatus(error.status)) {
      this.closed = true;
      this.started = false;
      this.streamClose?.();
      this.streamClose = undefined;
      this.removeVisibilityHandler();
      this.emit({ connection: "closed", resyncing: false, error: "This game is unavailable." });
      return;
    }
    this.schedule(() =>
      this.state.snapshot === undefined ? void this.bootstrap() : void this.synchronize(),
    );
  }

  private schedule(action: () => void): void {
    if (this.closed || this.retryTimer !== undefined) return;
    const base = this.options.backoffBaseMs ?? 250;
    const maximum = this.options.backoffMaxMs ?? 8_000;
    const delay = Math.min(maximum, base * 2 ** this.retryAttempt);
    const jitter = Math.max(0, Math.min(1, this.options.jitter?.() ?? Math.random()));
    this.retryAttempt += 1;
    this.emit({ connection: "reconnecting", resyncing: true });
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = undefined;
        action();
      },
      Math.round(delay * (0.75 + jitter * 0.5)),
    );
  }

  private applySnapshot(snapshot: GameSnapshotProjection): void {
    this.emit({
      connection: "live",
      snapshot,
      lastSequence: snapshot.sequence,
      aggregateVersion: snapshot.aggregateVersion,
      resyncing: false,
      error: undefined,
    });
  }

  private readonly onVisible = () => {
    if (this.visibilityTarget?.visibilityState === "hidden") return;
    this.requestResync();
  };

  private installVisibilityHandler(): void {
    this.visibilityTarget ??= typeof document === "undefined" ? undefined : document;
    this.visibilityTarget?.addEventListener("visibilitychange", this.onVisible);
  }

  private removeVisibilityHandler(): void {
    this.visibilityTarget?.removeEventListener("visibilitychange", this.onVisible);
  }

  private get gameId(): string {
    return this.options.gameId;
  }

  private bootstrapUrl(): string {
    return `/api/games/${encodeURIComponent(this.gameId)}/bootstrap`;
  }

  private syncUrl(): string {
    const query = new URLSearchParams({
      lastSequence: String(this.state.lastSequence),
      aggregateVersion: String(this.state.aggregateVersion),
    });
    return `/api/games/${encodeURIComponent(this.gameId)}/sync?${query.toString()}`;
  }
}

class SyncHttpError extends Error {
  constructor(readonly status: number) {
    super(`Sync request failed with status ${status}`);
  }
}

class SyncProtocolError extends Error {
  constructor() {
    super("The server returned an invalid synchronization frame");
  }
}
