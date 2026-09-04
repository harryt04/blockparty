import "server-only";

/**
 * The presentation seam: internal state to an authorized projection.
 * See PROTO-004.
 *
 * A projection NEVER contains seed material, PRNG state, future deck order,
 * raw capabilities, token hashes, host or reclaim credentials, or another
 * seat's private state. Bots receive public state only. The server must never
 * serialize an internal full-state object to a client.
 *
 * Field names stay in the canonical wire layer. The UI maps them to display
 * names at the component boundary. See docs/product/glossary.md.
 */
import type {
  CapturedVersions,
  DomainEvent,
  GameSnapshotProjection,
  GameStatus,
  LobbyProjection,
  RulesConfiguration,
  SeatProjection,
  SeatToken,
  SummaryProjection,
} from "@blockparty/contracts";
import {
  actionAvailability,
  legalActions,
  type GameState,
  type RuleSet,
} from "@blockparty/game-engine";

export interface ProjectionSeatSource {
  readonly seatId: string;
  readonly kind: "human" | "bot" | "open";
  readonly name?: string;
  readonly token: SeatToken;
  readonly isHost: boolean;
  readonly connected: boolean;
}

export interface ProjectionContext {
  readonly rules: RuleSet;
  readonly status: GameStatus;
  readonly versions: CapturedVersions;
  readonly configuration: RulesConfiguration;
  readonly expiresAt: Date | string;
  readonly sequence: number;
  readonly seats: readonly ProjectionSeatSource[];
  readonly hostSeatId: string;
  readonly paused?: boolean;
  /** Already-redacted journal entries for the public history panel. */
  readonly publicEvents?: readonly DomainEvent[];
}

/**
 * Builds the snapshot one seat is authorized to see.
 *
 * Build the projection by CONSTRUCTING an allowed shape, never by deleting
 * fields from the state object: a spread-then-delete leaks every field a
 * later ticket adds. See PRD-FUN-009/010, ENG-010, PROTO-004, and SEC-002.
 */
export function buildSeatProjection(
  state: GameState,
  viewerSeatId: string | undefined,
  context: ProjectionContext,
): GameSnapshotProjection {
  const sourceBySeatId = new Map(context.seats.map((seat) => [seat.seatId, seat]));
  const seats: SeatProjection[] = state.seats.map((seat) => {
    const source = sourceBySeatId.get(seat.seatId);
    return {
      seatId: seat.seatId,
      ...(source?.name === undefined ? {} : { name: source.name }),
      kind: seat.kind,
      status: seat.status,
      ...(source === undefined ? {} : { token: source.token }),
      ...(state.phase === "Lobby" ? {} : { balance: seat.balance }),
      ...(state.phase === "Lobby" ? {} : { position: seat.position }),
      ...(state.phase === "Lobby" ? {} : { detained: seat.detained }),
      ...(state.phase === "Lobby"
        ? {}
        : { detentionReleaseCardCount: seat.detentionReleaseCardIds.length }),
      ...(state.phase === "Lobby" ? {} : { deedIds: [...seat.deedIds] }),
      isHost: source?.isHost ?? seat.seatId === context.hostSeatId,
      connected: source?.connected ?? false,
      isSelf: seat.seatId === viewerSeatId,
    };
  });

  const deedById = new Map(context.rules.content.deeds.map((deed) => [deed.deedId, deed]));
  const deedStateById = new Map(state.deeds.map((deed) => [deed.deedId, deed]));
  const occupantsByPosition = new Map<number, string[]>();
  if (state.phase !== "Lobby") {
    for (const seat of state.seats) {
      const occupants = occupantsByPosition.get(seat.position) ?? [];
      occupants.push(seat.seatId);
      occupantsByPosition.set(seat.position, occupants);
    }
  }
  const board = context.rules.content.spaces.map((space) => {
    const deed = space.deedId === undefined ? undefined : deedById.get(space.deedId);
    const deedState = space.deedId === undefined ? undefined : deedStateById.get(space.deedId);
    return {
      spaceId: space.spaceId,
      routeIndex: space.routeIndex,
      name: space.name,
      category: space.type,
      ...(space.deedId === undefined ? {} : { deedId: space.deedId }),
      ...(deed === undefined ? {} : { deedCategory: deed.category, price: deed.price }),
      ...(deed?.districtId === undefined ? {} : { districtId: deed.districtId }),
      ...(deedState?.ownerSeatId === undefined ? {} : { ownerSeatId: deedState.ownerSeatId }),
      ...(deedState === undefined
        ? {}
        : {
            mortgaged: deedState.mortgaged,
            improvementLevel: deedState.improvementLevel,
          }),
      occupantSeatIds: occupantsByPosition.get(space.routeIndex) ?? [],
    };
  });

  const auction = auctionProjection(state);
  const obligation =
    state.obligation === undefined
      ? undefined
      : {
          amount: state.obligation.amount,
          ...(state.obligation.creditorSeatId === undefined
            ? {}
            : { creditorSeatId: state.obligation.creditorSeatId }),
          reasonCode: state.obligation.reasonCode,
          reason: obligationReason(state.obligation.reasonCode),
        };

  const projection: GameSnapshotProjection = {
    gameId: state.gameId,
    status: context.status,
    phase: state.phase,
    aggregateVersion: state.aggregateVersion,
    sequence: context.sequence,
    versions: context.versions,
    configuration: context.configuration,
    ...(viewerSeatId === undefined ? {} : { viewerSeatId }),
    ...(state.activeSeatId === undefined ? {} : { activeSeatId: state.activeSeatId }),
    ...(state.prioritySeatId === undefined ? {} : { prioritySeatId: state.prioritySeatId }),
    seats,
    board,
    bank: {
      cash: state.bank.cash,
      deedIds: [...state.bank.deedIds],
      improvementInventory: { ...state.bank.improvementInventory },
    },
    ...(context.publicEvents === undefined ? {} : { publicEvents: [...context.publicEvents] }),
    ...(auction === undefined ? {} : { auction }),
    ...(obligation === undefined ? {} : { obligation }),
    legalActions:
      viewerSeatId === undefined ? [] : [...legalActions(state, viewerSeatId, context.rules)],
    actionAvailability:
      viewerSeatId === undefined ? [] : [...actionAvailability(state, viewerSeatId, context.rules)],
    paused: context.paused ?? false,
    expiresAt: toIsoDate(context.expiresAt),
  };
  return projection;
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function auctionProjection(state: GameState): GameSnapshotProjection["auction"] {
  const auction = state.pendingAuction;
  if (auction !== undefined) {
    return {
      deedId: auction.deedId,
      ...(auction.highBidderSeatId === undefined
        ? {}
        : { highBidderSeatId: auction.highBidderSeatId }),
      ...(auction.highBid === 0 ? {} : { highBid: auction.highBid }),
      minimumNextBid: auction.highBid + 1,
      prioritySeatId: auction.prioritySeatId,
      passedSeatIds: [...auction.passedSeatIds],
    };
  }
  const improvementAuction = state.pendingImprovementAuction;
  const firstDemand = improvementAuction?.demands[0];
  if (improvementAuction === undefined || firstDemand === undefined) return undefined;
  return {
    deedId: firstDemand.deedId,
    ...(improvementAuction.highBidderSeatId === undefined
      ? {}
      : { highBidderSeatId: improvementAuction.highBidderSeatId }),
    ...(improvementAuction.highBid === 0 ? {} : { highBid: improvementAuction.highBid }),
    minimumNextBid: improvementAuction.highBid + 1,
    prioritySeatId: improvementAuction.prioritySeatId,
    passedSeatIds: [...improvementAuction.passedSeatIds],
  };
}

function obligationReason(reasonCode: string): string {
  const reasons: Readonly<Record<string, string>> = {
    RENT: "A rent payment is due.",
    CARD_PAY_BANK: "A card payment is due to the bank.",
    CARD_PAY_EACH_PLAYER: "A card payment is due to another player.",
    CARD_COLLECT_EACH_PLAYER: "A card payment is due to another player.",
    CARD_REPAIR_CHARGE: "A repair charge is due to the bank.",
    DETENTION_RELEASE_FEE: "The Detention release fee is due.",
    MORTGAGED_DEED_TRANSFER_CHARGE: "A mortgaged-deed transfer charge is due.",
  };
  return reasons[reasonCode] ?? "A required payment is due.";
}

/** A lobby projection is also constructed from an allowlist. See ENG-010. */
export function buildLobbyProjection(source: {
  readonly gameId: string;
  readonly status: "LOBBY";
  readonly name?: string;
  readonly seatCount: number;
  readonly configuration: RulesConfiguration;
  readonly versions: CapturedVersions;
  readonly seats: readonly SeatProjection[];
  readonly viewerSeatId?: string;
  readonly viewerIsHost: boolean;
  readonly invitePath?: string;
  readonly canStart: boolean;
  readonly startBlockedReason?: string;
  readonly expiresAt: Date | string;
}): LobbyProjection {
  return {
    gameId: source.gameId,
    status: source.status,
    ...(source.name === undefined ? {} : { name: source.name }),
    seatCount: source.seatCount,
    seats: source.seats.map((seat) => ({
      seatId: seat.seatId,
      ...(seat.name === undefined ? {} : { name: seat.name }),
      kind: seat.kind,
      status: seat.status,
      ...(seat.token === undefined ? {} : { token: seat.token }),
      isHost: seat.isHost,
      connected: seat.connected,
      isSelf: seat.isSelf,
    })),
    configuration: source.configuration,
    versions: source.versions,
    ...(source.viewerSeatId === undefined ? {} : { viewerSeatId: source.viewerSeatId }),
    viewerIsHost: source.viewerIsHost,
    ...(source.invitePath === undefined ? {} : { invitePath: source.invitePath }),
    canStart: source.canStart,
    ...(source.startBlockedReason === undefined
      ? {}
      : { startBlockedReason: source.startBlockedReason }),
    expiresAt: toIsoDate(source.expiresAt),
  };
}

/** Completed-game summaries expose standings, never the authoritative state. */
export function buildSummaryProjection(source: {
  readonly gameId: string;
  readonly status: "COMPLETED" | "NO_CONTEST" | "EXPIRED";
  readonly state: GameState;
  readonly configuration: RulesConfiguration;
  readonly durationSeconds: number;
  readonly expiresAt: Date | string;
  readonly seats: readonly ProjectionSeatSource[];
}): SummaryProjection {
  const sourceBySeatId = new Map(source.seats.map((seat) => [seat.seatId, seat]));
  const eliminationOrder = source.state.eliminationOrder ?? [];
  const order = [...source.state.seats]
    .sort((left, right) => {
      const leftIndex = eliminationOrder.indexOf(left.seatId);
      const rightIndex = eliminationOrder.indexOf(right.seatId);
      return (
        (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    })
    .reverse();
  const finishReason =
    source.status === "NO_CONTEST"
      ? "NO_CONTEST"
      : source.status === "EXPIRED"
        ? "EXPIRED"
        : source.state.winnerSeatId === undefined
          ? "NO_WINNER"
          : "WINNER";
  return {
    gameId: source.gameId,
    status: source.status,
    finishReason,
    ...(source.state.winnerSeatId === undefined ? {} : { winnerSeatId: source.state.winnerSeatId }),
    standings: order.map((seat, index) => {
      const identity = sourceBySeatId.get(seat.seatId);
      return {
        seatId: seat.seatId,
        ...(identity?.name === undefined ? {} : { name: identity.name }),
        rank: index + 1,
        finalBalance: seat.balance,
        ...(identity === undefined ? {} : { token: identity.token }),
      };
    }),
    configuration: source.configuration,
    durationSeconds: source.durationSeconds,
    expiresAt: toIsoDate(source.expiresAt),
  };
}
