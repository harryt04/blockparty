import "server-only";

/**
 * Read-only integrity checks for an isolated MongoDB restore. The operator
 * runs index maintenance before this verifier, so the report proves both the
 * durable shape and the application reader's ability to recover it. See
 * OPS-009, ENG-017, and SEC-005.
 */
import { DomainEvent, GameSnapshotProjection } from "@blockparty/contracts";
import {
  assertInvariants,
  deriveInitialState,
  replay,
  type GameState,
} from "@blockparty/game-engine";
import type { Collection, Db, Document } from "mongodb";
import { authorizedSnapshot } from "../sync/recovery";
import { capturedRuleSet } from "../games/captured-rules";
import type { GameDocument } from "../games/create-game";
import type { CommandReceiptDocument, GameEventDocument } from "../commands/handle-command";
import type {
  AuditDocument,
  CapabilityDocument,
  HostCapabilityDocument,
  InvitationDocument,
} from "../games/create-game";
import { COLLECTIONS, ensureIndexes, INDEXES } from "../db/collections";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type ReadCollection<T extends Document> = Pick<Collection<T>, "find" | "listIndexes">;

export interface RestoreIntegrityDatabase {
  readonly collection: Db["collection"];
}

export interface RestoreIntegrityReport {
  readonly gameCount: number;
  readonly eventCount: number;
  readonly receiptCount: number;
  readonly invitationCount: number;
  readonly capabilityCount: number;
  readonly hostCapabilityCount: number;
  readonly auditCount: number;
  readonly indexCount: number;
  readonly replayedGameCount: number;
  readonly completedGameCount: number;
  readonly readableCompletedGameCount: number;
}

export class RestoreIntegrityError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Restored dataset integrity failed: ${violations.join(", ")}`);
    this.name = "RestoreIntegrityError";
    this.violations = Object.freeze([...violations]);
  }
}

async function readAll<T extends Document>(collection: ReadCollection<T>): Promise<readonly T[]> {
  return (await collection.find({}).toArray()) as unknown as readonly T[];
}

function addViolation(violations: string[], code: string): void {
  if (!violations.includes(code)) violations.push(code);
}

function initialState(game: GameDocument): GameState {
  return {
    stateSchemaVersion: game.stateSchemaVersion,
    contentVersion: game.contentVersion,
    gameId: game._id,
    aggregateVersion: 0,
    phase: "Lobby",
    seats: game.snapshot.seats.map((seat) => ({
      seatId: seat.seatId,
      kind: seat.kind,
      status: "active" as const,
      balance: 0,
      position: 0,
      deedIds: [],
      detained: false,
      detentionTurnsRemaining: 0,
      detentionReleaseCardIds: [],
    })),
    deeds: [],
    bank: { cash: 0, deedIds: [], improvementInventory: {} },
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(game.secretSeed.value()),
  };
}

function capabilityFieldsAreSafe(document: CapabilityDocument | HostCapabilityDocument): boolean {
  const forbidden = new Set(["token", "rawToken", "capability", "cookie"]);
  return (
    /^[0-9a-f]{64}$/.test(document.tokenHash) &&
    Object.keys(document).every((key) => !forbidden.has(key))
  );
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

async function verifyIndexes(
  database: RestoreIntegrityDatabase,
  violations: string[],
): Promise<number> {
  // Compatibility/index maintenance is an explicit restore step, not an
  // application-start side effect. Re-running it is safe and idempotent.
  await ensureIndexes(database);
  let indexCount = 0;
  for (const [collectionName, definitions] of Object.entries(INDEXES)) {
    const collection = database.collection(collectionName);
    const indexes = await collection.listIndexes().toArray();
    const names = new Set(indexes.map((index) => index.name));
    indexCount += indexes.length;
    for (const definition of definitions) {
      if (definition.options.name === undefined || !names.has(definition.options.name)) {
        addViolation(violations, `INDEX_MISSING:${collectionName}`);
      }
    }
  }
  return indexCount;
}

function verifyRelatedReferences(
  gameIds: ReadonlySet<string>,
  documents: readonly { readonly gameId: string }[],
  code: string,
  violations: string[],
): void {
  for (const document of documents) {
    if (!gameIds.has(document.gameId)) addViolation(violations, code);
  }
}

function verifyJournal(
  games: readonly GameDocument[],
  events: readonly GameEventDocument[],
  receipts: readonly CommandReceiptDocument[],
  violations: string[],
): Map<string, readonly GameEventDocument[]> {
  const gameIds = new Set(games.map((game) => game._id));
  const eventsByGame = new Map<string, GameEventDocument[]>();
  const eventKeys = new Set<string>();

  for (const event of events) {
    const parsed = DomainEvent.safeParse(event);
    if (!parsed.success) {
      addViolation(violations, "EVENT_SCHEMA_INVALID");
      continue;
    }
    const key = `${event.gameId}:${event.sequence}`;
    if (eventKeys.has(key)) addViolation(violations, "EVENT_SEQUENCE_DUPLICATE");
    eventKeys.add(key);
    if (!gameIds.has(event.gameId)) addViolation(violations, "EVENT_GAME_MISSING");
    const group = eventsByGame.get(event.gameId) ?? [];
    group.push(event);
    eventsByGame.set(event.gameId, group);
  }

  const receiptsByGame = new Map<string, CommandReceiptDocument[]>();
  const receiptKeys = new Set<string>();
  for (const receipt of receipts) {
    const key = `${receipt.gameId}:${receipt.commandId}`;
    if (receiptKeys.has(key)) addViolation(violations, "RECEIPT_DUPLICATE");
    receiptKeys.add(key);
    if (!gameIds.has(receipt.gameId)) addViolation(violations, "RECEIPT_GAME_MISSING");
    const group = receiptsByGame.get(receipt.gameId) ?? [];
    group.push(receipt);
    receiptsByGame.set(receipt.gameId, group);
  }

  for (const game of games) {
    const gameEvents = [...(eventsByGame.get(game._id) ?? [])].sort(
      (left, right) => left.sequence - right.sequence,
    );
    const gameReceipts = receiptsByGame.get(game._id) ?? [];
    if (game.snapshot.aggregateVersion !== game.aggregateVersion) {
      addViolation(violations, "SNAPSHOT_VERSION_MISMATCH");
    }
    if (game.snapshot.gameId !== game._id || game.lastSequence !== gameEvents.length) {
      addViolation(violations, "JOURNAL_BOUNDARY_MISMATCH");
    }
    gameEvents.forEach((event, index) => {
      if (event.sequence !== index + 1 || event.aggregateVersion < 1) {
        addViolation(violations, "EVENT_SEQUENCE_GAP");
      }
      if (event.aggregateVersion > game.aggregateVersion) {
        addViolation(violations, "EVENT_VERSION_AHEAD");
      }
    });
    const lastEvent = gameEvents.at(-1);
    if (lastEvent !== undefined && lastEvent.aggregateVersion !== game.aggregateVersion) {
      addViolation(violations, "LAST_EVENT_VERSION_MISMATCH");
    }

    const coveredSequences = new Set<number>();
    for (const receipt of gameReceipts) {
      if (
        receipt.accepted !== true ||
        receipt.firstSequence < 1 ||
        receipt.lastSequence < receipt.firstSequence ||
        receipt.lastSequence > game.lastSequence ||
        receipt.aggregateVersion > game.aggregateVersion
      ) {
        addViolation(violations, "RECEIPT_RANGE_INVALID");
        continue;
      }
      for (let sequence = receipt.firstSequence; sequence <= receipt.lastSequence; sequence += 1) {
        const event = gameEvents[sequence - 1];
        if (event === undefined || event.aggregateVersion !== receipt.aggregateVersion) {
          addViolation(violations, "RECEIPT_EVENT_MISMATCH");
        }
        coveredSequences.add(sequence);
      }
    }
    if (coveredSequences.size !== gameEvents.length) addViolation(violations, "EVENT_UNRECEIPTED");
  }
  return eventsByGame;
}

/**
 * Verifies a restored database without returning game IDs, secrets, or
 * payloads. The same report is safe to attach to an operational drill record.
 */
export async function verifyRestoredDataset(
  database: RestoreIntegrityDatabase,
): Promise<RestoreIntegrityReport> {
  const [games, events, receipts, invitations, capabilities, hostCapabilities, auditLog] =
    await Promise.all([
      readAll(database.collection<GameDocument>(COLLECTIONS.games)),
      readAll(database.collection<GameEventDocument>(COLLECTIONS.gameEvents)),
      readAll(database.collection<CommandReceiptDocument>(COLLECTIONS.commandReceipts)),
      readAll(database.collection<InvitationDocument>(COLLECTIONS.invitations)),
      readAll(database.collection<CapabilityDocument>(COLLECTIONS.capabilities)),
      readAll(database.collection<HostCapabilityDocument>(COLLECTIONS.hostCapabilities)),
      readAll(database.collection<AuditDocument>(COLLECTIONS.auditLog)),
    ]);
  const violations: string[] = [];
  const gameIds = new Set(games.map((game) => game._id));
  const eventsByGame = verifyJournal(games, events, receipts, violations);

  verifyRelatedReferences(gameIds, invitations, "INVITATION_GAME_MISSING", violations);
  verifyRelatedReferences(gameIds, capabilities, "CAPABILITY_GAME_MISSING", violations);
  verifyRelatedReferences(gameIds, hostCapabilities, "HOST_CAPABILITY_GAME_MISSING", violations);
  verifyRelatedReferences(gameIds, auditLog, "AUDIT_GAME_MISSING", violations);
  const gameById = new Map(games.map((game) => [game._id, game]));
  for (const capability of capabilities) {
    if (!capabilityFieldsAreSafe(capability)) addViolation(violations, "CAPABILITY_SECRET_PRESENT");
    const game = gameById.get(capability.gameId);
    if (!game?.seats.some((seat) => seat.seatId === capability.seatId)) {
      addViolation(violations, "CAPABILITY_SEAT_MISSING");
    }
  }
  for (const capability of hostCapabilities) {
    if (!capabilityFieldsAreSafe(capability))
      addViolation(violations, "HOST_CAPABILITY_SECRET_PRESENT");
  }

  let replayedGameCount = 0;
  let completedGameCount = 0;
  let readableCompletedGameCount = 0;
  for (const game of games) {
    if (
      !validDate(game.createdAt) ||
      !validDate(game.lastAuthoritativeActionAt) ||
      !validDate(game.expiresAt)
    ) {
      addViolation(violations, "GAME_TIMESTAMP_INVALID");
    }
    if (game.lastAuthoritativeActionAt < game.createdAt)
      addViolation(violations, "GAME_TIME_ORDER_INVALID");
    if (
      validDate(game.lastAuthoritativeActionAt) &&
      validDate(game.expiresAt) &&
      game.expiresAt.getTime() !== game.lastAuthoritativeActionAt.getTime() + RETENTION_MS
    ) {
      addViolation(violations, "GAME_EXPIRY_BOUNDARY_INVALID");
    }
    const rules = capturedRuleSet(game);
    if (rules === undefined) {
      addViolation(violations, "CAPTURED_VERSION_INVALID");
      continue;
    }
    try {
      assertInvariants(game.snapshot, rules);
      const reconstructed = replay(initialState(game), eventsByGame.get(game._id) ?? [], rules);
      const comparable = {
        ...reconstructed,
        aggregateVersion: game.aggregateVersion,
        // Replay intentionally does not redraw or persist secret PRNG state.
        prng: game.snapshot.prng,
      };
      // GameState is JSON-serializable; JSON comparison intentionally ignores
      // absent optional fields while retaining every persisted value.
      if (JSON.stringify(comparable) !== JSON.stringify(game.snapshot)) {
        addViolation(violations, "SNAPSHOT_REPLAY_MISMATCH");
      }
      replayedGameCount += 1;
    } catch {
      addViolation(violations, "SNAPSHOT_REPLAY_INVALID");
    }

    if (game.status === "COMPLETED" || game.status === "NO_CONTEST") {
      completedGameCount += 1;
      const seatId = game.seats[0]?.seatId;
      const projection = seatId === undefined ? undefined : authorizedSnapshot(game, seatId);
      if (projection !== undefined && GameSnapshotProjection.safeParse(projection).success) {
        readableCompletedGameCount += 1;
      } else {
        addViolation(violations, "COMPLETED_GAME_NOT_READABLE");
      }
    }
  }
  const indexCount = await verifyIndexes(database, violations);
  if (violations.length > 0) throw new RestoreIntegrityError(violations);
  return {
    gameCount: games.length,
    eventCount: events.length,
    receiptCount: receipts.length,
    invitationCount: invitations.length,
    capabilityCount: capabilities.length,
    hostCapabilityCount: hostCapabilities.length,
    auditCount: auditLog.length,
    indexCount,
    replayedGameCount,
    completedGameCount,
    readableCompletedGameCount,
  };
}
