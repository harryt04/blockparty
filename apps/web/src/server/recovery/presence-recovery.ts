import "server-only";

/**
 * Safe-boundary recovery for ephemeral SSE presence. Presence itself never
 * changes GameState and never extends retention. When a stable command
 * boundary observes a required seat disconnect, the recovery decision is
 * journaled so every client sees the same pause/resume and host transition.
 * See PRD-FUN-014, RULE-009, and PROTO-003.
 */
import type { ClientSession, Collection, Filter, UpdateFilter } from "mongodb";
import { DomainEvent, type DomainEvent as DomainEventType } from "@blockparty/contracts";
import { getDb, withMongoTransaction } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import { generateCapability, hashCapability } from "../auth/capabilities";
import type { AuditDocument, GameDocument, HostCapabilityDocument } from "../games/create-game";
import {
  connectedSeatTenures,
  setPresenceRecoveryHandler,
  type PresenceChange,
} from "../sse/registry";

const RECOVERY_EVENT_VERSION = 1;

export interface RecoveryStore {
  readonly games: Pick<Collection<GameDocument>, "findOne" | "updateOne">;
  readonly gameEvents: Pick<Collection<DomainEventType>, "insertMany">;
  readonly hostCapabilities: Pick<Collection<HostCapabilityDocument>, "updateOne" | "insertOne">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface ConnectedSeatTenure {
  readonly seatId: string;
  readonly connectedAt: number;
}

export interface RecoveryResult {
  readonly events: readonly DomainEventType[];
  readonly transferredHostSeatId?: string;
  readonly pendingHostClaimSeatId?: string;
}

function recoveryStore(): RecoveryStore {
  const database = getDb();
  return {
    games: database.collection<GameDocument>(COLLECTIONS.games),
    gameEvents: database.collection<DomainEventType>(COLLECTIONS.gameEvents),
    hostCapabilities: database.collection<HostCapabilityDocument>(COLLECTIONS.hostCapabilities),
    auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
  };
}

function connectedHumanSeats(
  game: GameDocument,
  tenures: readonly ConnectedSeatTenure[],
): readonly string[] {
  const connected = new Set(tenures.map((entry) => entry.seatId));
  return game.seats
    .filter(
      (seat) => seat.kind === "human" && seat.status === "active" && connected.has(seat.seatId),
    )
    .map((seat) => seat.seatId);
}

/** Returns the human whose response is required at this stable phase. */
function requiredSeatId(game: GameDocument): string | undefined {
  if (game.status !== "ACTIVE") return undefined;
  const state = game.snapshot;
  const candidate =
    state.phase === "AwaitAuction" || state.phase === "ImprovementAuction"
      ? state.prioritySeatId
      : state.phase === "AwaitDebt"
        ? state.obligation?.debtorSeatId
        : ["TurnStart", "AwaitRoll", "AwaitPurchase", "AwaitChoice", "TurnEnd"].includes(
              state.phase,
            )
          ? state.activeSeatId
          : undefined;
  const seat = game.seats.find(
    (entry) => entry.seatId === candidate && entry.kind === "human" && entry.status === "active",
  );
  return seat?.seatId;
}

function selectNewHost(
  game: GameDocument,
  tenures: readonly ConnectedSeatTenure[],
): string | undefined {
  const seatOrder = new Map(game.seats.map((seat, index) => [seat.seatId, index]));
  const connected = new Set(connectedHumanSeats(game, tenures));
  return [...tenures]
    .filter((entry) => connected.has(entry.seatId) && entry.seatId !== game.hostSeatId)
    .sort(
      (left, right) =>
        left.connectedAt - right.connectedAt ||
        (seatOrder.get(left.seatId) ?? Number.MAX_SAFE_INTEGER) -
          (seatOrder.get(right.seatId) ?? Number.MAX_SAFE_INTEGER),
    )[0]?.seatId;
}

function event(
  gameId: string,
  type: DomainEventType["type"],
  actorSeatId: string | undefined,
  payload: Readonly<Record<string, unknown>>,
  occurredAt: Date,
): DomainEventType {
  return DomainEvent.parse({
    gameId,
    sequence: 0,
    aggregateVersion: 0,
    type,
    eventVersion: RECOVERY_EVENT_VERSION,
    ...(actorSeatId === undefined ? {} : { actorSeatId }),
    occurredAt: occurredAt.toISOString(),
    payload,
  });
}

function lobbyWithPresence(
  lobby: GameDocument["lobby"],
  game: GameDocument,
  tenures: readonly ConnectedSeatTenure[],
): GameDocument["lobby"] {
  const connected = new Set(tenures.map((entry) => entry.seatId));
  return {
    ...lobby,
    seats: lobby.seats.map((seat) => ({
      ...seat,
      connected: connected.has(seat.seatId) || seat.kind === "bot",
      isHost: seat.seatId === game.hostSeatId,
    })),
    viewerIsHost: lobby.viewerSeatId === game.hostSeatId,
  };
}

/**
 * Reconciles one presence edge inside the same transaction used for the
 * recovery journal. A process restart simply waits for the next authenticated
 * stream connection; it never fabricates a turn, bid, pass, or bankruptcy.
 */
export async function reconcilePresenceInTransaction(
  store: RecoveryStore,
  session: ClientSession,
  gameId: string,
  tenures: readonly ConnectedSeatTenure[],
  now = new Date(),
): Promise<RecoveryResult> {
  const game = await store.games.findOne({ _id: gameId }, { session });
  if (
    game === null ||
    game.status === "COMPLETED" ||
    game.status === "NO_CONTEST" ||
    game.status === "EXPIRED"
  ) {
    return { events: [] };
  }

  const connectedHumans = new Set(connectedHumanSeats(game, tenures));
  const required = requiredSeatId(game);
  const requiredDisconnectedSeat =
    required !== undefined && !connectedHumans.has(required) ? required : undefined;
  const nextEvents: DomainEventType[] = [];
  let paused = game.paused ?? false;
  let pausedSeatId = game.pausedSeatId;

  if (requiredDisconnectedSeat !== undefined && !paused) {
    paused = true;
    pausedSeatId = requiredDisconnectedSeat;
    nextEvents.push(
      event(
        game._id,
        "PlayPaused",
        undefined,
        { requiredSeatId: requiredDisconnectedSeat, phase: game.snapshot.phase },
        now,
      ),
    );
  } else if (requiredDisconnectedSeat === undefined && paused) {
    paused = false;
    pausedSeatId = undefined;
    nextEvents.push(
      event(game._id, "PlayResumed", undefined, { requiredSeatId: game.pausedSeatId }, now),
    );
  }

  let nextHostSeatId = game.hostSeatId;
  let pendingHostClaimSeatId = game.pendingHostClaimSeatId;
  const hostConnected = connectedHumans.has(game.hostSeatId);
  const pendingHostConnected =
    pendingHostClaimSeatId !== undefined && connectedHumans.has(pendingHostClaimSeatId);
  const newHostSeatId =
    hostConnected || pendingHostConnected ? undefined : selectNewHost(game, tenures);
  if (newHostSeatId !== undefined) {
    nextHostSeatId = newHostSeatId;
    pendingHostClaimSeatId = newHostSeatId;
    nextEvents.push(
      event(
        game._id,
        "HostTransferred",
        undefined,
        {
          fromSeatId: game.hostSeatId,
          toSeatId: newHostSeatId,
          reasonCode: "HOST_DISCONNECTED",
        },
        now,
      ),
    );
    await store.hostCapabilities.updateOne(
      { gameId: game._id, status: "active" },
      { $set: { status: "revoked" } },
      { session },
    );
  }

  if (nextEvents.length === 0) {
    return { events: [] };
  }

  const nextVersion = game.aggregateVersion + 1;
  const journalEvents = nextEvents.map((candidate, index) =>
    DomainEvent.parse({
      ...candidate,
      sequence: game.lastSequence + index + 1,
      aggregateVersion: nextVersion,
    }),
  );
  const nextSnapshot = { ...game.snapshot, aggregateVersion: nextVersion };
  const nextLobby = lobbyWithPresence(game.lobby, { ...game, hostSeatId: nextHostSeatId }, tenures);
  await store.gameEvents.insertMany(journalEvents, { session, ordered: true });
  const update: UpdateFilter<GameDocument> = {
    $set: {
      snapshot: nextSnapshot,
      lobby: nextLobby,
      hostSeatId: nextHostSeatId,
      aggregateVersion: nextVersion,
      lastSequence: game.lastSequence + journalEvents.length,
      paused,
      ...(pausedSeatId === undefined ? { pausedSeatId: undefined } : { pausedSeatId }),
      ...(pendingHostClaimSeatId === undefined
        ? { pendingHostClaimSeatId: undefined }
        : { pendingHostClaimSeatId }),
    },
  };
  const filter: Filter<GameDocument> = {
    _id: game._id,
    aggregateVersion: game.aggregateVersion,
    lastSequence: game.lastSequence,
  };
  const updated = await store.games.updateOne(filter, update, { session });
  if (updated.matchedCount !== 1) throw new Error("STALE_VERSION");

  for (const committed of journalEvents) {
    if (committed.type === "PlayPaused") {
      await store.auditLog.insertOne(
        {
          gameId: game._id,
          seatId: String(committed.payload.requiredSeatId),
          action: "play_paused",
          reasonCode: "DISCONNECTED_REQUIRED_SEAT",
          occurredAt: now,
        },
        { session },
      );
    } else if (committed.type === "PlayResumed") {
      await store.auditLog.insertOne(
        {
          gameId: game._id,
          seatId: String(committed.payload.requiredSeatId ?? game.pausedSeatId),
          action: "play_resumed",
          reasonCode: "REQUIRED_SEAT_RECONNECTED",
          occurredAt: now,
        },
        { session },
      );
    } else if (committed.type === "HostTransferred") {
      await store.auditLog.insertOne(
        {
          gameId: game._id,
          seatId: String(committed.payload.toSeatId),
          action: "host_transferred",
          reasonCode: "HOST_DISCONNECTED",
          occurredAt: now,
        },
        { session },
      );
    }
  }

  return {
    events: journalEvents,
    ...(nextHostSeatId === game.hostSeatId ? {} : { transferredHostSeatId: nextHostSeatId }),
    ...(pendingHostClaimSeatId === undefined ? {} : { pendingHostClaimSeatId }),
  };
}

/** Executes reconciliation after presence changes, outside the SSE delivery path. */
export async function reconcilePresence(gameId: string, _change?: PresenceChange): Promise<void> {
  await withMongoTransaction((session) =>
    reconcilePresenceInTransaction(recoveryStore(), session, gameId, connectedSeatTenures(gameId)),
  );
}

/** Enables automatic recovery when the authenticated SSE route is loaded. */
export function installPresenceRecovery(): void {
  setPresenceRecoveryHandler((change) => reconcilePresence(change.gameId, change));
}

export interface HostClaimStore {
  readonly games: Pick<Collection<GameDocument>, "findOne" | "updateOne">;
  readonly hostCapabilities: Pick<Collection<HostCapabilityDocument>, "insertOne">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface ClaimedHost {
  readonly token: string;
}

/** Issues the distinct host capability after the selected human reaches the app. */
export async function claimTransferredHostInTransaction(
  store: HostClaimStore,
  session: ClientSession,
  gameId: string,
  seatId: string,
  now = new Date(),
): Promise<ClaimedHost> {
  const game = await store.games.findOne({ _id: gameId }, { session });
  if (
    game === null ||
    game.pendingHostClaimSeatId !== seatId ||
    game.hostSeatId !== seatId ||
    game.status === "EXPIRED"
  ) {
    throw new Error("FORBIDDEN");
  }
  const token = generateCapability();
  await store.hostCapabilities.insertOne(
    {
      tokenHash: hashCapability(token),
      gameId,
      seatId,
      status: "active",
      createdAt: now,
      expiresAt: game.expiresAt,
    },
    { session },
  );
  const updated = await store.games.updateOne(
    { _id: gameId, pendingHostClaimSeatId: seatId },
    { $set: { pendingHostClaimSeatId: undefined } },
    { session },
  );
  if (updated.matchedCount !== 1) throw new Error("STALE_VERSION");
  await store.auditLog.insertOne(
    {
      gameId,
      seatId,
      action: "host_transfer_claimed",
      reasonCode: "HOST_TRANSFER_CLAIMED",
      occurredAt: now,
    },
    { session },
  );
  return { token };
}
