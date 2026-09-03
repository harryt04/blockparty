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
import type { BoardSpace, ContentBundle, ContentEffect } from "@blockparty/game-content";
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

/** One immutable, serializable item in the data-defined effect queue. RULE-007. */
export interface QueuedEffect {
  readonly sourceId: string;
  readonly effect: ContentEffect;
}

/** A choice blocks the queue while retaining the exact remaining work. RULE-007, ENG-025. */
export interface PendingChoice {
  readonly choiceId: string;
  readonly continuation: readonly QueuedEffect[];
}

/**
 * The authoritative game state. See ENG-021.
 *
 * `seed` and `prng` are secret server data. They are excluded from every
 * projection, analytics event, URL, and log. See ENG-022 and PROTO-004.
 *
 * Auctions, trades, obligations, and card resolution are added by their rule
 * tickets. A4 owns deed ownership and the bank ledger seam.
 */
export interface DeedState {
  readonly deedId: string;
  readonly ownerSeatId?: SeatId;
  readonly mortgaged: boolean;
  readonly improvementLevel: number;
}

export interface BankState {
  /** The bank may create or retire currency and is therefore always solvent. */
  readonly cash: Money;
  readonly deedIds: readonly string[];
  readonly improvementInventory: Readonly<Record<string, number>>;
}

/** The minimum auction state needed to hand A4's decline path to A6. */
export interface PendingAuction {
  readonly deedId: string;
  readonly highBid: Money;
  readonly highBidderSeatId?: SeatId;
  readonly prioritySeatId: SeatId;
  readonly passedSeatIds: readonly SeatId[];
}

export interface GameState {
  readonly stateSchemaVersion: string;
  readonly contentVersion: string;
  readonly gameId: string;
  readonly aggregateVersion: number;
  readonly phase: Phase;
  readonly seats: readonly SeatState[];
  /** Ownership and mortgage state for every content deed. RULE-004. */
  readonly deeds: readonly DeedState[];
  /** The bank's currency, deeds, and finite improvement inventory are separate. */
  readonly bank: BankState;
  readonly activeSeatId?: SeatId;
  readonly prioritySeatId?: SeatId;
  /** Number of consecutive matching rolls by the active seat. See RULE-002. */
  readonly consecutiveMatchingRolls: number;
  /** The last committed roll, if this game has rolled dice. */
  readonly lastRoll?: readonly [number, number];
  /** Remaining data-defined effects. This is the serialized continuation. RULE-007. */
  readonly effectQueue: readonly QueuedEffect[];
  /** The currently blocking choice, if any. Its continuation mirrors effectQueue. */
  readonly pendingChoice?: PendingChoice;
  /** A deed landing that is waiting for the active seat's buy/decline choice. */
  readonly pendingAcquisitionDeedId?: string;
  /** Serialized handoff to the ordered auction reducer in A6. */
  readonly pendingAuction?: PendingAuction;
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

function payloadQueuedEffects(event: EngineEvent): readonly QueuedEffect[] | undefined {
  const value = event.payload.remainingEffects;
  if (!Array.isArray(value)) return undefined;
  if (
    !value.every(
      (entry): entry is QueuedEffect =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { sourceId?: unknown }).sourceId === "string" &&
        typeof (entry as { effect?: unknown }).effect === "object" &&
        (entry as { effect?: unknown }).effect !== null,
    )
  ) {
    return undefined;
  }
  return value;
}

function payloadStringArray(event: EngineEvent, key: string): readonly string[] | undefined {
  const value = event.payload[key];
  if (
    !Array.isArray(value) ||
    !value.every((entry): entry is string => typeof entry === "string")
  ) {
    return undefined;
  }
  return value;
}

function payloadInventory(
  event: EngineEvent,
  key: string,
): Readonly<Record<string, number>> | undefined {
  const value = event.payload[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (
    !entries.every(([, quantity]) => typeof quantity === "number" && Number.isSafeInteger(quantity))
  ) {
    return undefined;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, number>>;
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
  const freezeQueue = (queue: readonly QueuedEffect[]): readonly QueuedEffect[] =>
    Object.freeze(
      queue.map((entry) =>
        Object.freeze({ sourceId: entry.sourceId, effect: Object.freeze({ ...entry.effect }) }),
      ),
    );
  const deeds = Object.freeze(state.deeds.map((deed) => Object.freeze({ ...deed })));
  const bank = Object.freeze({
    ...state.bank,
    deedIds: Object.freeze([...state.bank.deedIds]),
    improvementInventory: Object.freeze({ ...state.bank.improvementInventory }),
  });
  const effectQueue = freezeQueue(state.effectQueue);
  const pendingChoice =
    state.pendingChoice === undefined
      ? undefined
      : Object.freeze({
          choiceId: state.pendingChoice.choiceId,
          continuation: freezeQueue(state.pendingChoice.continuation),
        });
  return Object.freeze({
    ...state,
    seats: Object.freeze(seats),
    deeds,
    bank,
    lastRoll,
    effectQueue,
    pendingChoice,
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
      const deedIds = payloadStringArray(event, "deedIds");
      const improvementInventory = payloadInventory(event, "improvementInventory");
      return freezeState({
        ...state,
        seats,
        deeds:
          deedIds === undefined
            ? state.deeds
            : deedIds.map((deedId) => ({ deedId, mortgaged: false, improvementLevel: 0 })),
        bank:
          deedIds === undefined && improvementInventory === undefined
            ? state.bank
            : {
                cash: payloadNumber(event, "bankCash") ?? state.bank.cash,
                deedIds: deedIds ?? state.bank.deedIds,
                improvementInventory: improvementInventory ?? state.bank.improvementInventory,
              },
        phase: "AwaitRoll",
        activeSeatId: payloadSeatId(event, "firstSeatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "firstSeatId") ?? state.prioritySeatId,
        consecutiveMatchingRolls: 0,
        lastRoll: undefined,
        effectQueue: [],
        pendingChoice: undefined,
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
      });
    }
    case "TurnStarted":
      return freezeState({
        ...state,
        phase: "AwaitRoll",
        activeSeatId: payloadSeatId(event, "seatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "seatId") ?? state.prioritySeatId,
        effectQueue: [],
        pendingChoice: undefined,
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
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
    case "TokenMoved": {
      const seatId = payloadSeatId(event, "seatId");
      const position = payloadNumber(event, "toPosition");
      if (seatId === undefined || position === undefined) return state;
      return freezeState({
        ...state,
        phase: "ResolveMove",
        seats: state.seats.map((seat) =>
          seat.seatId === seatId ? { ...seat, position, detained: false } : seat,
        ),
      });
    }
    case "StartPaymentCollected": {
      const seatId = payloadSeatId(event, "seatId");
      const amount = payloadNumber(event, "amount");
      if (seatId === undefined || amount === undefined) return state;
      return freezeState({
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === seatId ? { ...seat, balance: seat.balance + amount } : seat,
        ),
      });
    }
    case "DeedAcquired": {
      const deedId = payloadSeatId(event, "deedId");
      const buyerSeatId = payloadSeatId(event, "buyerSeatId");
      const price = payloadNumber(event, "price");
      if (deedId === undefined || buyerSeatId === undefined || price === undefined) return state;
      return freezeState({
        ...state,
        phase: "ResolveMove",
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
        seats: state.seats.map((seat) =>
          seat.seatId === buyerSeatId
            ? { ...seat, balance: seat.balance - price, deedIds: [...seat.deedIds, deedId] }
            : seat,
        ),
        deeds: state.deeds.map((deed) =>
          deed.deedId === deedId ? { ...deed, ownerSeatId: buyerSeatId } : deed,
        ),
        bank: {
          ...state.bank,
          cash: state.bank.cash + price,
          deedIds: state.bank.deedIds.filter((candidate) => candidate !== deedId),
        },
      });
    }
    case "AcquisitionDeclined":
      return freezeState({
        ...state,
        phase: "ResolveMove",
        pendingAcquisitionDeedId: undefined,
      });
    case "AuctionOpened": {
      const deedId = payloadSeatId(event, "deedId");
      const prioritySeatId = payloadSeatId(event, "prioritySeatId");
      if (deedId === undefined || prioritySeatId === undefined) return state;
      return freezeState({
        ...state,
        phase: "AwaitAuction",
        pendingAcquisitionDeedId: undefined,
        pendingAuction: {
          deedId,
          highBid: payloadNumber(event, "highBid") ?? 0,
          prioritySeatId,
          passedSeatIds: [],
        },
      });
    }
    case "PendingChoiceCreated": {
      const choiceId = payloadSeatId(event, "choiceId");
      const continuation = payloadQueuedEffects(event) ?? [];
      if (choiceId === undefined) return state;
      return freezeState({
        ...state,
        phase: "AwaitChoice",
        effectQueue: continuation,
        pendingChoice: { choiceId, continuation },
      });
    }
    case "PendingChoiceResolved":
      return freezeState({
        ...state,
        phase: "ResolveMove",
        effectQueue: payloadQueuedEffects(event) ?? [],
        pendingChoice: undefined,
      });
    case "DetentionEntered": {
      const seatId = payloadSeatId(event, "seatId");
      const position = payloadNumber(event, "position");
      if (seatId === undefined) return state;
      return freezeState({
        ...state,
        phase: "TurnEnd",
        effectQueue: [],
        pendingChoice: undefined,
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
        effectQueue: [],
        pendingChoice: undefined,
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

function findSpaceAtPosition(rules: RuleSet, position: number): BoardSpace | undefined {
  return rules.content.spaces.find((space) => space.routeIndex === position);
}

function findSpace(rules: RuleSet, spaceId: string): BoardSpace | undefined {
  return rules.content.spaces.find((space) => space.spaceId === spaceId);
}

function initialDeedStates(rules: RuleSet): readonly DeedState[] {
  return rules.content.deeds.map((deed) => ({
    deedId: deed.deedId,
    mortgaged: false,
    improvementLevel: 0,
  }));
}

function initialBankState(rules: RuleSet): BankState {
  return {
    cash: 0,
    deedIds: rules.content.deeds.map((deed) => deed.deedId),
    improvementInventory: { ...rules.content.economy.improvementInventory },
  };
}

function nextActiveSeatId(state: GameState, afterSeatId: SeatId): SeatId | undefined {
  const startIndex = state.seats.findIndex((seat) => seat.seatId === afterSeatId);
  if (startIndex < 0) return undefined;
  for (let offset = 1; offset <= state.seats.length; offset += 1) {
    const candidate = state.seats[(startIndex + offset) % state.seats.length];
    if (candidate?.status === "active") return candidate.seatId;
  }
  return undefined;
}

interface Movement {
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly forwardSteps: number;
  readonly crossedStart: number;
}

/** Walks the authored route graph; routeIndex is only the serialized position. RULE-010. */
function walkRoute(
  rules: RuleSet,
  fromPosition: number,
  steps: number,
  collectStart: boolean,
): Movement | Rejection {
  const start = findSpaceAtPosition(rules, fromPosition);
  if (start === undefined) {
    return reject("INVALID_PAYLOAD", "INVALID_POSITION", "The seat is not on the authored route.");
  }

  let current = start;
  let crossedStart = 0;
  if (steps >= 0) {
    for (let index = 0; index < steps; index += 1) {
      const next = findSpace(rules, current.next);
      if (next === undefined) {
        return reject("INVALID_PAYLOAD", "BROKEN_ROUTE", "The authored route has a missing edge.");
      }
      current = next;
      if (collectStart && current.spaceId === rules.content.startSpaceId) crossedStart += 1;
    }
  } else {
    for (let index = 0; index > steps; index -= 1) {
      const previous = rules.content.spaces.find((space) => space.next === current.spaceId);
      if (previous === undefined) {
        return reject("INVALID_PAYLOAD", "BROKEN_ROUTE", "The authored route has no reverse edge.");
      }
      current = previous;
    }
  }

  return {
    fromPosition,
    toPosition: current.routeIndex,
    forwardSteps: steps,
    crossedStart,
  };
}

function movementToTarget(
  rules: RuleSet,
  fromPosition: number,
  target: BoardSpace,
  collectStart: boolean,
): Movement | Rejection {
  if (collectStart) {
    const routeLength = rules.content.spaces.length;
    const distance = (target.routeIndex - fromPosition + routeLength) % routeLength;
    return walkRoute(rules, fromPosition, distance, true);
  }
  return walkRoute(rules, fromPosition, target.routeIndex - fromPosition, false);
}

function queuedEffects(space: BoardSpace): readonly QueuedEffect[] {
  return space.effects.map((effect) => ({ sourceId: space.spaceId, effect }));
}

function moveEvent(
  actorSeatId: SeatId,
  movement: Movement,
  movementType: "normalDice" | "forced",
): EngineEvent {
  return freezeEvent({
    type: "TokenMoved",
    eventVersion: 1,
    actorSeatId,
    payload: {
      seatId: actorSeatId,
      fromPosition: movement.fromPosition,
      toPosition: movement.toPosition,
      spaces: movement.forwardSteps,
      crossedStart: movement.crossedStart > 0,
      startCrossings: movement.crossedStart,
      movementType,
    },
  });
}

function applyMovement(
  state: GameState,
  actorSeatId: SeatId,
  movement: Movement,
  rules: RuleSet,
  events: EngineEvent[],
  movementType: "normalDice" | "forced",
  exactNormalStart: boolean,
): GameState {
  let nextState = freezeState({
    ...state,
    seats: state.seats.map((seat) =>
      seat.seatId === actorSeatId
        ? { ...seat, position: movement.toPosition, detained: false, detentionTurnsRemaining: 0 }
        : seat,
    ),
  });
  events.push(moveEvent(actorSeatId, movement, movementType));

  const startPayment = rules.content.economy.startPayment;
  const payments =
    movement.crossedStart +
    (exactNormalStart && rules.configuration.doubleStartOnExactLanding ? 1 : 0);
  for (let index = 0; index < payments; index += 1) {
    const reason =
      exactNormalStart && index === payments - 1 && rules.configuration.doubleStartOnExactLanding
        ? "EXACT_START_VARIANT"
        : exactNormalStart
          ? "EXACT_START"
          : "CROSSED_START";
    nextState = freezeState({
      ...nextState,
      seats: nextState.seats.map((seat) =>
        seat.seatId === actorSeatId ? { ...seat, balance: seat.balance + startPayment } : seat,
      ),
    });
    events.push(
      freezeEvent({
        type: "StartPaymentCollected",
        eventVersion: 1,
        actorSeatId,
        payload: { seatId: actorSeatId, amount: startPayment, reason },
      }),
    );
  }
  return nextState;
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
    deeds: initialDeedStates(rules),
    bank: initialBankState(rules),
    phase: "AwaitRoll",
    activeSeatId: firstSeatId,
    prioritySeatId: firstSeatId,
    consecutiveMatchingRolls: 0,
    lastRoll: undefined,
    pendingAcquisitionDeedId: undefined,
    pendingAuction: undefined,
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
        deedIds: rules.content.deeds.map((deed) => deed.deedId),
        bankCash: 0,
        improvementInventory: rules.content.economy.improvementInventory,
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

interface QueueResolution {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

function resolveDeedLanding(
  state: GameState,
  actorSeatId: SeatId,
  rules: RuleSet,
): QueueResolution {
  const seat = findSeat(state, actorSeatId);
  const space = seat === undefined ? undefined : findSpaceAtPosition(rules, seat.position);
  const deedId = space?.type === "deed" ? space.deedId : undefined;
  const deed =
    deedId === undefined
      ? undefined
      : rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState =
    deedId === undefined ? undefined : state.deeds.find((candidate) => candidate.deedId === deedId);
  if (
    seat === undefined ||
    deed === undefined ||
    deedState === undefined ||
    !state.bank.deedIds.includes(deed.deedId)
  ) {
    return { state: freezeState({ ...state, effectQueue: [] }), events: Object.freeze([]) };
  }

  if (seat.balance >= deed.price) {
    return {
      state: freezeState({
        ...state,
        phase: "AwaitPurchase",
        effectQueue: [],
        pendingAcquisitionDeedId: deed.deedId,
        pendingAuction: undefined,
      }),
      events: Object.freeze([]),
    };
  }

  const declineEvent = freezeEvent({
    type: "AcquisitionDeclined",
    eventVersion: 1,
    actorSeatId,
    payload: { deedId: deed.deedId, reason: "UNAFFORDABLE" },
  });
  if (rules.configuration.noAuctionAfterDeclinedAcquisition) {
    return {
      state: freezeState({
        ...state,
        phase: "ResolveMove",
        effectQueue: [],
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
      }),
      events: Object.freeze([declineEvent]),
    };
  }

  const prioritySeatId = nextActiveSeatId(state, actorSeatId);
  if (prioritySeatId === undefined) {
    return {
      state: freezeState({ ...state, effectQueue: [] }),
      events: Object.freeze([declineEvent]),
    };
  }
  const auction = {
    deedId: deed.deedId,
    highBid: 0,
    prioritySeatId,
    passedSeatIds: [],
  } satisfies PendingAuction;
  return {
    state: freezeState({
      ...state,
      phase: "AwaitAuction",
      effectQueue: [],
      pendingAcquisitionDeedId: undefined,
      pendingAuction: auction,
    }),
    events: Object.freeze([
      declineEvent,
      freezeEvent({
        type: "AuctionOpened",
        eventVersion: 1,
        actorSeatId,
        payload: {
          deedId: deed.deedId,
          highBid: 0,
          prioritySeatId,
          reason: "ACQUISITION_DECLINED_OR_UNAFFORDABLE",
        },
      }),
    ]),
  };
}

/**
 * Resolves the A3-owned movement/choice effects and leaves later-ticket
 * effects at the front of the immutable queue. A later reducer can therefore
 * continue the exact same serialized continuation without re-running movement.
 */
function resolveEffectQueue(
  state: GameState,
  actorSeatId: SeatId,
  rules: RuleSet,
  initialQueue: readonly QueuedEffect[],
): QueueResolution {
  let nextState = freezeState({
    ...state,
    phase: "ResolveMove",
    effectQueue: initialQueue,
    pendingChoice: undefined,
  });
  const events: EngineEvent[] = [];

  while (nextState.effectQueue.length > 0) {
    const [entry, ...remaining] = nextState.effectQueue;
    if (entry === undefined) break;

    switch (entry.effect.type) {
      case "MoveBy": {
        const seat = findSeat(nextState, actorSeatId);
        if (seat === undefined) break;
        const movement = walkRoute(
          rules,
          seat.position,
          entry.effect.spaces,
          entry.effect.spaces >= 0,
        );
        if (!("toPosition" in movement)) break;
        const destination = findSpaceAtPosition(rules, movement.toPosition);
        if (destination === undefined) break;
        nextState = applyMovement(nextState, actorSeatId, movement, rules, events, "forced", false);
        nextState = freezeState({
          ...nextState,
          effectQueue: [...queuedEffects(destination), ...remaining],
        });
        continue;
      }
      case "MoveTo": {
        const seat = findSeat(nextState, actorSeatId);
        const destination = findSpace(rules, entry.effect.spaceId);
        if (seat === undefined || destination === undefined) break;
        const movement = movementToTarget(
          rules,
          seat.position,
          destination,
          entry.effect.collectStartWhenCrossed,
        );
        if (!("toPosition" in movement)) break;
        nextState = applyMovement(nextState, actorSeatId, movement, rules, events, "forced", false);
        nextState = freezeState({
          ...nextState,
          effectQueue: [...queuedEffects(destination), ...remaining],
        });
        continue;
      }
      case "SendToDetention": {
        const seat = findSeat(nextState, actorSeatId);
        const detention = findSpace(rules, rules.content.detentionSpaceId);
        if (seat === undefined || detention === undefined) break;
        nextState = freezeState({
          ...nextState,
          phase: "TurnEnd",
          effectQueue: [],
          pendingChoice: undefined,
          seats: nextState.seats.map((candidate) =>
            candidate.seatId === actorSeatId
              ? {
                  ...candidate,
                  position: detention.routeIndex,
                  detained: true,
                  detentionTurnsRemaining: 0,
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
              position: detention.routeIndex,
              reason: "EFFECT",
            },
          }),
        );
        return { state: nextState, events: Object.freeze(events) };
      }
      case "Choose": {
        const continuation = Object.freeze([...remaining]);
        nextState = freezeState({
          ...nextState,
          phase: "AwaitChoice",
          effectQueue: continuation,
          pendingChoice: { choiceId: entry.effect.choiceId, continuation },
        });
        events.push(
          freezeEvent({
            type: "PendingChoiceCreated",
            eventVersion: 1,
            actorSeatId,
            payload: {
              choiceId: entry.effect.choiceId,
              remainingEffects: continuation,
            },
          }),
        );
        return { state: nextState, events: Object.freeze(events) };
      }
      default:
        // Payment, cards, and repairs are owned by later tickets. Keep the
        // unconsumed item visible and ordered instead of silently dropping it.
        return {
          state: freezeState({ ...nextState, effectQueue: [entry, ...remaining] }),
          events: Object.freeze(events),
        };
    }

    // A malformed route/content item is retained for the server's corruption
    // handling rather than turning a partial movement into a false success.
    return {
      state: freezeState({ ...nextState, effectQueue: [entry, ...remaining] }),
      events: Object.freeze(events),
    };
  }

  const deedLanding = resolveDeedLanding(
    freezeState({ ...nextState, effectQueue: [] }),
    actorSeatId,
    rules,
  );
  return {
    state: deedLanding.state,
    events: Object.freeze([...events, ...deedLanding.events]),
  };
}

function resolvePendingChoice(
  state: GameState,
  actorSeatId: SeatId,
  choiceId: string,
  optionId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "AwaitChoice" || state.pendingChoice === undefined) {
    return reject(
      "PHASE_MISMATCH",
      "CHOICE_NOT_PENDING",
      "A pending choice is required before selecting an option.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may choose an option.");
  }
  if (state.pendingChoice.choiceId !== choiceId) {
    return reject("ILLEGAL_ACTION", "CHOICE_MISMATCH", "The selected choice is no longer pending.");
  }

  const resumed = resolveEffectQueue(
    freezeState({
      ...state,
      phase: "ResolveMove",
      effectQueue: state.pendingChoice.continuation,
      pendingChoice: undefined,
    }),
    actorSeatId,
    rules,
    state.pendingChoice.continuation,
  );
  const events: EngineEvent[] = [
    freezeEvent({
      type: "PendingChoiceResolved",
      eventVersion: 1,
      actorSeatId,
      payload: {
        choiceId,
        optionId,
        remainingEffects: resumed.state.effectQueue,
      },
    }),
    ...resumed.events,
  ];
  return { ok: true, state: resumed.state, events: Object.freeze(events) };
}

function resolveAcquireDeed(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "AwaitPurchase") {
    return reject(
      "PHASE_MISMATCH",
      "ACQUIRE_REQUIRES_PURCHASE_CHOICE",
      "A deed may only be acquired after an eligible landing offer.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may acquire a deed.");
  }
  if (state.pendingAcquisitionDeedId !== deedId) {
    return reject(
      "ILLEGAL_ACTION",
      "ACQUISITION_MISMATCH",
      "The selected deed is not the pending offer.",
    );
  }

  const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === deedId);
  const seat = findSeat(state, actorSeatId);
  if (deed === undefined || deedState === undefined || seat === undefined) {
    return reject(
      "INVALID_PAYLOAD",
      "UNKNOWN_DEED",
      "The selected deed is not in the content ledger.",
    );
  }
  if (!state.bank.deedIds.includes(deedId) || deedState.ownerSeatId !== undefined) {
    return reject(
      "ILLEGAL_ACTION",
      "DEED_NOT_BANK_OWNED",
      "Only a bank-owned deed can be acquired.",
    );
  }
  if (!Number.isSafeInteger(deed.price) || deed.price < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_DEED_PRICE",
      "The deed price is not a valid minor-unit amount.",
    );
  }
  if (seat.balance < deed.price) {
    return reject(
      "ILLEGAL_ACTION",
      "INSUFFICIENT_FUNDS",
      "The active seat cannot afford this deed.",
    );
  }
  if (!Number.isSafeInteger(state.bank.cash + deed.price)) {
    return reject(
      "INVALID_PAYLOAD",
      "BANK_CASH_OVERFLOW",
      "The bank ledger cannot represent this payment.",
    );
  }

  const nextState = freezeState({
    ...state,
    phase: "ResolveMove",
    pendingAcquisitionDeedId: undefined,
    pendingAuction: undefined,
    seats: state.seats.map((candidate) =>
      candidate.seatId === actorSeatId
        ? {
            ...candidate,
            balance: candidate.balance - deed.price,
            deedIds: [...candidate.deedIds, deedId],
          }
        : candidate,
    ),
    deeds: state.deeds.map((candidate) =>
      candidate.deedId === deedId ? { ...candidate, ownerSeatId: actorSeatId } : candidate,
    ),
    bank: {
      ...state.bank,
      cash: state.bank.cash + deed.price,
      deedIds: state.bank.deedIds.filter((candidate) => candidate !== deedId),
    },
  });
  return {
    ok: true,
    state: nextState,
    events: Object.freeze([
      freezeEvent({
        type: "DeedAcquired",
        eventVersion: 1,
        actorSeatId,
        payload: { deedId, buyerSeatId: actorSeatId, price: deed.price },
      }),
    ]),
  };
}

function declineAcquisition(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "AwaitPurchase") {
    return reject(
      "PHASE_MISMATCH",
      "DECLINE_REQUIRES_PURCHASE_CHOICE",
      "A deed may only be declined after an eligible landing offer.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may decline a deed.");
  }
  if (state.pendingAcquisitionDeedId !== deedId) {
    return reject(
      "ILLEGAL_ACTION",
      "ACQUISITION_MISMATCH",
      "The selected deed is not the pending offer.",
    );
  }
  if (!state.bank.deedIds.includes(deedId)) {
    return reject(
      "ILLEGAL_ACTION",
      "DEED_NOT_BANK_OWNED",
      "Only a bank-owned deed can be declined.",
    );
  }

  const declined = freezeEvent({
    type: "AcquisitionDeclined",
    eventVersion: 1,
    actorSeatId,
    payload: { deedId, reason: "PLAYER_DECLINED" },
  });
  if (rules.configuration.noAuctionAfterDeclinedAcquisition) {
    return {
      ok: true,
      state: freezeState({
        ...state,
        phase: "ResolveMove",
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
      }),
      events: Object.freeze([declined]),
    };
  }
  const prioritySeatId = nextActiveSeatId(state, actorSeatId);
  if (prioritySeatId === undefined) {
    return reject(
      "INVALID_PAYLOAD",
      "NO_AUCTION_PRIORITY",
      "No active seat is available to start the auction.",
    );
  }
  const auction = {
    deedId,
    highBid: 0,
    prioritySeatId,
    passedSeatIds: [],
  } satisfies PendingAuction;
  return {
    ok: true,
    state: freezeState({
      ...state,
      phase: "AwaitAuction",
      pendingAcquisitionDeedId: undefined,
      pendingAuction: auction,
    }),
    events: Object.freeze([
      declined,
      freezeEvent({
        type: "AuctionOpened",
        eventVersion: 1,
        actorSeatId,
        payload: {
          deedId,
          highBid: 0,
          prioritySeatId,
          reason: "ACQUISITION_DECLINED",
        },
      }),
    ]),
  };
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
    effectQueue: [],
    pendingChoice: undefined,
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
      effectQueue: [],
      pendingChoice: undefined,
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
    return { ok: true, state: nextState, events: Object.freeze(events) };
  }

  const seat = findSeat(nextState, actorSeatId);
  if (seat === undefined) {
    return reject(
      "INVALID_PAYLOAD",
      "UNKNOWN_ACTIVE_SEAT",
      "The active seat disappeared during roll.",
    );
  }
  const movement = walkRoute(rules, seat.position, dice[0] + dice[1], true);
  if (!("toPosition" in movement)) return movement;
  const destination = findSpaceAtPosition(rules, movement.toPosition);
  if (destination === undefined) {
    return reject("INVALID_PAYLOAD", "INVALID_DESTINATION", "The roll reached no authored space.");
  }
  nextState = applyMovement(
    nextState,
    actorSeatId,
    movement,
    rules,
    events,
    "normalDice",
    destination.spaceId === rules.content.startSpaceId,
  );
  const queued = resolveEffectQueue(nextState, actorSeatId, rules, queuedEffects(destination));
  return { ok: true, state: queued.state, events: Object.freeze([...events, ...queued.events]) };
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
    case "ChoosePendingOption":
      return resolvePendingChoice(
        state,
        command.actorSeatId,
        command.command.choiceId,
        command.command.optionId,
        rules,
      );
    case "AcquireDeed":
      return resolveAcquireDeed(state, command.actorSeatId, command.command.deedId, rules);
    case "DeclineAcquisition":
      return declineAcquisition(state, command.actorSeatId, command.command.deedId, rules);
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
