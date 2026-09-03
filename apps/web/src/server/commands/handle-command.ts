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
import { canonicalHashBundle, getBundle, type ContentBundle } from "@blockparty/game-content";
import {
  assertInvariants,
  resolve,
  type EngineEvent,
  type GameState,
  type RuleSet,
} from "@blockparty/game-engine";
import type { ClientSession, Collection, Filter, UpdateFilter } from "mongodb";
import { isProduction } from "../env";
import { getDb, withMongoTransaction } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import type { GameDocument } from "../games/create-game";
import type { AuthenticatedSeat } from "../auth/session";
import { ensureChangeStream } from "../sse/change-stream";

export interface CommandAccepted {
  readonly ok: true;
  readonly commandId: string;
  readonly aggregateVersion: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
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
}

export interface CommandPathOptions {
  readonly database?: CommandStore;
  readonly transaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  readonly now?: () => Date;
  readonly publish?: (gameId: string, events: readonly DomainEvent[]) => void | Promise<void>;
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
  };
}

function hostCommand(command: ParsedCommandEnvelope["payload"]): boolean {
  return (HOST_ONLY_COMMANDS as readonly string[]).includes(command.type);
}

function gameStatus(state: GameState, previous: GameStatus): GameStatus {
  if (state.terminalReason === "NO_CONTEST") return "NO_CONTEST";
  if (state.terminalReason !== undefined || state.phase === "Finished") return "COMPLETED";
  if (previous === "LOBBY" && state.phase === "Lobby") return "LOBBY";
  return "ACTIVE";
}

function capturedRuleSet(game: GameDocument): RuleSet {
  const bundle: ContentBundle | undefined = getBundle(game.contentVersion, {
    production: isProduction,
  });
  if (
    bundle === undefined ||
    game.contentHash !== canonicalHashBundle(bundle) ||
    game.snapshot.contentVersion !== game.contentVersion
  ) {
    throw new CommandPathError("CONTENT_UNSUPPORTED", "CAPTURED_CONTENT_UNSUPPORTED");
  }
  if (game.snapshot.stateSchemaVersion !== game.stateSchemaVersion) {
    throw new CommandPathError("CONTENT_UNSUPPORTED", "CAPTURED_STATE_UNSUPPORTED");
  }
  return { content: bundle, configuration: game.configuration };
}

function publicEvent(event: DomainEvent): DomainEvent {
  // GameStarted records shuffled order for replay, but future deck order is a
  // server secret. B5 replaces this with a per-seat projection. ENG-022.
  if (event.type !== "GameStarted" || !("deckOrders" in event.payload)) return event;
  const payload = { ...event.payload };
  delete payload.deckOrders;
  return DomainEvent.parse({ ...event, payload });
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
): Promise<CommittedCommand> {
  // ENG-015 requires the receipt lookup to be the first aggregate read.
  const existing = await store.commandReceipts.findOne(
    { gameId: envelope.gameId, commandId: envelope.commandId },
    { session },
  );
  if (existing !== null) return { outcome: ackFromReceipt(existing), events: [] };

  const game = await store.games.findOne({ _id: envelope.gameId }, { session });
  if (game === null) throw new CommandPathError("NOT_FOUND", "GAME_NOT_FOUND");
  if (game.expiresAt <= now) throw new CommandPathError("GAME_EXPIRED", "GAME_EXPIRED");
  if (game.status === "COMPLETED" || game.status === "NO_CONTEST" || game.status === "EXPIRED") {
    throw new CommandPathError("ILLEGAL_ACTION", "GAME_TERMINAL");
  }
  if (actor.gameId !== game._id || actor.seatId.length === 0) {
    throw new CommandPathError("FORBIDDEN", "CAPABILITY_SCOPE_MISMATCH");
  }
  if (hostCommand(envelope.payload) !== (actor.kind === "host")) {
    throw new CommandPathError("FORBIDDEN", "CAPABILITY_KIND_MISMATCH");
  }
  if (envelope.expectedVersion !== game.aggregateVersion) {
    throw new CommandPathError("STALE_VERSION", "STALE_VERSION");
  }

  const rules = capturedRuleSet(game);
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
  const nextSequence = priorSequence + resolution.events.length;
  const nextState: GameState = Object.freeze({
    ...resolution.state,
    aggregateVersion: nextVersion,
  });
  assertInvariants(nextState, rules, game.snapshot);
  const journalEvents = toJournalEvents(
    game._id,
    priorSequence,
    nextVersion,
    resolution.events,
    now,
  );
  await store.gameEvents.insertMany(journalEvents, { session, ordered: true });

  const update: UpdateFilter<GameDocument> = {
    $set: {
      snapshot: nextState,
      status: gameStatus(nextState, game.status),
      aggregateVersion: nextVersion,
      lastSequence: nextSequence,
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

  const store = options.database ?? commandStore();
  const run = options.transaction ?? withMongoTransaction;
  const now = options.now?.() ?? new Date();
  try {
    const committed = await run((session) => transact(parsed.data, actor, store, session, now));
    const outcome = committed.outcome;
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
      return { ok: false, code: error.code, reason: error.reason };
    }
    return { ok: false, code: "SERVER_BUSY", reason: "COMMAND_TRANSACTION_FAILED" };
  }
}
