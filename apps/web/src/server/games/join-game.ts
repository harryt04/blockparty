import "server-only";

/**
 * Invite admission and seat claiming. The invite is an admission authority,
 * while the newly issued seat and reclaim capabilities are separate cookies.
 * See PRD-FUN-003/005, ENG-010, and SEC-002.
 */
import { type ClientSession, type Collection, type Filter, type UpdateFilter } from "mongodb";
import type {
  InviteStatusResponse,
  JoinGameRequest,
  LobbyProjection,
  SeatToken,
} from "@blockparty/contracts";
import {
  COOKIE_NAMES,
  COOKIE_OPTIONS,
  generateCapability,
  hashCapability,
} from "../auth/capabilities";
import type {
  AuditDocument,
  CapabilityDocument,
  GameDocument,
  GameSeatRecord,
  InvitationDocument,
} from "./create-game";

const RETENTION_ERROR_CODE = "NOT_FOUND" as const;

export class JoinUnavailableError extends Error {
  constructor() {
    super(RETENTION_ERROR_CODE);
    this.name = "JoinUnavailableError";
  }
}

export class JoinNameUnavailableError extends Error {
  constructor() {
    super("NAME_UNAVAILABLE");
    this.name = "JoinNameUnavailableError";
  }
}

export interface JoinStore {
  readonly games: Pick<Collection<GameDocument>, "findOne" | "updateOne">;
  readonly invitations: Pick<Collection<InvitationDocument>, "findOne">;
  readonly capabilities: Pick<Collection<CapabilityDocument>, "insertOne">;
  readonly auditLog: Pick<Collection<AuditDocument>, "insertOne">;
}

export interface IssuedJoinCapabilities {
  readonly seat: string;
  readonly reclaim: string;
}

export interface JoinedGame {
  readonly gameId: GameDocument["_id"];
  readonly seatId: GameSeatRecord["seatId"];
  readonly lobby: LobbyProjection;
  readonly capabilities: IssuedJoinCapabilities;
}

function sameToken(left: SeatToken, right: SeatToken): boolean {
  return (
    left.colorIndex === right.colorIndex &&
    left.shape === right.shape &&
    left.pattern === right.pattern
  );
}

function normalizedName(value: string): string {
  return value.toLowerCase();
}

function projectLobby(
  game: GameDocument,
  inviteId: string,
  seats: readonly GameSeatRecord[],
  viewerSeatId: GameSeatRecord["seatId"],
): LobbyProjection {
  const openSeatCount = seats.filter((seat) => seat.kind === "open").length;
  return {
    gameId: game._id,
    status: "LOBBY",
    ...(game.name === undefined ? {} : { name: game.name }),
    seatCount: game.seatCount,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      ...(seat.name === undefined ? {} : { name: seat.name }),
      kind: seat.kind,
      status: seat.status,
      token: seat.token,
      isHost: seat.seatId === game.hostSeatId,
      connected:
        seat.seatId === viewerSeatId ||
        seat.seatId === game.hostSeatId ||
        seat.kind === "bot" ||
        game.lobby.seats.find((previous) => previous.seatId === seat.seatId)?.connected === true,
      isSelf: seat.seatId === viewerSeatId,
    })),
    configuration: game.configuration,
    versions: game.lobby.versions,
    viewerSeatId,
    viewerIsHost: viewerSeatId === game.hostSeatId,
    invitePath: game.lobby.invitePath ?? `/join/${inviteId}`,
    canStart: openSeatCount === 0,
    ...(openSeatCount === 0
      ? {}
      : { startBlockedReason: "Every seat must be filled by a person or bot." }),
    expiresAt: game.expiresAt.toISOString(),
  };
}

function activeNameTaken(game: GameDocument, name: string): boolean {
  const normalized = normalizedName(name);
  return game.seats.some(
    (seat) =>
      seat.status === "active" &&
      seat.name !== undefined &&
      normalizedName(seat.name) === normalized,
  );
}

function capabilityDocument(
  token: string,
  gameId: GameDocument["_id"],
  seatId: GameSeatRecord["seatId"],
  kind: "seat" | "reclaim",
  now: Date,
  expiresAt: Date,
): CapabilityDocument {
  return {
    tokenHash: hashCapability(token),
    gameId,
    seatId,
    kind,
    status: "active",
    createdAt: now,
    expiresAt,
  };
}

/** Returns only the join-gate facts allowed before a seat is claimed. */
export async function getInviteStatus(
  store: Pick<JoinStore, "games" | "invitations">,
  inviteId: string,
  now = new Date(),
): Promise<InviteStatusResponse> {
  const invitation = await store.invitations.findOne({ inviteId });
  if (invitation === null || invitation.status !== "OPEN" || invitation.expiresAt <= now) {
    return { status: "INVALID" };
  }

  const game = await store.games.findOne({ _id: invitation.gameId });
  if (game === null || game.expiresAt <= now) return { status: "INVALID" };
  if (game.status === "ACTIVE") return { status: "STARTED" };
  if (game.status !== "LOBBY") return { status: "ENDED" };

  const openSeatCount = game.seats.filter((seat) => seat.kind === "open").length;
  if (openSeatCount === 0) return { status: "FULL" };

  return {
    status: "OPEN",
    ...(game.name === undefined ? {} : { gameName: game.name }),
    openSeatCount,
    seatCount: game.seatCount,
    configuration: game.configuration,
  };
}

/**
 * Claims one specific open token in the same transaction as the lobby update.
 * The expected seats array in the update predicate makes a stale concurrent
 * claimant fail instead of displacing the winner. See PRD-FUN-003 and SEC-002.
 */
export async function claimSeatInTransaction(
  store: JoinStore,
  session: ClientSession,
  inviteId: string,
  request: JoinGameRequest,
  now = new Date(),
): Promise<JoinedGame> {
  const invitation = await store.invitations.findOne({ inviteId }, { session });
  if (invitation === null || invitation.status !== "OPEN" || invitation.expiresAt <= now) {
    throw new JoinUnavailableError();
  }

  const game = await store.games.findOne({ _id: invitation.gameId }, { session });
  if (game === null || game.status !== "LOBBY" || game.expiresAt <= now) {
    throw new JoinUnavailableError();
  }
  if (activeNameTaken(game, request.name)) throw new JoinNameUnavailableError();

  const seat = game.seats.find(
    (candidate) => candidate.kind === "open" && sameToken(candidate.token, request.token),
  );
  if (seat === undefined) throw new JoinUnavailableError();

  const claimedSeat: GameSeatRecord = {
    ...seat,
    kind: "human",
    name: request.name,
  };
  const updatedSeats = game.seats.map((candidate) =>
    candidate.seatId === seat.seatId ? claimedSeat : candidate,
  );
  const snapshot = {
    ...game.snapshot,
    seats: game.snapshot.seats.map((candidate) =>
      candidate.seatId === seat.seatId ? { ...candidate, kind: "human" as const } : candidate,
    ),
  };
  const lobby = projectLobby(game, inviteId, updatedSeats, seat.seatId);

  const filter: Filter<GameDocument> = {
    _id: game._id,
    status: "LOBBY",
    seats: game.seats,
  };
  const update: UpdateFilter<GameDocument> = {
    $set: { seats: updatedSeats, lobby, snapshot },
  };
  const result = await store.games.updateOne(filter, update, { session });
  if (result.matchedCount !== 1) throw new JoinUnavailableError();

  const seatCapability = generateCapability();
  const reclaim = generateCapability();
  await store.capabilities.insertOne(
    capabilityDocument(seatCapability, game._id, seat.seatId, "seat", now, game.expiresAt),
    { session },
  );
  await store.capabilities.insertOne(
    capabilityDocument(reclaim, game._id, seat.seatId, "reclaim", now, game.expiresAt),
    { session },
  );
  await store.auditLog.insertOne(
    {
      gameId: game._id,
      seatId: seat.seatId,
      action: "game_joined",
      reasonCode: "JOIN",
      occurredAt: now,
    },
    { session },
  );

  return {
    gameId: game._id,
    seatId: seat.seatId,
    lobby,
    capabilities: { seat: seatCapability, reclaim },
  };
}

/** Set newly issued authorities only after the claim transaction commits. */
export function setJoinCookies(
  response: {
    cookies: { set: (name: string, value: string, options: typeof COOKIE_OPTIONS) => void };
  },
  capabilities: IssuedJoinCapabilities,
): void {
  response.cookies.set(COOKIE_NAMES.seat, capabilities.seat, COOKIE_OPTIONS);
  response.cookies.set(COOKIE_NAMES.reclaim, capabilities.reclaim, COOKIE_OPTIONS);
}
