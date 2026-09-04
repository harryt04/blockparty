import "server-only";

/**
 * THE single authoritative command path. See ENG-015 and the flow in ENG-002.
 *
 * Every lobby, gameplay, host, replacement, reclaim, transfer, and
 * EndNoContest command runs through here. There is no second path and no rule
 * shortcut around the engine.
 *
 * MongoDB optimistic concurrency is the serialization mechanism: the snapshot
 * update carries the prior aggregate version in its predicate, and each event
 * has a unique (gameId, sequence) key. A concurrent writer therefore commits
 * one version and the other aborts or returns STALE_VERSION. State is never
 * silently overwritten.
 */
import {
  CommandEnvelope,
  DomainEvent,
  HOST_ONLY_COMMANDS,
  type ErrorCode,
  type CommandEnvelope as ParsedCommandEnvelope,
  type GameStatus,
} from "@blockparty/contracts";
import {
  assertInvariants,
  type BotDecision,
  resolve,
  type EngineEvent,
  type GameState,
} from "@blockparty/game-engine";
import type { ClientSession, Collection, Filter, UpdateFilter } from "mongodb";
import { getDb, withMongoTransaction } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import type { GameDocument } from "../games/create-game";
import type { AuthenticatedSeat } from "../auth/session";
import { ensureChangeStream } from "../sse/change-stream";
import { connectedSeatTenures } from "../sse/registry";
import type { AuditDocument, CapabilityDocument } from "../games/create-game";
import { generateCapability, hashCapability } from "../auth/capabilities";
import { capturedRuleSet } from "../games/captured-rules";
import { normalizeGameState } from "../games/normalize-state";
import { admitCommand } from "../lifecycle";
import { observeTransaction, type TransactionOutcome } from "../observability/telemetry";

export interface CommandAccepted {
  readonly ok: true;
  readonly commandId: string;
  readonly aggregateVersion: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
  /** Short-lived server-to-route handoff; never included in the JSON ACK. */
  readonly seatCapability?: string;
}

export interface CommandRejected {
  readonly ok: false;
  readonly code: ErrorCode;
  readonly reason: string;
}

export type CommandOutcome = CommandAccepted | CommandRejected;

export interface GameEventDocument extends DomainEvent {
  readonly _id?: string;
}

export interface CommandReceiptDocument {
  readonly _id?: string;
  readonly gameId: string;
  readonly commandId: string;
  readonly accepted: true;
  readonly aggregateVersion: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly createdAt: Date;
}

export interface CommandStore {
  readonly games: Pick<Collection<GameDocument>, "findOne" | "updateOne">;
  readonly gameEvents: Pick<Collection<GameEventDocument>, "insertMany">;
  readonly commandReceipts: Pick<Collection<CommandReceiptDocument>, "findOne" | "insertOne">;
  readonly capabilities: Pick<Collection<CapabilityDocument>, "updateOne" | "insertOne">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface CommandPathOptions {
  readonly database?: CommandStore;
  readonly transaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  readonly now?: () => Date;
  readonly publish?: (gameId: string, events: readonly DomainEvent[]) => void | Promise<void>;
  /** Internal server handoff for a deterministic bot decision. */
  readonly botDecision?: BotDecision;
}

interface CommittedCommand {
  readonly outcome: CommandOutcome;
  readonly events: readonly DomainEvent[];
}

class CommandPathError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "CommandPathError";
  }
}

function commandStore(): CommandStore {
  const database = getDb();
  return {
    games: database.collection<GameDocument>(COLLECTIONS.games),
    gameEvents: database.collection<GameEventDocument>(COLLECTIONS.gameEvents),
    commandReceipts: database.collection<CommandReceiptDocument>(COLLECTIONS.commandReceipts),
    capabilities: database.collection<CapabilityDocument>(COLLECTIONS.capabilities),
    auditLog: database.collection<AuditDocument>(COLLECTIONS.auditLog),
  };
}

function hostCommand(command: ParsedCommandEnvelope["payload"]): boolean {
  return (HOST_ONLY_COMMANDS as readonly string[]).includes(command.type);
}

function recoveryCommand(command: ParsedCommandEnvelope["payload"]): boolean {
  return (
    command.type === "ReplaceSeatWithBot" ||
    command.type === "RequestSeatReclaim" ||
    command.type === "ApproveSeatReclaim"
  );
}

function safeBoundary(game: GameDocument): boolean {
  return game.snapshot.effectQueue.length === 0 && game.snapshot.pendingChoice == null;
}

function connected(game: GameDocument, seatId: string): boolean {
  return (
    connectedSeatTenures(game._id).some((tenure) => tenure.seatId === seatId) ||
    game.lobby.seats.some((seat) => seat.seatId === seatId && seat.connected)
  );
}

function recoveryEvent(
  game: GameDocument,
  type: DomainEvent["type"],
  actorSeatId: string,
  payload: Readonly<Record<string, unknown>>,
  now: Date,
): DomainEvent {
  return DomainEvent.parse({
    gameId: game._id,
    sequence: game.lastSequence + 1,
    aggregateVersion: game.aggregateVersion + 1,
    type,
    eventVersion: 1,
    actorSeatId,
    occurredAt: now.toISOString(),
    payload,
  });
}

function recoveryLobby(game: GameDocument, seats: GameDocument["seats"]): GameDocument["lobby"] {
  const bySeat = new Map(seats.map((seat) => [seat.seatId, seat]));
  return {
    ...game.lobby,
    seats: game.lobby.seats.map((seat) => {
      const replacement = bySeat.get(seat.seatId);
      return replacement === undefined
        ? seat
        : {
            ...seat,
            kind: replacement.kind,
            status: replacement.status,
            ...(replacement.name === undefined ? {} : { name: replacement.name }),
          };
    }),
  };
}

async function transactRecovery(
  envelope: ParsedCommandEnvelope,
  actor: AuthenticatedSeat,
  store: CommandStore,
  session: ClientSession,
  now: Date,
): Promise<CommittedCommand> {
  const existing = await store.commandReceipts.findOne(
    { gameId: envelope.gameId, commandId: envelope.commandId },
    { session },
  );
  if (existing !== null) return { outcome: ackFromReceipt(existing), events: [] };

  const persistedGame = await store.games.findOne({ _id: envelope.gameId }, { session });
  if (persistedGame === null) throw new CommandPathError("NOT_FOUND", "GAME_NOT_FOUND");
  const game = { ...persistedGame, snapshot: normalizeGameState(persistedGame.snapshot) };
  if (game.expiresAt <= now) throw new CommandPathError("GAME_EXPIRED", "GAME_EXPIRED");
  if (game.status !== "ACTIVE") throw new CommandPathError("ILLEGAL_ACTION", "GAME_TERMINAL");
  const command = envelope.payload;
  const expectedCapability = command.type === "RequestSeatReclaim" ? "reclaim" : "host";
  if (actor.gameId !== game._id || actor.kind !== expectedCapability) {
    throw new CommandPathError("FORBIDDEN", "CAPABILITY_KIND_MISMATCH");
  }
  if (envelope.expectedVersion !== game.aggregateVersion) {
    throw new CommandPathError("STALE_VERSION", "STALE_VERSION");
  }
  if (!safeBoundary(game)) {
    throw new CommandPathError("PHASE_MISMATCH", "RECOVERY_NOT_AT_SAFE_BOUNDARY");
  }

  const targetSeatId =
    command.type === "RequestSeatReclaim"
      ? actor.seatId
      : command.type === "ReplaceSeatWithBot" || command.type === "ApproveSeatReclaim"
        ? command.seatId
        : undefined;
  if (targetSeatId === undefined)
    throw new CommandPathError("INTERNAL", "INVALID_RECOVERY_COMMAND");
  const seatIndex = game.seats.findIndex((seat) => seat.seatId === targetSeatId);
  const seat = game.seats[seatIndex];
  if (seat === undefined) throw new CommandPathError("FORBIDDEN", "SEAT_NOT_FOUND");

  let nextSeats = game.seats;
  let nextSnapshot = game.snapshot;
  let nextPendingReclaim = game.pendingSeatReclaimId;
  let event: DomainEvent;
  let issuedSeatCapability: string | undefined;
  const audits: AuditDocument[] = [];

  if (command.type === "ReplaceSeatWithBot") {
    if (seat.kind !== "human" || seat.status !== "active" || connected(game, seat.seatId)) {
      throw new CommandPathError("ILLEGAL_ACTION", "SEAT_MUST_BE_DISCONNECTED_HUMAN");
    }
    const botName = `Bot ${seatIndex + 1}`;
    nextSeats = game.seats.map((candidate, index) =>
      index === seatIndex
        ? {
            ...candidate,
            kind: "bot" as const,
            status: "replaced" as const,
            name: botName,
            replacedName: candidate.name,
          }
        : candidate,
    );
    nextSnapshot = {
      ...game.snapshot,
      seats: game.snapshot.seats.map((candidate) =>
        candidate.seatId === seat.seatId ? { ...candidate, kind: "bot" as const } : candidate,
      ),
    };
    event = recoveryEvent(game, "SeatReplacedWithBot", actor.seatId, { seatId: seat.seatId }, now);
    const revoked = await store.capabilities.updateOne(
      { gameId: game._id, seatId: seat.seatId, kind: "seat", status: "active" },
      { $set: { status: "revoked" } },
      { session },
    );
    if (revoked.matchedCount !== 1) {
      throw new CommandPathError("INTERNAL", "SEAT_CAPABILITY_NOT_FOUND");
    }
    audits.push(
      {
        gameId: game._id,
        seatId: seat.seatId,
        action: "seat_replaced_with_bot",
        reasonCode: "SEAT_REPLACED",
        occurredAt: now,
      },
      {
        gameId: game._id,
        seatId: seat.seatId,
        action: "seat_capability_revoked",
        reasonCode: "SEAT_CAPABILITY_REVOKED",
        occurredAt: now,
      },
    );
  } else if (command.type === "RequestSeatReclaim") {
    if (actor.kind !== "reclaim" || seat.kind !== "bot" || seat.status !== "replaced") {
      throw new CommandPathError("FORBIDDEN", "RECLAIM_NOT_AVAILABLE");
    }
    if (game.pendingSeatReclaimId !== undefined) {
      throw new CommandPathError("ILLEGAL_ACTION", "RECLAIM_ALREADY_REQUESTED");
    }
    nextPendingReclaim = seat.seatId;
    event = recoveryEvent(game, "SeatReclaimRequested", actor.seatId, { seatId: seat.seatId }, now);
    audits.push({
      gameId: game._id,
      seatId: seat.seatId,
      action: "seat_reclaim_requested",
      reasonCode: "RECLAIM_REQUESTED",
      occurredAt: now,
    });
  } else {
    if (actor.kind !== "host" || game.pendingSeatReclaimId !== seat.seatId) {
      throw new CommandPathError("FORBIDDEN", "RECLAIM_NOT_REQUESTED");
    }
    const newToken = generateCapability();
    issuedSeatCapability = newToken;
    nextPendingReclaim = undefined;
    nextSeats = game.seats.map((candidate) =>
      candidate.seatId === seat.seatId
        ? {
            ...candidate,
            kind: "human" as const,
            status: "active" as const,
            ...(candidate.replacedName === undefined
              ? {}
              : { name: candidate.replacedName, replacedName: undefined }),
          }
        : candidate,
    );
    nextSnapshot = {
      ...game.snapshot,
      seats: game.snapshot.seats.map((candidate) =>
        candidate.seatId === seat.seatId ? { ...candidate, kind: "human" as const } : candidate,
      ),
    };
    event = recoveryEvent(game, "SeatReclaimApproved", actor.seatId, { seatId: seat.seatId }, now);
    const revoked = await store.capabilities.updateOne(
      { gameId: game._id, seatId: seat.seatId, kind: "reclaim", status: "active" },
      { $set: { status: "revoked" } },
      { session },
    );
    if (revoked.matchedCount !== 1) {
      throw new CommandPathError("INTERNAL", "RECLAIM_CLAIM_NOT_FOUND");
    }
    await store.capabilities.insertOne(
      {
        tokenHash: hashCapability(newToken),
        gameId: game._id,
        seatId: seat.seatId,
        kind: "seat",
        status: "active",
        createdAt: now,
        expiresAt: game.expiresAt,
      },
      { session },
    );
    audits.push(
      {
        gameId: game._id,
        seatId: seat.seatId,
        action: "seat_reclaim_approved",
        reasonCode: "RECLAIM_APPROVED",
        occurredAt: now,
      },
      {
        gameId: game._id,
        seatId: seat.seatId,
        action: "seat_reclaim_transferred",
        reasonCode: "RECLAIM_TRANSFERRED",
        occurredAt: now,
      },
    );
  }

  const nextVersion = game.aggregateVersion + 1;
  const nextState = Object.freeze({
    ...nextSnapshot,
    aggregateVersion: nextVersion,
    pendingSeatReclaimId: nextPendingReclaim,
  });
  const journalEvent = DomainEvent.parse({ ...event, aggregateVersion: nextVersion });
  await store.gameEvents.insertMany([{ ...journalEvent }], { session, ordered: true });
  const updated = await store.games.updateOne(
    { _id: game._id, aggregateVersion: game.aggregateVersion, lastSequence: game.lastSequence },
    {
      $set: {
        seats: nextSeats,
        snapshot: nextState,
        lobby: recoveryLobby(game, nextSeats),
        aggregateVersion: nextVersion,
        lastSequence: game.lastSequence + 1,
        pendingSeatReclaimId: nextPendingReclaim,
      },
    },
    { session },
  );
  if (updated.matchedCount !== 1) throw new CommandPathError("STALE_VERSION", "STALE_VERSION");
  for (const audit of audits) await store.auditLog.insertOne(audit, { session });
  const receipt: CommandReceiptDocument = {
    gameId: game._id,
    commandId: envelope.commandId,
    accepted: true,
    aggregateVersion: nextVersion,
    firstSequence: game.lastSequence + 1,
    lastSequence: game.lastSequence + 1,
    createdAt: now,
  };
  await store.commandReceipts.insertOne(receipt, { session });
  return {
    outcome: {
      ...ackFromReceipt(receipt),
      ...(issuedSeatCapability === undefined ? {} : { seatCapability: issuedSeatCapability }),
    },
    events: [journalEvent],
  };
}

/**
 * Rules are a lobby aggregate concern, but still use the same receipt,
 * version, journal, and post-commit publication path as gameplay commands.
 * This keeps VAR-010 changes atomic without putting configuration in the
 * pure gameplay state machine.
 */
async function transactLobbyConfiguration(
  envelope: ParsedCommandEnvelope,
  actor: AuthenticatedSeat,
  store: CommandStore,
  session: ClientSession,
  now: Date,
): Promise<CommittedCommand> {
  const existing = await store.commandReceipts.findOne(
    { gameId: envelope.gameId, commandId: envelope.commandId },
    { session },
  );
  if (existing !== null) return { outcome: ackFromReceipt(existing), events: [] };

  const persistedGame = await store.games.findOne({ _id: envelope.gameId }, { session });
  if (persistedGame === null) throw new CommandPathError("NOT_FOUND", "GAME_NOT_FOUND");
  const game = { ...persistedGame, snapshot: normalizeGameState(persistedGame.snapshot) };
  if (game.expiresAt <= now) throw new CommandPathError("GAME_EXPIRED", "GAME_EXPIRED");
  if (actor.kind !== "host" || actor.seatId !== game.hostSeatId) {
    throw new CommandPathError("FORBIDDEN", "HOST_CAPABILITY_REQUIRED");
  }
  if (game.status !== "LOBBY" || game.snapshot.phase !== "Lobby") {
    throw new CommandPathError("PHASE_MISMATCH", "RULES_LOCKED_AFTER_START");
  }
  if (envelope.expectedVersion !== game.aggregateVersion) {
    throw new CommandPathError("STALE_VERSION", "STALE_VERSION");
  }

  const command = envelope.payload;
  if (command.type !== "ConfigureRules") {
    throw new CommandPathError("INTERNAL", "INVALID_LOBBY_COMMAND");
  }
  const nextVersion = game.aggregateVersion + 1;
  const priorSequence = game.lastSequence;
  const event = DomainEvent.parse({
    gameId: game._id,
    sequence: priorSequence + 1,
    aggregateVersion: nextVersion,
    type: "RulesConfigured",
    eventVersion: 1,
    actorSeatId: actor.seatId,
    occurredAt: now.toISOString(),
    payload: { configuration: command.configuration, contentHash: game.contentHash },
  });
  const nextState = Object.freeze({ ...game.snapshot, aggregateVersion: nextVersion });
  await store.gameEvents.insertMany([{ ...event }], { session, ordered: true });
  const updated = await store.games.updateOne(
    { _id: game._id, aggregateVersion: game.aggregateVersion, lastSequence: game.lastSequence },
    {
      $set: {
        configuration: command.configuration,
        rulesConfigured: true,
        snapshot: nextState,
        lobby: { ...game.lobby, configuration: command.configuration },
        aggregateVersion: nextVersion,
        lastSequence: game.lastSequence + 1,
      },
    },
    { session },
  );
  if (updated.matchedCount !== 1) throw new CommandPathError("STALE_VERSION", "STALE_VERSION");

  const receipt: CommandReceiptDocument = {
    gameId: game._id,
    commandId: envelope.commandId,
    accepted: true,
    aggregateVersion: nextVersion,
    firstSequence: priorSequence + 1,
    lastSequence: priorSequence + 1,
    createdAt: now,
  };
  await store.commandReceipts.insertOne(receipt, { session });
  return { outcome: ackFromReceipt(receipt), events: [event] };
}

function gameStatus(state: GameState, previous: GameStatus): GameStatus {
  if (state.terminalReason === "NO_CONTEST") return "NO_CONTEST";
  if (state.terminalReason !== undefined || state.phase === "Finished") return "COMPLETED";
  if (previous === "LOBBY" && state.phase === "Lobby") return "LOBBY";
  return "ACTIVE";
}

/** Removes server-only replay facts before a domain event crosses the wire. */
export type PublicEventInput = DomainEvent & { readonly _id?: string };

export function publicEvent(event: PublicEventInput): DomainEvent {
  // Replay continuations and future deck state are intentionally absent from
  // public event ranges; the seat-scoped snapshot carries the current result.
  // ENG-022, PROTO-004.
  const { _id: _storageId, ...domainEvent } = event;
  const privateKeys = new Set([
    "deckOrders",
    "remainingCardIds",
    "discardCardIds",
    "remainingEffects",
    "resolvingCardStack",
  ]);
  const payload = Object.fromEntries(
    Object.entries(domainEvent.payload).filter(([key]) => !privateKeys.has(key)),
  );
  let nestedPayloadChanged = false;
  if (domainEvent.type === "CardDrawn" || domainEvent.type === "DetentionReleaseCardGranted") {
    delete payload.cardId;
    delete payload.retainable;
    delete payload.deckId;
  }
  if (domainEvent.type === "TradeProposed" || domainEvent.type === "TradeAccepted") {
    for (const key of ["offered", "requested"]) {
      const side = payload[key];
      if (typeof side !== "object" || side === null || Array.isArray(side)) continue;
      payload[key] = {
        ...(side as Record<string, unknown>),
        detentionReleaseCardIds: [],
      };
      nestedPayloadChanged = true;
    }
  }
  if (
    Object.keys(payload).length === Object.keys(domainEvent.payload).length &&
    !nestedPayloadChanged &&
    _storageId === undefined
  )
    return domainEvent;
  return DomainEvent.parse({ ...domainEvent, payload });
}

function toJournalEvents(
  gameId: string,
  priorSequence: number,
  nextVersion: number,
  events: readonly EngineEvent[],
  occurredAt: Date,
): readonly DomainEvent[] {
  const occurredAtText = occurredAt.toISOString();
  return events.map((event, index) =>
    DomainEvent.parse({
      gameId,
      sequence: priorSequence + index + 1,
      aggregateVersion: nextVersion,
      type: event.type,
      eventVersion: event.eventVersion,
      ...(event.actorSeatId === undefined ? {} : { actorSeatId: event.actorSeatId }),
      occurredAt: occurredAtText,
      payload: event.payload,
    }),
  );
}

function ackFromReceipt(receipt: CommandReceiptDocument): CommandAccepted {
  return {
    ok: true,
    commandId: receipt.commandId,
    aggregateVersion: receipt.aggregateVersion,
    firstSequence: receipt.firstSequence,
    lastSequence: receipt.lastSequence,
  };
}

async function transact(
  envelope: ParsedCommandEnvelope,
  actor: AuthenticatedSeat,
  store: CommandStore,
  session: ClientSession,
  now: Date,
  botDecision?: BotDecision,
): Promise<CommittedCommand> {
  // ENG-015 requires the receipt lookup to be the first aggregate read.
  const existing = await store.commandReceipts.findOne(
    { gameId: envelope.gameId, commandId: envelope.commandId },
    { session },
  );
  if (existing !== null) return { outcome: ackFromReceipt(existing), events: [] };

  const persistedGame = await store.games.findOne({ _id: envelope.gameId }, { session });
  if (persistedGame === null) throw new CommandPathError("NOT_FOUND", "GAME_NOT_FOUND");
  const game = { ...persistedGame, snapshot: normalizeGameState(persistedGame.snapshot) };
  if (game.expiresAt <= now) throw new CommandPathError("GAME_EXPIRED", "GAME_EXPIRED");
  if (game.status === "COMPLETED" || game.status === "NO_CONTEST" || game.status === "EXPIRED") {
    throw new CommandPathError("ILLEGAL_ACTION", "GAME_TERMINAL");
  }
  if (actor.gameId !== game._id || actor.seatId.length === 0) {
    throw new CommandPathError("FORBIDDEN", "CAPABILITY_SCOPE_MISMATCH");
  }
  const expectedCapability = hostCommand(envelope.payload)
    ? "host"
    : envelope.payload.type === "RequestSeatReclaim"
      ? "reclaim"
      : "seat";
  if (actor.kind !== expectedCapability) {
    throw new CommandPathError("FORBIDDEN", "CAPABILITY_KIND_MISMATCH");
  }
  if (envelope.expectedVersion !== game.aggregateVersion) {
    throw new CommandPathError("STALE_VERSION", "STALE_VERSION");
  }

  const rules = capturedRuleSet(game);
  if (rules === undefined) {
    throw new CommandPathError("CONTENT_UNSUPPORTED", "CAPTURED_RULES_UNSUPPORTED");
  }
  const priorVersion = game.aggregateVersion;
  const priorSequence = game.lastSequence;
  const resolution = resolve(
    game.snapshot,
    { actorSeatId: actor.seatId, command: envelope.payload },
    rules,
  );
  if (!resolution.ok) {
    return {
      outcome: { ok: false, code: resolution.code, reason: resolution.reasonCode },
      events: [],
    };
  }
  if (resolution.events.length === 0) {
    throw new CommandPathError("INTERNAL", "EMPTY_ENGINE_RESOLUTION");
  }

  const nextVersion = priorVersion + 1;
  const botDecisionEvent =
    botDecision === undefined
      ? undefined
      : DomainEvent.parse({
          gameId: game._id,
          sequence: priorSequence + 1,
          aggregateVersion: nextVersion,
          type: botDecision.event.type,
          eventVersion: botDecision.event.eventVersion,
          actorSeatId: botDecision.event.actorSeatId,
          occurredAt: now.toISOString(),
          payload: botDecision.event.payload,
        });
  const rulesConfiguredEvent =
    envelope.payload.type === "StartGame" && game.rulesConfigured !== true
      ? DomainEvent.parse({
          gameId: game._id,
          sequence: priorSequence + 1,
          aggregateVersion: nextVersion,
          type: "RulesConfigured",
          eventVersion: 1,
          actorSeatId: actor.seatId,
          occurredAt: now.toISOString(),
          payload: {
            configuration: rules.configuration,
            contentHash: game.contentHash,
          },
        })
      : undefined;
  const journalEvents = [
    ...(botDecisionEvent === undefined ? [] : [botDecisionEvent]),
    ...(rulesConfiguredEvent === undefined ? [] : [rulesConfiguredEvent]),
    ...toJournalEvents(
      game._id,
      priorSequence +
        (botDecisionEvent === undefined ? 0 : 1) +
        (rulesConfiguredEvent === undefined ? 0 : 1),
      nextVersion,
      resolution.events,
      now,
    ),
  ];
  const nextSequence = priorSequence + journalEvents.length;
  const nextState: GameState = Object.freeze({
    ...resolution.state,
    aggregateVersion: nextVersion,
  });
  assertInvariants(nextState, rules, game.snapshot);
  await store.gameEvents.insertMany(
    journalEvents.map((event) => ({ ...event })),
    { session, ordered: true },
  );

  const update: UpdateFilter<GameDocument> = {
    $set: {
      snapshot: nextState,
      status: gameStatus(nextState, game.status),
      aggregateVersion: nextVersion,
      lastSequence: nextSequence,
      ...(rulesConfiguredEvent === undefined ? {} : { rulesConfigured: true }),
      lastAuthoritativeActionAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  };
  const filter: Filter<GameDocument> = {
    _id: game._id,
    aggregateVersion: priorVersion,
    lastSequence: priorSequence,
  };
  const updated = await store.games.updateOne(filter, update, { session });
  if (updated.matchedCount !== 1) throw new CommandPathError("STALE_VERSION", "STALE_VERSION");

  const receipt: CommandReceiptDocument = {
    gameId: game._id,
    commandId: envelope.commandId,
    accepted: true,
    aggregateVersion: nextVersion,
    firstSequence: priorSequence + 1,
    lastSequence: nextSequence,
    createdAt: now,
  };
  await store.commandReceipts.insertOne(receipt, { session });
  return {
    outcome: {
      ok: true,
      commandId: envelope.commandId,
      aggregateVersion: nextVersion,
      firstSequence: receipt.firstSequence,
      lastSequence: nextSequence,
    },
    events: journalEvents,
  };
}

/**
 * Runs one command in one MongoDB session transaction.
 *
 *  1. Parse the request with CommandEnvelope; enforce body, nesting, and
 *     payload limits. (The caller does this and hands us the parsed envelope.)
 *  2. Authenticate the seat, host, or reclaim cookie. Derive the actor and the
 *     capability kind from the SERVER credential. Ignore every client-provided
 *     identity, seat, phase, and authorization claim.
 *  3. Start a session and a transaction. Read the command receipt FIRST, then
 *     load the game aggregate with its captured content, rules, and state
 *     versions.
 *  4. Reject an expired, terminal, unsupported, unauthorized, or stale
 *     aggregate. `expectedVersion` must match the stored aggregate version.
 *  5. Call the pure engine with the immutable snapshot, the validated
 *     actor-scoped command, and the captured RuleSet:
 *
 *         import { resolve } from "@blockparty/game-engine";
 *
 *  6. Insert the ordered domain events, update the snapshot and the aggregate
 *     version, write the durable command receipt and ACK, and commit.
 *  7. ONLY after commit, publish the committed range to local SSE subscribers
 *     and return the authoritative ACK.
 *
 * A duplicate committed commandId returns its stored receipt and event range
 * without running the engine again. A transient transaction retry reuses the
 * same command ID and expected version; it never re-runs against newly loaded
 * state as a new action.
 *
 * A safe-command-boundary operation (bot replacement, reclaim, host transfer,
 * EndNoContest) runs between transactions and never interrupts a partially
 * resolved effect queue. See PROTO-003.
 */
export async function handleCommand(
  envelope: ParsedCommandEnvelope,
  actor: AuthenticatedSeat,
  options: CommandPathOptions = {},
): Promise<CommandOutcome> {
  const parsed = CommandEnvelope.safeParse(envelope);
  if (!parsed.success) return { ok: false, code: "INVALID_ENVELOPE", reason: "INVALID_ENVELOPE" };

  const releaseCommand = admitCommand();
  if (releaseCommand === undefined) {
    return { ok: false, code: "SERVER_BUSY", reason: "SERVER_SHUTDOWN" };
  }

  const store = options.database ?? commandStore();
  const run = options.transaction ?? withMongoTransaction;
  const now = options.now?.() ?? new Date();
  const startedAt = Date.now();
  let transactionOutcome: TransactionOutcome = "failed";
  let transactionCode: ErrorCode | undefined;
  try {
    const committed = await run((session) =>
      parsed.data.payload.type === "ConfigureRules"
        ? transactLobbyConfiguration(parsed.data, actor, store, session, now)
        : recoveryCommand(parsed.data.payload)
          ? transactRecovery(parsed.data, actor, store, session, now)
          : transact(parsed.data, actor, store, session, now, options.botDecision),
    );
    const outcome = committed.outcome;
    transactionOutcome = outcome.ok ? "accepted" : "rejected";
    if (!outcome.ok) transactionCode = outcome.code;
    if (outcome.ok && committed.events.length > 0) {
      const safeEvents = committed.events.map(publicEvent);
      await (
        options.publish ??
        (() => {
          // The MongoDB change stream observes only committed inserts and
          // rebuilds an allowlisted snapshot per subscriber. See B6/PROTO-003.
          ensureChangeStream();
        })
      )(parsed.data.gameId, safeEvents);
    }
    return outcome;
  } catch (error) {
    if (error instanceof CommandPathError) {
      transactionOutcome = error.code === "STALE_VERSION" ? "conflict" : "rejected";
      transactionCode = error.code;
      return { ok: false, code: error.code, reason: error.reason };
    }
    return { ok: false, code: "SERVER_BUSY", reason: "COMMAND_TRANSACTION_FAILED" };
  } finally {
    observeTransaction(transactionOutcome, Date.now() - startedAt, transactionCode);
    releaseCommand();
  }
}
