import "server-only";

/**
 * SCAFFOLDING ONLY. DELETE THIS FILE.
 *
 * Every placeholder response in the app is built here, so making the routes
 * real is a deletion rather than a hunt. Nothing in here reads a database,
 * issues a capability, or calls the engine.
 *
 * When a route becomes real, remove its builder. When the last builder goes,
 * delete the file and this comment with it.
 */
import {
  DEFAULT_CONTENT_VERSION,
  PLACEHOLDER_BUNDLE,
} from "@blockparty/game-content";
import {
  ENGINE_VERSION,
  STATE_SCHEMA_VERSION,
} from "@blockparty/game-engine";
import {
  STANDARD_CONFIGURATION,
  type BoardSpaceProjection,
  type CapturedVersions,
  type GameSnapshotProjection,
  type LobbyProjection,
  type SeatProjection,
  type SummaryProjection,
} from "@blockparty/contracts";

export const STUB_VERSIONS: CapturedVersions = {
  contentVersion: DEFAULT_CONTENT_VERSION,
  rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
  variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
  stateSchemaVersion: STATE_SCHEMA_VERSION,
  engineVersion: ENGINE_VERSION,
};

/** Thirty days out, so the retention copy on each page has something to show. */
function stubExpiry(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

const SEAT_SHAPES = ["barricade", "cooler", "boombox", "hydrant", "flyer", "stoop"] as const;
const SEAT_PATTERNS = ["solid", "stripe", "dot", "cross", "chevron", "grid"] as const;

export function stubSeats(count = 4): SeatProjection[] {
  return Array.from({ length: count }, (_, index) => ({
    seatId: `seat-${index + 1}`,
    name: index === 0 ? "You" : `Player ${index + 1}`,
    kind: index < 3 ? ("human" as const) : ("bot" as const),
    status: "active" as const,
    token: {
      colorIndex: index + 1,
      shape: SEAT_SHAPES[index] ?? "barricade",
      pattern: SEAT_PATTERNS[index] ?? "solid",
    },
    balance: 150000,
    position: 0,
    detained: false,
    detentionReleaseCardCount: 0,
    deedIds: [],
    isHost: index === 0,
    connected: index !== 2,
    isSelf: index === 0,
  }));
}

/** The board projection, read from the placeholder content bundle. */
export function stubBoard(): BoardSpaceProjection[] {
  return PLACEHOLDER_BUNDLE.spaces.map((space) => {
    const deed =
      space.deedId === undefined
        ? undefined
        : PLACEHOLDER_BUNDLE.deeds.find((candidate) => candidate.deedId === space.deedId);

    return {
      spaceId: space.spaceId,
      routeIndex: space.routeIndex,
      name: space.name,
      category: space.type,
      ...(deed !== undefined ? { deedCategory: deed.category } : {}),
      ...(deed?.districtId !== undefined ? { districtId: deed.districtId } : {}),
      ...(deed !== undefined ? { price: deed.price } : {}),
      occupantSeatIds: space.routeIndex === 0 ? ["seat-1", "seat-2"] : [],
    };
  });
}

export function stubSnapshot(gameId: string): GameSnapshotProjection {
  return {
    gameId,
    status: "ACTIVE",
    phase: "AwaitRoll",
    aggregateVersion: 0,
    sequence: 0,
    versions: STUB_VERSIONS,
    configuration: STANDARD_CONFIGURATION,
    viewerSeatId: "seat-1",
    activeSeatId: "seat-1",
    prioritySeatId: "seat-1",
    seats: stubSeats(),
    board: stubBoard(),
    legalActions: [],
    actionAvailability: [
      {
        type: "RollDice",
        available: false,
        reasonCode: "ENGINE_SCAFFOLD",
        reason: "The rules engine is not built yet.",
      },
    ],
    paused: false,
    expiresAt: stubExpiry(),
  };
}

export function stubLobby(gameId: string): LobbyProjection {
  return {
    gameId,
    status: "LOBBY",
    name: "Placeholder lobby",
    seatCount: 4,
    seats: stubSeats(),
    configuration: STANDARD_CONFIGURATION,
    versions: STUB_VERSIONS,
    viewerSeatId: "seat-1",
    viewerIsHost: true,
    canStart: false,
    startBlockedReason: "The lobby is not connected to a database yet.",
    expiresAt: stubExpiry(),
  };
}

export function stubSummary(gameId: string): SummaryProjection {
  return {
    gameId,
    status: "COMPLETED",
    finishReason: "WINNER",
    winnerSeatId: "seat-1",
    standings: stubSeats().map((seat, index) => ({
      seatId: seat.seatId,
      ...(seat.name !== undefined ? { name: seat.name } : {}),
      rank: index + 1,
      finalBalance: 150000 - index * 30000,
      ...(seat.token !== undefined ? { token: seat.token } : {}),
    })),
    configuration: STANDARD_CONFIGURATION,
    durationSeconds: 0,
    expiresAt: stubExpiry(),
  };
}
