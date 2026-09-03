/**
 * @blockparty/game-engine
 *
 * A pure TypeScript reducer. See ENG-020.
 *
 * It performs no IO, no date read, no `Math.random`, no mutation, no logging,
 * no database work, and no authorization-token check. The server authorizes
 * identity and seat ownership BEFORE calling `resolve`; the engine then
 * independently rejects actions that are not legal for that seat and phase.
 *
 * Engine events are semantic (`DiceRolled`, `RentPaid`), never transport
 * events. The server assigns journal sequence and aggregate version after
 * resolution; the engine does not know they exist.
 *
 * SCAFFOLD: every entry point carries its real signature and returns a typed
 * UNIMPLEMENTED rejection. Rules land ticket by ticket behind these seams.
 */
import type {
  ActorScopedCommand,
  CommandType,
  DomainEventType,
  Money,
  Phase,
  RulesConfiguration,
  SeatId,
} from "@blockparty/contracts";
import type { ContentBundle } from "@blockparty/game-content";
import { nextInt, type PrngState } from "./prng";

export * from "./prng";
export * from "./invariants";

export const ENGINE_VERSION = "0.1.0";
export const STATE_SCHEMA_VERSION = "1.0.0";

/**
 * The resolved rules the engine runs under: the immutable content bundle plus
 * the configuration captured at start. A resumed game passes its captured
 * versions here, never current deployment defaults. See VAR-011.
 */
export interface RuleSet {
  readonly content: ContentBundle;
  readonly configuration: RulesConfiguration;
}

export interface SeatState {
  readonly seatId: SeatId;
  readonly kind: "human" | "bot";
  readonly status: "active" | "eliminated";
  readonly balance: Money;
  readonly position: number;
  readonly deedIds: readonly string[];
  readonly detained: boolean;
  readonly detentionTurnsRemaining: number;
  readonly detentionReleaseCardIds: readonly string[];
}

/**
 * The authoritative game state. See ENG-021.
 *
 * `seed` and `prng` are secret server data. They are excluded from every
 * projection, analytics event, URL, and log. See ENG-022 and PROTO-004.
 *
 * SCAFFOLD: ownership, decks, auctions, trades, the pending choice, and the
 * effect-queue continuation are added by the tickets that implement them.
 */
export interface GameState {
  readonly stateSchemaVersion: string;
  readonly contentVersion: string;
  readonly gameId: string;
  readonly aggregateVersion: number;
  readonly phase: Phase;
  readonly seats: readonly SeatState[];
  readonly activeSeatId?: SeatId;
  readonly prioritySeatId?: SeatId;
  /** Number of consecutive matching rolls by the active seat. See RULE-002. */
  readonly consecutiveMatchingRolls: number;
  /** The last committed roll, if this game has rolled dice. */
  readonly lastRoll?: readonly [number, number];
  /** Server-only. Never projected. */
  readonly prng: PrngState;
}

/** An event the engine emits. The server adds sequence and version after. */
export interface EngineEvent {
  readonly type: DomainEventType;
  readonly eventVersion: number;
  readonly actorSeatId?: SeatId;
  readonly payload: Readonly<Record<string, unknown>>;
}

function payloadSeatId(event: EngineEvent, key: string): SeatId | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function payloadNumber(event: EngineEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function payloadSeatOrder(event: EngineEvent): readonly SeatId[] | undefined {
  const value = event.payload.seatOrder;
  if (
    !Array.isArray(value) ||
    !value.every((seatId): seatId is SeatId => typeof seatId === "string")
  ) {
    return undefined;
  }
  return value;
}

function payloadDice(event: EngineEvent): readonly [number, number] | undefined {
  const value = event.payload.dice;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((die): die is number => Number.isInteger(die) && die >= 1 && die <= 6)
  ) {
    return undefined;
  }
  return [value[0] as number, value[1] as number];
}

function freezeState(state: GameState): GameState {
  const seats = state.seats.map((seat) =>
    Object.freeze({
      ...seat,
      deedIds: Object.freeze([...seat.deedIds]),
      detentionReleaseCardIds: Object.freeze([...seat.detentionReleaseCardIds]),
    }),
  );
  const lastRoll =
    state.lastRoll === undefined
      ? undefined
      : (Object.freeze([state.lastRoll[0], state.lastRoll[1]]) as readonly [number, number]);
  return Object.freeze({
    ...state,
    seats: Object.freeze(seats),
    lastRoll,
  });
}

function freezeEvent(event: EngineEvent): EngineEvent {
  const freeze = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
    if (Array.isArray(value)) value.forEach(freeze);
    else Object.values(value).forEach(freeze);
    return Object.freeze(value);
  };
  return freeze({ ...event, payload: { ...event.payload } }) as EngineEvent;
}

/**
 * The event-only foundation for replay. Rule tickets extend this reducer with
 * their state transitions; random events are deliberately never re-drawn.
 */
function applyEvent(state: GameState, event: EngineEvent): GameState {
  switch (event.type) {
    case "GameStarted": {
      const order = payloadSeatOrder(event);
      const startingCash = payloadNumber(event, "startingCash");
      const startingPosition = payloadNumber(event, "startingPosition");
      const seatsById = new Map(state.seats.map((seat) => [seat.seatId, seat]));
      const orderedSeats = order?.map((seatId) => seatsById.get(seatId)).filter(Boolean) as
        readonly SeatState[] | undefined;
      const seats =
        orderedSeats !== undefined && orderedSeats.length === state.seats.length
          ? orderedSeats.map((seat) => ({
              ...seat,
              status: "active" as const,
              balance: startingCash ?? seat.balance,
              position: startingPosition ?? seat.position,
              deedIds: [],
              detained: false,
              detentionTurnsRemaining: 0,
              detentionReleaseCardIds: [],
            }))
          : state.seats;
      return freezeState({
        ...state,
        seats,
        phase: "AwaitRoll",
        activeSeatId: payloadSeatId(event, "firstSeatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "firstSeatId") ?? state.prioritySeatId,
        consecutiveMatchingRolls: 0,
        lastRoll: undefined,
      });
    }
    case "TurnStarted":
      return freezeState({
        ...state,
        phase: "AwaitRoll",
        activeSeatId: payloadSeatId(event, "seatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "seatId") ?? state.prioritySeatId,
      });
    case "DiceRolled": {
      // Dice values are event data. Replay changes no PRNG state and never
      // asks the random source to reconstruct the recorded outcome. ENG-022.
      const dice = payloadDice(event);
      const matchingRolls = payloadNumber(event, "consecutiveMatchingRolls");
      return freezeState({
        ...state,
        phase: "ResolveMove",
        lastRoll: dice,
        consecutiveMatchingRolls: matchingRolls ?? state.consecutiveMatchingRolls,
      });
    }
    case "DetentionEntered": {
      const seatId = payloadSeatId(event, "seatId");
      const position = payloadNumber(event, "position");
      if (seatId === undefined) return state;
      return freezeState({
        ...state,
        phase: "TurnEnd",
        seats: state.seats.map((seat) =>
          seat.seatId === seatId
            ? {
                ...seat,
                position: position ?? seat.position,
                detained: true,
                detentionTurnsRemaining: 0,
              }
            : seat,
        ),
      });
    }
    case "TurnEnded":
      return freezeState({
        ...state,
        phase: "TurnStart",
        activeSeatId: payloadSeatId(event, "nextSeatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "nextSeatId") ?? state.prioritySeatId,
      });
    case "GameCompleted":
    case "GameEndedNoContest":
      return freezeState({ ...state, phase: "Finished" });
    default:
      return state;
  }
}

export interface Rejection {
  readonly ok: false;
  /** A contracts ErrorCode the server maps to an HTTP status. */
  readonly code: "ILLEGAL_ACTION" | "PHASE_MISMATCH" | "INVALID_PAYLOAD" | "UNIMPLEMENTED";
  readonly reasonCode: string;
  readonly message: string;
}

export interface Acceptance {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

export type Resolution = Acceptance | Rejection;

export interface LegalAction {
  readonly type: CommandType;
  readonly constraints?: Readonly<Record<string, number | string | boolean>>;
}

export interface ActionAvailability {
  readonly type: CommandType;
  readonly available: false;
  readonly reasonCode: string;
  readonly reason: string;
}

const unimplemented = (surface: string): Rejection => ({
  ok: false,
  code: "UNIMPLEMENTED",
  reasonCode: "ENGINE_SCAFFOLD",
  message: `${surface} is not implemented yet. See docs/engineering/game-engine.md.`,
});

const reject = (code: Rejection["code"], reasonCode: string, message: string): Rejection => ({
  ok: false,
  code,
  reasonCode,
  message,
});

function findSeat(state: GameState, seatId: SeatId): SeatState | undefined {
  return state.seats.find((seat) => seat.seatId === seatId);
}

function requireActiveActor(state: GameState, actorSeatId: SeatId): Rejection | undefined {
  // Authorization belongs to the server, but the reducer independently
  // rejects unknown or inactive seats. ENG-020, ENG-023, RULE-001.
  const seat = findSeat(state, actorSeatId);
  if (seat === undefined) {
    return reject("ILLEGAL_ACTION", "UNKNOWN_SEAT", "The actor seat is not part of this game.");
  }
  if (seat.status !== "active") {
    return reject("ILLEGAL_ACTION", "SEAT_NOT_ACTIVE", "Only an active seat may act.");
  }
  return undefined;
}

function resolveStartGame(state: GameState, actorSeatId: SeatId, rules: RuleSet): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "Lobby") {
    return reject(
      "PHASE_MISMATCH",
      "START_REQUIRES_LOBBY",
      "A game can only start from the lobby.",
    );
  }

  const activeSeats = state.seats.filter((seat) => seat.status === "active");
  if (activeSeats.length < 2) {
    return reject(
      "ILLEGAL_ACTION",
      "INSUFFICIENT_SEATS",
      "At least two active seats are required.",
    );
  }
  if (
    // Balances are integer minor units; content validation is not a substitute
    // for the reducer's own boundary check. RULE-003.
    !Number.isSafeInteger(rules.content.economy.startingCash) ||
    rules.content.economy.startingCash < 0
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_STARTING_CASH",
      "The content bundle has invalid starting cash.",
    );
  }
  const startPosition = rules.content.spaces.find(
    (space) => space.spaceId === rules.content.startSpaceId,
  )?.routeIndex;
  if (startPosition === undefined || !Number.isSafeInteger(startPosition) || startPosition < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_START_SPACE",
      "The content bundle has no valid Start position.",
    );
  }

  // Each seat receives a recorded random priority. Equal priorities use the
  // canonical seat ID as a stable tie-break, so setup never depends on sort
  // implementation details. RULE-002, ENG-021.
  let prng = state.prng;
  const draws: number[] = [];
  const ranked = activeSeats.map((seat) => {
    const draw = nextInt(prng, Number.MAX_SAFE_INTEGER);
    prng = draw.next;
    draws.push(draw.value);
    return { seat, value: draw.value };
  });
  ranked.sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return left.seat.seatId < right.seat.seatId ? -1 : left.seat.seatId > right.seat.seatId ? 1 : 0;
  });
  const orderedSeats = ranked.map(({ seat }) => ({
    ...seat,
    balance: rules.content.economy.startingCash,
    position: startPosition,
    deedIds: [],
    detained: false,
    detentionTurnsRemaining: 0,
    detentionReleaseCardIds: [],
  }));
  const firstSeatId = orderedSeats[0]?.seatId;
  if (firstSeatId === undefined) {
    return reject("INVALID_PAYLOAD", "NO_FIRST_SEAT", "The game has no eligible first seat.");
  }

  const nextState = freezeState({
    ...state,
    seats: orderedSeats,
    phase: "AwaitRoll",
    activeSeatId: firstSeatId,
    prioritySeatId: firstSeatId,
    consecutiveMatchingRolls: 0,
    lastRoll: undefined,
    prng,
  });
  const events = [
    freezeEvent({
      type: "GameStarted",
      eventVersion: 1,
      actorSeatId,
      payload: {
        seatOrder: orderedSeats.map((seat) => seat.seatId),
        orderDraw: draws,
        firstSeatId,
        startingCash: rules.content.economy.startingCash,
        startingPosition: startPosition,
      },
    }),
    freezeEvent({
      type: "TurnStarted",
      eventVersion: 1,
      actorSeatId: firstSeatId,
      payload: { seatId: firstSeatId },
    }),
  ];
  return { ok: true, state: nextState, events: Object.freeze(events) };
}

function resolveRollDice(state: GameState, actorSeatId: SeatId, rules: RuleSet): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "AwaitRoll") {
    return reject(
      "PHASE_MISMATCH",
      "ROLL_REQUIRES_AWAIT_ROLL",
      "Dice can only be rolled while awaiting a roll.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may roll dice.");
  }

  const first = nextInt(state.prng, 6);
  const second = nextInt(first.next, 6);
  const dice: readonly [number, number] = [first.value + 1, second.value + 1];
  const matchingRolls = dice[0] === dice[1] ? state.consecutiveMatchingRolls + 1 : 0;
  const diceEvent = freezeEvent({
    type: "DiceRolled",
    eventVersion: 1,
    actorSeatId,
    payload: {
      dice,
      matching: dice[0] === dice[1],
      consecutiveMatchingRolls: matchingRolls,
      source: "normalTurn",
    },
  });
  let nextState = freezeState({
    ...state,
    phase: "ResolveMove",
    consecutiveMatchingRolls: matchingRolls,
    lastRoll: dice,
    prng: second.next,
  });
  const events: EngineEvent[] = [diceEvent];

  // The third consecutive matching roll sends the player directly to
  // Detention and skips movement. Movement/queue resolution continues in A3.
  if (matchingRolls >= 3) {
    const position = rules.content.spaces.find(
      (space) => space.spaceId === rules.content.detentionSpaceId,
    )?.routeIndex;
    if (position === undefined || !Number.isSafeInteger(position) || position < 0) {
      return reject(
        "INVALID_PAYLOAD",
        "INVALID_DETENTION_SPACE",
        "The content bundle has no valid Detention position.",
      );
    }
    nextState = freezeState({
      ...nextState,
      phase: "TurnEnd",
      seats: nextState.seats.map((candidate) =>
        candidate.seatId === actorSeatId
          ? {
              ...candidate,
              detained: true,
              detentionTurnsRemaining: 0,
              position: position ?? candidate.position,
            }
          : candidate,
      ),
    });
    events.push(
      freezeEvent({
        type: "DetentionEntered",
        eventVersion: 1,
        actorSeatId,
        payload: {
          seatId: actorSeatId,
          position,
          reason: "THREE_MATCHING_ROLLS",
        },
      }),
    );
  }
  return { ok: true, state: nextState, events: Object.freeze(events) };
}

/**
 * Accepts or rejects one actor-scoped command against an immutable state.
 * Returns a new immutable state plus ordered domain events, or a rejection.
 * The server performs no rule shortcut around this call. See ENG-015 step 5.
 */
export function resolve(state: GameState, command: ActorScopedCommand, rules: RuleSet): Resolution {
  switch (command.command.type) {
    case "StartGame":
      return resolveStartGame(state, command.actorSeatId, rules);
    case "RollDice":
      return resolveRollDice(state, command.actorSeatId, rules);
    default:
      return unimplemented(command.command.type);
  }
}

/**
 * The commands this seat may execute right now, with bounded parameters such
 * as a minimum and maximum auction bid. Advisory: the server still validates
 * every submitted payload. See ENG-023.
 */
export function legalActions(
  state: GameState,
  actorSeatId: SeatId,
  _rules: RuleSet,
): readonly LegalAction[] {
  const seat = findSeat(state, actorSeatId);
  if (seat?.status !== "active") return [];
  if (
    state.phase === "Lobby" &&
    state.seats.filter((candidate) => candidate.status === "active").length >= 2
  ) {
    return [{ type: "StartGame" }];
  }
  if (state.phase === "AwaitRoll" && state.activeSeatId === actorSeatId) {
    return [{ type: "RollDice" }];
  }
  return [];
}

/**
 * Relevant blocked actions with stable reason codes and safe display copy.
 * UI data only; it never grants authority. See PRD-FUN-009.
 */
export function actionAvailability(
  _state: GameState,
  _actorSeatId: SeatId,
  _rules: RuleSet,
): readonly ActionAvailability[] {
  return [];
}

/**
 * Rebuilds state from an ordered event range. Replay consumes no PRNG:
 * every chance outcome is already recorded in the events. See ENG-022.
 */
export function replay(
  initialState: GameState,
  events: readonly EngineEvent[],
  _rules: RuleSet,
): GameState {
  return events.reduce(applyEvent, initialState);
}
