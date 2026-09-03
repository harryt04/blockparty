import "server-only";

/**
 * Creation persistence and projection seam. The route supplies the transaction;
 * this module keeps raw capability material in the short-lived return value so
 * the caller can put it in cookies after commit. MongoDB receives only hashes.
 * See PRD-FUN-001/002/013, ENG-010, and SEC-002.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Binary, type ClientSession, type Collection } from "mongodb";
import type {
  CreateGameRequest,
  LobbyProjection,
  RulesConfiguration,
  SeatToken,
} from "@blockparty/contracts";
import { DEFAULT_CONTENT_VERSION, canonicalHashBundle, getBundle } from "@blockparty/game-content";
import { ENGINE_VERSION, STATE_SCHEMA_VERSION } from "@blockparty/game-engine";
import {
  COOKIE_NAMES,
  COOKIE_OPTIONS,
  generateCapability,
  generateInviteId,
  hashCapability,
} from "../auth/capabilities";
import type { CapturedVersions, GameId, GameStatus, SeatId } from "@blockparty/contracts";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface GameSeatRecord {
  readonly seatId: SeatId;
  readonly kind: "human" | "bot" | "open";
  readonly status: "active";
  readonly name?: string;
  readonly token: SeatToken;
}

export interface GameDocument {
  readonly _id: GameId;
  readonly status: GameStatus;
  readonly name?: string;
  readonly seatCount: number;
  readonly seats: readonly GameSeatRecord[];
  readonly hostSeatId: SeatId;
  readonly configuration: RulesConfiguration;
  readonly contentHash: string;
  readonly contentVersion: string;
  readonly rulesSchemaVersion: string;
  readonly variantSchemaVersion: string;
  readonly stateSchemaVersion: string;
  readonly engineVersion: string;
  /** Server-only 256-bit seed. Never copied to a projection, log, or response. */
  readonly secretSeed: Binary;
  readonly lobby: LobbyProjection;
  readonly aggregateVersion: 0;
  readonly lastSequence: 0;
  readonly createdAt: Date;
  readonly lastAuthoritativeActionAt: Date;
  readonly expiresAt: Date;
}

export interface InvitationDocument {
  readonly _id?: string;
  readonly inviteId: string;
  readonly gameId: GameId;
  readonly status: "OPEN";
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface CapabilityDocument {
  readonly _id?: string;
  readonly tokenHash: string;
  readonly gameId: GameId;
  readonly seatId: SeatId;
  readonly kind: "seat" | "reclaim";
  readonly status: "active";
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface HostCapabilityDocument {
  readonly _id?: string;
  readonly tokenHash: string;
  readonly gameId: GameId;
  readonly seatId: SeatId;
  readonly status: "active";
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface AuditDocument {
  readonly _id?: string;
  readonly gameId: GameId;
  readonly seatId: SeatId;
  readonly action: "game_created" | "game_joined";
  readonly reasonCode: "CREATE" | "JOIN";
  readonly occurredAt: Date;
}

export interface CreationStore {
  readonly games: Pick<Collection<GameDocument>, "insertOne">;
  readonly invitations: Pick<Collection<InvitationDocument>, "insertOne">;
  readonly capabilities: Pick<Collection<CapabilityDocument>, "insertOne">;
  readonly hostCapabilities: Pick<Collection<HostCapabilityDocument>, "insertOne">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface IssuedCreationCapabilities {
  readonly seat: string;
  readonly host: string;
  readonly reclaim: string;
}

export interface CreatedGame {
  readonly lobby: LobbyProjection;
  readonly capabilities: IssuedCreationCapabilities;
}

const SEAT_SHAPES = ["barricade", "cooler", "boombox", "hydrant", "flyer", "stoop"] as const;
const SEAT_PATTERNS = ["solid", "stripe", "dot", "cross", "chevron", "grid"] as const;

function seatToken(index: number): SeatToken {
  return {
    colorIndex: index + 1,
    shape: SEAT_SHAPES[index]!,
    pattern: SEAT_PATTERNS[index]!,
  };
}

function createVersions(bundle: {
  contentVersion: string;
  rulesSchemaVersion: string;
  variantSchemaVersion: string;
}): CapturedVersions {
  return {
    contentVersion: bundle.contentVersion,
    rulesSchemaVersion: bundle.rulesSchemaVersion,
    variantSchemaVersion: bundle.variantSchemaVersion,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
  };
}

function buildSeats(request: CreateGameRequest): { seats: GameSeatRecord[]; hostSeatId: SeatId } {
  const seats: GameSeatRecord[] = [];
  let hostSeatId: SeatId | undefined;

  for (let index = 0; index < request.seatCount; index += 1) {
    const seatId = randomUUID();
    const token = seatToken(index);
    if (index === 0) {
      hostSeatId = seatId;
      seats.push({ seatId, kind: "human", status: "active", name: "Host", token });
    } else if (index <= request.botSeatCount) {
      seats.push({ seatId, kind: "bot", status: "active", name: `Bot ${index}`, token });
    } else {
      seats.push({ seatId, kind: "open", status: "active", token });
    }
  }

  if (hostSeatId === undefined) throw new Error("Creation requires a host seat");
  return { seats, hostSeatId };
}

function projectLobby(
  gameId: GameId,
  inviteId: string,
  request: CreateGameRequest,
  versions: CapturedVersions,
  seats: readonly GameSeatRecord[],
  hostSeatId: SeatId,
  expiresAt: Date,
): LobbyProjection {
  return {
    gameId,
    status: "LOBBY",
    ...(request.name === undefined || request.name.length === 0 ? {} : { name: request.name }),
    seatCount: request.seatCount,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      ...(seat.name === undefined ? {} : { name: seat.name }),
      kind: seat.kind,
      status: seat.status,
      token: seat.token,
      isHost: seat.seatId === hostSeatId,
      connected: seat.seatId === hostSeatId || seat.kind === "bot",
      isSelf: seat.seatId === hostSeatId,
    })),
    configuration: request.configuration,
    versions,
    viewerSeatId: hostSeatId,
    viewerIsHost: true,
    invitePath: `/join/${inviteId}`,
    canStart: seats.every((seat) => seat.kind !== "open"),
    ...(seats.every((seat) => seat.kind !== "open")
      ? {}
      : { startBlockedReason: "Every seat must be filled by a person or bot." }),
    expiresAt: expiresAt.toISOString(),
  };
}

function capabilityDocument(
  token: string,
  gameId: GameId,
  seatId: SeatId,
  kind: "seat" | "reclaim",
  createdAt: Date,
  expiresAt: Date,
): CapabilityDocument {
  return {
    tokenHash: hashCapability(token),
    gameId,
    seatId,
    kind,
    status: "active",
    createdAt,
    expiresAt,
  };
}

/**
 * Persists one complete lobby transaction. The returned raw values are
 * intentionally not part of any MongoDB document and must only be cookie-set
 * after the caller's transaction commits. See SEC-002.
 */
export async function createGameInTransaction(
  store: CreationStore,
  session: ClientSession,
  request: CreateGameRequest,
  now = new Date(),
  options: { readonly production?: boolean } = {},
): Promise<CreatedGame> {
  const bundle = getBundle(DEFAULT_CONTENT_VERSION, { production: options.production });
  if (bundle === undefined) throw new Error("CONTENT_UNSUPPORTED");

  const gameId = randomUUID() as GameId;
  const inviteId = generateInviteId();
  const createdAt = new Date(now.getTime());
  const expiresAt = new Date(createdAt.getTime() + RETENTION_MS);
  const versions = createVersions(bundle);
  const { seats, hostSeatId } = buildSeats(request);
  const seat = generateCapability();
  const host = generateCapability();
  const reclaim = generateCapability();
  const lobby = projectLobby(gameId, inviteId, request, versions, seats, hostSeatId, expiresAt);

  const game: GameDocument = {
    _id: gameId,
    status: "LOBBY",
    ...(request.name === undefined || request.name.length === 0 ? {} : { name: request.name }),
    seatCount: request.seatCount,
    seats,
    hostSeatId,
    configuration: request.configuration,
    contentHash: canonicalHashBundle(bundle),
    contentVersion: versions.contentVersion,
    rulesSchemaVersion: versions.rulesSchemaVersion,
    variantSchemaVersion: versions.variantSchemaVersion,
    stateSchemaVersion: versions.stateSchemaVersion,
    engineVersion: versions.engineVersion,
    secretSeed: new Binary(randomBytes(32)),
    lobby,
    aggregateVersion: 0,
    lastSequence: 0,
    createdAt,
    lastAuthoritativeActionAt: createdAt,
    expiresAt,
  };

  await store.games.insertOne(game, { session });
  await store.invitations.insertOne(
    { inviteId, gameId, status: "OPEN", createdAt, expiresAt },
    { session },
  );
  await store.capabilities.insertOne(
    capabilityDocument(seat, gameId, hostSeatId, "seat", createdAt, expiresAt),
    { session },
  );
  await store.capabilities.insertOne(
    capabilityDocument(reclaim, gameId, hostSeatId, "reclaim", createdAt, expiresAt),
    { session },
  );
  await store.hostCapabilities.insertOne(
    {
      tokenHash: hashCapability(host),
      gameId,
      seatId: hostSeatId,
      status: "active",
      createdAt,
      expiresAt,
    },
    { session },
  );
  await store.auditLog.insertOne(
    {
      gameId,
      seatId: hostSeatId,
      action: "game_created",
      reasonCode: "CREATE",
      occurredAt: createdAt,
    },
    { session },
  );

  return { lobby, capabilities: { seat, host, reclaim } };
}

/** Set only the three command/recovery cookies after the DB transaction commits. */
export function setCreationCookies(
  response: {
    cookies: { set: (name: string, value: string, options: typeof COOKIE_OPTIONS) => void };
  },
  capabilities: IssuedCreationCapabilities,
): void {
  response.cookies.set(COOKIE_NAMES.seat, capabilities.seat, COOKIE_OPTIONS);
  response.cookies.set(COOKIE_NAMES.host, capabilities.host, COOKIE_OPTIONS);
  response.cookies.set(COOKIE_NAMES.reclaim, capabilities.reclaim, COOKIE_OPTIONS);
}
