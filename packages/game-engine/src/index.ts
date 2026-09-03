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
 * Unimplemented commands retain their typed rejection while rules land ticket
 * by ticket behind these seams.
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
import type { BoardSpace, ContentBundle, ContentEffect, Deed } from "@blockparty/game-content";
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

/** A blocking payment with the exact queue continuation retained. RULE-007, ENG-025. */
export interface PendingObligation {
  readonly debtorSeatId: SeatId;
  readonly creditorSeatId?: SeatId;
  readonly amount: Money;
  readonly reasonCode: string;
  readonly continuation: readonly QueuedEffect[];
}

/** Server-only deck cursor state. Future order is never part of a projection. ENG-022. */
export interface DeckState {
  readonly deckId: string;
  readonly drawPile: readonly string[];
  readonly discardPile: readonly string[];
}

/** The card whose ordered effects are currently being resolved. */
export interface ResolvingCard {
  readonly deckId: string;
  readonly cardId: string;
  readonly retainable: boolean;
}

/**
 * The authoritative game state. See ENG-021.
 *
 * `seed` and `prng` are secret server data. They are excluded from every
 * projection, analytics event, URL, and log. See ENG-022 and PROTO-004.
 *
 * A4 owns deed ownership and the bank ledger; A5 owns rent obligations; A6
 * owns deed auctions.
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

/** One currently declared, one-level demand for a scarce improvement. */
export interface ScarceImprovementDemand {
  readonly seatId: SeatId;
  readonly deedId: string;
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly inventoryKind: string;
  readonly inventoryDelta: number;
  /** The content-defined normal improvement price used as the auction base cost. */
  readonly baseCost: Money;
}

/** A no-timer improvement auction over the currently declared demands. */
export interface PendingImprovementAuction {
  readonly demands: readonly ScarceImprovementDemand[];
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
  /** The currently blocking payment, if the active seat cannot pay immediately. */
  readonly obligation?: PendingObligation;
  /** Serialized handoff to the ordered auction reducer in A6. */
  readonly pendingAuction?: PendingAuction;
  /** Declared demands retained until finite inventory is no longer contested. */
  readonly scarceImprovementDemands?: readonly ScarceImprovementDemand[];
  /** Serialized handoff to the scarce-improvement auction reducer. */
  readonly pendingImprovementAuction?: PendingImprovementAuction;
  /** Server-only deck cursors and future order. Never expose in a projection. ENG-022. */
  readonly decks?: readonly DeckState[];
  /** Server-only card context used to return ordinary cards after resolution. */
  readonly resolvingCard?: ResolvingCard;
  /** Nested card effects retain their outer card context until completion. */
  readonly resolvingCardStack?: readonly ResolvingCard[];
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

function payloadBoolean(event: EngineEvent, key: string): boolean | undefined {
  const value = event.payload[key];
  return typeof value === "boolean" ? value : undefined;
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

function payloadDeckStates(event: EngineEvent): readonly DeckState[] | undefined {
  const value = event.payload.deckOrders;
  if (!Array.isArray(value)) return undefined;
  const states: DeckState[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    const deckId = record.deckId;
    const cardIds = record.cardIds;
    if (
      typeof deckId !== "string" ||
      !Array.isArray(cardIds) ||
      !cardIds.every((cardId): cardId is string => typeof cardId === "string")
    ) {
      return undefined;
    }
    states.push({ deckId, drawPile: cardIds, discardPile: [] });
  }
  return states;
}

function payloadResolvingCard(event: EngineEvent): ResolvingCard | undefined {
  const deckId = payloadString(event, "deckId");
  const cardId = payloadString(event, "cardId");
  const retainable = payloadBoolean(event, "retainable");
  if (deckId === undefined || cardId === undefined || retainable === undefined) return undefined;
  return { deckId, cardId, retainable };
}

function payloadResolvingCardStack(event: EngineEvent): readonly ResolvingCard[] | undefined {
  const value = event.payload.resolvingCardStack;
  if (!Array.isArray(value)) return undefined;
  const stack: ResolvingCard[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.deckId !== "string" ||
      typeof record.cardId !== "string" ||
      typeof record.retainable !== "boolean"
    ) {
      return undefined;
    }
    stack.push({
      deckId: record.deckId,
      cardId: record.cardId,
      retainable: record.retainable,
    });
  }
  return stack;
}

function payloadString(event: EngineEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function payloadDemands(event: EngineEvent, key = "demands"): readonly ScarceImprovementDemand[] {
  const value = event.payload[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ScarceImprovementDemand => {
    if (typeof entry !== "object" || entry === null) return false;
    const demand = entry as Record<string, unknown>;
    return (
      typeof demand.seatId === "string" &&
      typeof demand.deedId === "string" &&
      Number.isSafeInteger(demand.fromLevel) &&
      Number.isSafeInteger(demand.toLevel) &&
      typeof demand.inventoryKind === "string" &&
      Number.isSafeInteger(demand.inventoryDelta) &&
      Number.isSafeInteger(demand.baseCost)
    );
  });
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
  const obligation =
    state.obligation === undefined
      ? undefined
      : Object.freeze({
          ...state.obligation,
          continuation: freezeQueue(state.obligation.continuation),
        });
  const pendingAuction =
    state.pendingAuction === undefined
      ? undefined
      : Object.freeze({
          ...state.pendingAuction,
          passedSeatIds: Object.freeze([...state.pendingAuction.passedSeatIds]),
        });
  const scarceImprovementDemands =
    state.scarceImprovementDemands === undefined
      ? undefined
      : Object.freeze(state.scarceImprovementDemands.map((demand) => Object.freeze({ ...demand })));
  const pendingImprovementAuction =
    state.pendingImprovementAuction === undefined
      ? undefined
      : Object.freeze({
          ...state.pendingImprovementAuction,
          demands: Object.freeze(
            state.pendingImprovementAuction.demands.map((demand) => Object.freeze({ ...demand })),
          ),
          passedSeatIds: Object.freeze([...state.pendingImprovementAuction.passedSeatIds]),
        });
  const decks =
    state.decks === undefined
      ? undefined
      : Object.freeze(
          state.decks.map((deck) =>
            Object.freeze({
              ...deck,
              drawPile: Object.freeze([...deck.drawPile]),
              discardPile: Object.freeze([...deck.discardPile]),
            }),
          ),
        );
  const resolvingCard =
    state.resolvingCard === undefined ? undefined : Object.freeze({ ...state.resolvingCard });
  const resolvingCardStack =
    state.resolvingCardStack === undefined
      ? undefined
      : Object.freeze(state.resolvingCardStack.map((card) => Object.freeze({ ...card })));
  return Object.freeze({
    ...state,
    seats: Object.freeze(seats),
    deeds,
    bank,
    lastRoll,
    effectQueue,
    pendingChoice,
    obligation,
    pendingAuction,
    ...(scarceImprovementDemands === undefined ? {} : { scarceImprovementDemands }),
    ...(pendingImprovementAuction === undefined ? {} : { pendingImprovementAuction }),
    ...(decks === undefined ? {} : { decks }),
    ...(resolvingCard === undefined ? {} : { resolvingCard }),
    ...(resolvingCardStack === undefined ? {} : { resolvingCardStack }),
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
      const decks = payloadDeckStates(event);
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
        ...(decks === undefined ? {} : { decks }),
        resolvingCard: undefined,
        resolvingCardStack: undefined,
        ...(state.scarceImprovementDemands === undefined ? {} : { scarceImprovementDemands: [] }),
        ...(state.pendingImprovementAuction === undefined
          ? {}
          : { pendingImprovementAuction: undefined }),
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
        resolvingCard: undefined,
        resolvingCardStack: undefined,
        ...(state.scarceImprovementDemands === undefined ? {} : { scarceImprovementDemands: [] }),
        ...(state.pendingImprovementAuction === undefined
          ? {}
          : { pendingImprovementAuction: undefined }),
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
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
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
    case "BankPaymentCollected": {
      const seatId = payloadSeatId(event, "seatId");
      const amount = payloadNumber(event, "amount");
      if (seatId === undefined || amount === undefined || amount < 0) return state;
      return freezeState({
        ...state,
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        seats: state.seats.map((seat) =>
          seat.seatId === seatId ? { ...seat, balance: seat.balance + amount } : seat,
        ),
        bank: { ...state.bank, cash: state.bank.cash - amount },
      });
    }
    case "PlayerPaymentCollected": {
      const payerSeatId = payloadSeatId(event, "payerSeatId");
      const recipientSeatId = payloadSeatId(event, "recipientSeatId");
      const amount = payloadNumber(event, "amount");
      if (
        payerSeatId === undefined ||
        recipientSeatId === undefined ||
        amount === undefined ||
        amount < 0
      ) {
        return state;
      }
      return freezeState({
        ...state,
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        seats: state.seats.map((seat) =>
          seat.seatId === payerSeatId
            ? { ...seat, balance: seat.balance - amount }
            : seat.seatId === recipientSeatId
              ? { ...seat, balance: seat.balance + amount }
              : seat,
        ),
      });
    }
    case "FeePaid": {
      const seatId = payloadSeatId(event, "seatId");
      const amount = payloadNumber(event, "amount");
      if (seatId === undefined || amount === undefined || amount < 0) return state;
      return freezeState({
        ...state,
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        seats: state.seats.map((seat) =>
          seat.seatId === seatId ? { ...seat, balance: seat.balance - amount } : seat,
        ),
        bank: { ...state.bank, cash: state.bank.cash + amount },
      });
    }
    case "CardDrawn": {
      const deckId = payloadString(event, "deckId");
      const cardId = payloadString(event, "cardId");
      const resolvingCard = payloadResolvingCard(event);
      if (deckId === undefined || cardId === undefined || resolvingCard === undefined) return state;
      const deckStates = state.decks?.map((deck) =>
        deck.deckId === deckId
          ? {
              ...deck,
              drawPile: payloadStringArray(event, "remainingCardIds") ?? deck.drawPile,
              discardPile: payloadStringArray(event, "discardCardIds") ?? deck.discardPile,
            }
          : deck,
      );
      return freezeState({
        ...state,
        phase: "ResolveMove",
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        resolvingCard,
        resolvingCardStack: payloadResolvingCardStack(event) ?? state.resolvingCardStack,
        ...(deckStates === undefined ? {} : { decks: deckStates }),
      });
    }
    case "CardDiscarded": {
      const deckId = payloadString(event, "deckId");
      const cardId = payloadString(event, "cardId");
      if (deckId === undefined || cardId === undefined) return state;
      const deckStates = state.decks?.map((deck) =>
        deck.deckId === deckId ? { ...deck, discardPile: [...deck.discardPile, cardId] } : deck,
      );
      return freezeState({
        ...state,
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        resolvingCard:
          state.resolvingCard?.cardId === cardId
            ? state.resolvingCardStack?.at(-1)
            : state.resolvingCard,
        resolvingCardStack:
          state.resolvingCard?.cardId === cardId
            ? state.resolvingCardStack?.slice(0, -1)
            : state.resolvingCardStack,
        ...(deckStates === undefined ? {} : { decks: deckStates }),
      });
    }
    case "DetentionReleaseCardGranted": {
      const seatId = payloadSeatId(event, "seatId");
      const cardId = payloadSeatId(event, "cardId");
      if (seatId === undefined || cardId === undefined) return state;
      return freezeState({
        ...state,
        effectQueue: payloadQueuedEffects(event) ?? state.effectQueue,
        resolvingCard:
          state.resolvingCard?.cardId === cardId
            ? state.resolvingCardStack?.at(-1)
            : state.resolvingCard,
        resolvingCardStack:
          state.resolvingCard?.cardId === cardId
            ? state.resolvingCardStack?.slice(0, -1)
            : state.resolvingCardStack,
        seats: state.seats.map((seat) =>
          seat.seatId === seatId && !seat.detentionReleaseCardIds.includes(cardId)
            ? { ...seat, detentionReleaseCardIds: [...seat.detentionReleaseCardIds, cardId] }
            : seat,
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
    case "DeedMortgaged": {
      const deedId = payloadSeatId(event, "deedId");
      const ownerSeatId = payloadSeatId(event, "ownerSeatId");
      const amount = payloadNumber(event, "amount");
      const deed =
        deedId === undefined ? undefined : state.deeds.find((item) => item.deedId === deedId);
      const owner = ownerSeatId === undefined ? undefined : findSeat(state, ownerSeatId);
      if (
        deed === undefined ||
        owner === undefined ||
        amount === undefined ||
        amount < 0 ||
        deed.ownerSeatId !== ownerSeatId ||
        deed.mortgaged ||
        !Number.isSafeInteger(owner.balance + amount) ||
        !Number.isSafeInteger(state.bank.cash - amount)
      ) {
        return state;
      }
      return freezeState({
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === ownerSeatId ? { ...seat, balance: seat.balance + amount } : seat,
        ),
        deeds: state.deeds.map((item) =>
          item.deedId === deedId ? { ...item, mortgaged: true } : item,
        ),
        bank: { ...state.bank, cash: state.bank.cash - amount },
      });
    }
    case "MortgageRedeemed": {
      const deedId = payloadSeatId(event, "deedId");
      const ownerSeatId = payloadSeatId(event, "ownerSeatId");
      const amount = payloadNumber(event, "amount");
      const deed =
        deedId === undefined ? undefined : state.deeds.find((item) => item.deedId === deedId);
      const owner = ownerSeatId === undefined ? undefined : findSeat(state, ownerSeatId);
      if (
        deed === undefined ||
        owner === undefined ||
        amount === undefined ||
        amount < 0 ||
        deed.ownerSeatId !== ownerSeatId ||
        !deed.mortgaged ||
        !Number.isSafeInteger(owner.balance - amount) ||
        owner.balance - amount < 0 ||
        !Number.isSafeInteger(state.bank.cash + amount)
      ) {
        return state;
      }
      return freezeState({
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === ownerSeatId ? { ...seat, balance: seat.balance - amount } : seat,
        ),
        deeds: state.deeds.map((item) =>
          item.deedId === deedId ? { ...item, mortgaged: false } : item,
        ),
        bank: { ...state.bank, cash: state.bank.cash + amount },
      });
    }
    case "DeedTransferred": {
      const deedId = payloadSeatId(event, "deedId");
      const fromSeatId = payloadSeatId(event, "fromSeatId");
      const toSeatId = payloadSeatId(event, "toSeatId");
      const chargePaid = payloadNumber(event, "chargePaid") ?? 0;
      if (deedId === undefined || fromSeatId === undefined || toSeatId === undefined) {
        return state;
      }
      const deed = state.deeds.find((item) => item.deedId === deedId);
      const fromSeat = findSeat(state, fromSeatId);
      const toSeat = findSeat(state, toSeatId);
      if (
        deed === undefined ||
        fromSeat === undefined ||
        toSeat === undefined ||
        fromSeatId === toSeatId ||
        deed.ownerSeatId !== fromSeatId ||
        chargePaid < 0 ||
        !Number.isSafeInteger(toSeat.balance - chargePaid) ||
        toSeat.balance - chargePaid < 0 ||
        !Number.isSafeInteger(state.bank.cash + chargePaid)
      ) {
        return state;
      }
      return freezeState({
        ...state,
        seats: state.seats.map((seat) =>
          seat.seatId === fromSeatId
            ? { ...seat, deedIds: seat.deedIds.filter((id) => id !== deedId) }
            : seat.seatId === toSeatId
              ? {
                  ...seat,
                  balance: seat.balance - chargePaid,
                  deedIds: seat.deedIds.includes(deedId) ? seat.deedIds : [...seat.deedIds, deedId],
                }
              : seat,
        ),
        deeds: state.deeds.map((item) =>
          item.deedId === deedId ? { ...item, ownerSeatId: toSeatId } : item,
        ),
        bank: { ...state.bank, cash: state.bank.cash + chargePaid },
      });
    }
    case "RentPaid": {
      const debtorSeatId = payloadSeatId(event, "debtorSeatId");
      const creditorSeatId = payloadSeatId(event, "creditorSeatId");
      const amount = payloadNumber(event, "amount");
      if (debtorSeatId === undefined || creditorSeatId === undefined || amount === undefined) {
        return state;
      }
      return freezeState({
        ...state,
        phase: "ResolveMove",
        obligation: undefined,
        seats: state.seats.map((seat) =>
          seat.seatId === debtorSeatId
            ? { ...seat, balance: seat.balance - amount }
            : seat.seatId === creditorSeatId
              ? { ...seat, balance: seat.balance + amount }
              : seat,
        ),
      });
    }
    case "ObligationCreated": {
      const debtorSeatId = payloadSeatId(event, "debtorSeatId");
      const creditorSeatId = payloadSeatId(event, "creditorSeatId");
      const amount = payloadNumber(event, "amount");
      const reasonCode = payloadSeatId(event, "reasonCode");
      if (debtorSeatId === undefined || amount === undefined || reasonCode === undefined) {
        return state;
      }
      const continuation = payloadQueuedEffects(event) ?? [];
      return freezeState({
        ...state,
        phase: "AwaitDebt",
        effectQueue: continuation,
        obligation: {
          debtorSeatId,
          creditorSeatId,
          amount,
          reasonCode,
          continuation,
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
      if (prioritySeatId === undefined) return state;
      if (payloadString(event, "auctionKind") === "improvement") {
        return freezeState({
          ...state,
          phase: "ImprovementAuction",
          prioritySeatId,
          pendingImprovementAuction: {
            demands: payloadDemands(event),
            highBid: payloadNumber(event, "highBid") ?? 0,
            highBidderSeatId: payloadSeatId(event, "highBidderSeatId"),
            prioritySeatId,
            passedSeatIds: payloadStringArray(event, "passedSeatIds") ?? [],
          },
        });
      }
      if (deedId === undefined) return state;
      return freezeState({
        ...state,
        phase: "AwaitAuction",
        prioritySeatId,
        pendingAcquisitionDeedId: undefined,
        pendingAuction: {
          deedId,
          highBid: payloadNumber(event, "highBid") ?? 0,
          highBidderSeatId: payloadSeatId(event, "highBidderSeatId"),
          prioritySeatId,
          passedSeatIds: payloadStringArray(event, "passedSeatIds") ?? [],
        },
      });
    }
    case "AuctionBidPlaced": {
      if (state.phase === "ImprovementAuction" && state.pendingImprovementAuction !== undefined) {
        const bidderSeatId = payloadSeatId(event, "bidderSeatId");
        const amount = payloadNumber(event, "amount");
        if (bidderSeatId === undefined || amount === undefined) return state;
        const nextPrioritySeatId = payloadSeatId(event, "nextPrioritySeatId");
        return freezeState({
          ...state,
          prioritySeatId: nextPrioritySeatId ?? state.pendingImprovementAuction.prioritySeatId,
          pendingImprovementAuction: {
            ...state.pendingImprovementAuction,
            highBid: amount,
            highBidderSeatId: bidderSeatId,
            prioritySeatId: nextPrioritySeatId ?? state.pendingImprovementAuction.prioritySeatId,
          },
        });
      }
      const deedId = payloadSeatId(event, "deedId");
      const bidderSeatId = payloadSeatId(event, "bidderSeatId");
      const amount = payloadNumber(event, "amount");
      if (
        deedId === undefined ||
        bidderSeatId === undefined ||
        amount === undefined ||
        state.pendingAuction?.deedId !== deedId
      ) {
        return state;
      }
      return freezeState({
        ...state,
        phase: "AwaitAuction",
        prioritySeatId:
          payloadSeatId(event, "nextPrioritySeatId") ?? state.pendingAuction.prioritySeatId,
        pendingAuction: {
          ...state.pendingAuction,
          highBid: amount,
          highBidderSeatId: bidderSeatId,
          prioritySeatId:
            payloadSeatId(event, "nextPrioritySeatId") ?? state.pendingAuction.prioritySeatId,
        },
      });
    }
    case "AuctionPassed": {
      if (state.phase === "ImprovementAuction" && state.pendingImprovementAuction !== undefined) {
        const passerSeatId = payloadSeatId(event, "passerSeatId");
        if (passerSeatId === undefined) return state;
        const nextPrioritySeatId = payloadSeatId(event, "nextPrioritySeatId");
        return freezeState({
          ...state,
          prioritySeatId: nextPrioritySeatId ?? state.pendingImprovementAuction.prioritySeatId,
          pendingImprovementAuction: {
            ...state.pendingImprovementAuction,
            prioritySeatId: nextPrioritySeatId ?? state.pendingImprovementAuction.prioritySeatId,
            passedSeatIds: state.pendingImprovementAuction.passedSeatIds.includes(passerSeatId)
              ? state.pendingImprovementAuction.passedSeatIds
              : [...state.pendingImprovementAuction.passedSeatIds, passerSeatId],
          },
        });
      }
      const deedId = payloadSeatId(event, "deedId");
      const passerSeatId = payloadSeatId(event, "passerSeatId");
      if (
        deedId === undefined ||
        passerSeatId === undefined ||
        state.pendingAuction?.deedId !== deedId
      ) {
        return state;
      }
      return freezeState({
        ...state,
        phase: "AwaitAuction",
        prioritySeatId:
          payloadSeatId(event, "nextPrioritySeatId") ?? state.pendingAuction.prioritySeatId,
        pendingAuction: {
          ...state.pendingAuction,
          prioritySeatId:
            payloadSeatId(event, "nextPrioritySeatId") ?? state.pendingAuction.prioritySeatId,
          passedSeatIds: state.pendingAuction.passedSeatIds.includes(passerSeatId)
            ? state.pendingAuction.passedSeatIds
            : [...state.pendingAuction.passedSeatIds, passerSeatId],
        },
      });
    }
    case "AuctionClosed": {
      if (state.phase === "ImprovementAuction") {
        return freezeState({
          ...state,
          phase: "ResolveMove",
          prioritySeatId: undefined,
          pendingImprovementAuction: undefined,
          scarceImprovementDemands: [],
        });
      }
      const deedId = payloadSeatId(event, "deedId");
      const sold = payloadBoolean(event, "sold");
      const winningBid = payloadNumber(event, "winningBid");
      const winnerSeatId = payloadSeatId(event, "winnerSeatId");
      if (
        deedId === undefined ||
        sold === undefined ||
        winningBid === undefined ||
        winningBid < 0 ||
        state.pendingAuction?.deedId !== deedId
      ) {
        return state;
      }
      if (!sold) {
        return freezeState({
          ...state,
          phase: "ResolveMove",
          pendingAcquisitionDeedId: undefined,
          pendingAuction: undefined,
        });
      }
      if (winnerSeatId === undefined) return state;
      const winner = findSeat(state, winnerSeatId);
      const deed = state.deeds.find((candidate) => candidate.deedId === deedId);
      if (
        winner === undefined ||
        deed === undefined ||
        deed.ownerSeatId !== undefined ||
        !Number.isSafeInteger(winner.balance - winningBid) ||
        !Number.isSafeInteger(state.bank.cash + winningBid)
      ) {
        return state;
      }
      return freezeState({
        ...state,
        phase: "ResolveMove",
        pendingAcquisitionDeedId: undefined,
        pendingAuction: undefined,
        seats: state.seats.map((seat) =>
          seat.seatId === winnerSeatId
            ? { ...seat, balance: seat.balance - winningBid, deedIds: [...seat.deedIds, deedId] }
            : seat,
        ),
        deeds: state.deeds.map((candidate) =>
          candidate.deedId === deedId ? { ...candidate, ownerSeatId: winnerSeatId } : candidate,
        ),
        bank: {
          ...state.bank,
          cash: state.bank.cash + winningBid,
          deedIds: state.bank.deedIds.filter((candidate) => candidate !== deedId),
        },
      });
    }
    case "ScarceImprovementRequested": {
      const seatId = payloadSeatId(event, "seatId");
      const deedId = payloadSeatId(event, "deedId");
      const fromLevel = payloadNumber(event, "fromLevel");
      const toLevel = payloadNumber(event, "toLevel");
      const inventoryKind = payloadSeatId(event, "inventoryKind");
      const inventoryDelta = payloadNumber(event, "inventoryDelta");
      const baseCost = payloadNumber(event, "baseCost");
      if (
        seatId === undefined ||
        deedId === undefined ||
        fromLevel === undefined ||
        toLevel === undefined ||
        inventoryKind === undefined ||
        inventoryDelta === undefined ||
        baseCost === undefined
      ) {
        return state;
      }
      const existing = state.scarceImprovementDemands ?? [];
      if (existing.some((demand) => demand.seatId === seatId && demand.deedId === deedId)) {
        return state;
      }
      return freezeState({
        ...state,
        scarceImprovementDemands: [
          ...existing,
          { seatId, deedId, fromLevel, toLevel, inventoryKind, inventoryDelta, baseCost },
        ],
      });
    }
    case "ScarceImprovementAwarded": {
      const seatId = payloadSeatId(event, "seatId");
      const deedId = payloadSeatId(event, "deedId");
      const toLevel = payloadNumber(event, "toLevel");
      const amount = payloadNumber(event, "amount");
      const inventoryKind = payloadSeatId(event, "inventoryKind");
      const inventoryDelta = payloadNumber(event, "inventoryDelta");
      if (
        seatId === undefined ||
        deedId === undefined ||
        toLevel === undefined ||
        amount === undefined ||
        inventoryKind === undefined ||
        inventoryDelta === undefined
      ) {
        return state;
      }
      const seat = findSeat(state, seatId);
      const deed = state.deeds.find((candidate) => candidate.deedId === deedId);
      const inventory = state.bank.improvementInventory[inventoryKind];
      const remainingDemands = payloadDemands(event, "remainingDemands");
      const nextBalance = seat === undefined ? undefined : seat.balance - amount;
      const nextBankCash = state.bank.cash + amount;
      const nextInventory = inventory === undefined ? undefined : inventory - inventoryDelta;
      if (
        seat === undefined ||
        deed === undefined ||
        inventory === undefined ||
        nextBalance === undefined ||
        !Number.isSafeInteger(nextBalance) ||
        nextBalance < 0 ||
        !Number.isSafeInteger(nextBankCash) ||
        nextInventory === undefined ||
        !Number.isSafeInteger(nextInventory) ||
        nextInventory < 0
      ) {
        return state;
      }
      return freezeState({
        ...state,
        phase: "ResolveMove",
        prioritySeatId: undefined,
        pendingImprovementAuction: undefined,
        scarceImprovementDemands: remainingDemands,
        seats: state.seats.map((candidate) =>
          candidate.seatId === seatId ? { ...candidate, balance: nextBalance } : candidate,
        ),
        deeds: state.deeds.map((candidate) =>
          candidate.deedId === deedId ? { ...candidate, improvementLevel: toLevel } : candidate,
        ),
        bank: {
          ...state.bank,
          cash: nextBankCash,
          improvementInventory: {
            ...state.bank.improvementInventory,
            [inventoryKind]: nextInventory,
          },
        },
      });
    }
    // Improvement events carry the complete transition delta so replay does
    // not consult content or a random source. RULE-008, CONTENT-005, ENG-023.
    case "ImprovementBought":
    case "ImprovementSold": {
      const deedId = payloadSeatId(event, "deedId");
      const seatId = payloadSeatId(event, "seatId");
      const toLevel = payloadNumber(event, "toLevel");
      const amount = payloadNumber(event, "amount");
      const inventoryDelta = payloadNumber(event, "inventoryDelta");
      const inventoryKind = payloadSeatId(event, "inventoryKind");
      if (
        deedId === undefined ||
        seatId === undefined ||
        toLevel === undefined ||
        toLevel < 0 ||
        amount === undefined ||
        amount < 0 ||
        inventoryDelta === undefined ||
        inventoryKind === undefined
      ) {
        return state;
      }
      const deed = state.deeds.find((candidate) => candidate.deedId === deedId);
      const seat = findSeat(state, seatId);
      const inventory = state.bank.improvementInventory[inventoryKind];
      if (
        deed === undefined ||
        seat === undefined ||
        inventory === undefined ||
        !Number.isSafeInteger(inventory + inventoryDelta)
      ) {
        return state;
      }
      const buying = event.type === "ImprovementBought";
      const nextBalance = buying ? seat.balance - amount : seat.balance + amount;
      const nextBankCash = buying ? state.bank.cash + amount : state.bank.cash - amount;
      const nextInventory = inventory + (buying ? -inventoryDelta : inventoryDelta);
      if (
        !Number.isSafeInteger(nextBalance) ||
        !Number.isSafeInteger(nextBankCash) ||
        !Number.isSafeInteger(nextInventory) ||
        nextInventory < 0
      ) {
        return state;
      }
      return freezeState({
        ...state,
        phase: state.phase,
        seats: state.seats.map((candidate) =>
          candidate.seatId === seatId ? { ...candidate, balance: nextBalance } : candidate,
        ),
        deeds: state.deeds.map((candidate) =>
          candidate.deedId === deedId ? { ...candidate, improvementLevel: toLevel } : candidate,
        ),
        bank: {
          ...state.bank,
          cash: nextBankCash,
          improvementInventory: {
            ...state.bank.improvementInventory,
            [inventoryKind]: nextInventory,
          },
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
        ...(state.scarceImprovementDemands === undefined ? {} : { scarceImprovementDemands: [] }),
        ...(state.pendingImprovementAuction === undefined
          ? {}
          : { pendingImprovementAuction: undefined }),
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

function shuffleCardIds(
  cardIds: readonly string[],
  prng: PrngState,
): { readonly cardIds: readonly string[]; readonly prng: PrngState } {
  const shuffled = [...cardIds];
  let next = prng;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const draw = nextInt(next, index + 1);
    next = draw.next;
    const swapIndex = draw.value;
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (current === undefined || swap === undefined) continue;
    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }
  return { cardIds: Object.freeze(shuffled), prng: next };
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

function nextAuctionSeatId(
  state: GameState,
  afterSeatId: SeatId,
  passedSeatIds: readonly SeatId[],
): SeatId | undefined {
  const startIndex = state.seats.findIndex((seat) => seat.seatId === afterSeatId);
  if (startIndex < 0) return undefined;
  for (let offset = 1; offset <= state.seats.length; offset += 1) {
    const candidate = state.seats[(startIndex + offset) % state.seats.length];
    if (candidate?.status === "active" && !passedSeatIds.includes(candidate.seatId)) {
      return candidate.seatId;
    }
  }
  return undefined;
}

function nextDemandSeatId(
  state: GameState,
  afterSeatId: SeatId,
  demands: readonly ScarceImprovementDemand[],
  passedSeatIds: readonly SeatId[],
): SeatId | undefined {
  const demandSeatIds = new Set(demands.map((demand) => demand.seatId));
  const startIndex = state.seats.findIndex((seat) => seat.seatId === afterSeatId);
  if (startIndex < 0) return undefined;
  for (let offset = 1; offset <= state.seats.length; offset += 1) {
    const candidate = state.seats[(startIndex + offset) % state.seats.length];
    if (
      candidate?.status === "active" &&
      demandSeatIds.has(candidate.seatId) &&
      !passedSeatIds.includes(candidate.seatId)
    ) {
      return candidate.seatId;
    }
  }
  return undefined;
}

function improvementAuctionOutcome(
  state: GameState,
  auction: PendingImprovementAuction,
): AuctionOutcome {
  const demandSeatIds = [...new Set(auction.demands.map((demand) => demand.seatId))].filter(
    (seatId) => state.seats.some((seat) => seat.seatId === seatId && seat.status === "active"),
  );
  const nonPassedSeatIds = demandSeatIds.filter(
    (seatId) => !auction.passedSeatIds.includes(seatId),
  );
  if (auction.highBidderSeatId !== undefined && nonPassedSeatIds.length === 1) {
    return nonPassedSeatIds[0] === auction.highBidderSeatId
      ? { kind: "sale", winnerSeatId: auction.highBidderSeatId }
      : { kind: "open" };
  }
  if (auction.highBidderSeatId === undefined && nonPassedSeatIds.length === 0) {
    return { kind: "noSale" };
  }
  return { kind: "open" };
}

type AuctionOutcome =
  | { readonly kind: "open" }
  | { readonly kind: "noSale" }
  | { readonly kind: "sale"; readonly winnerSeatId: SeatId };

function auctionOutcome(state: GameState, auction: PendingAuction): AuctionOutcome {
  const activeSeatIds = state.seats
    .filter((seat) => seat.status === "active")
    .map((seat) => seat.seatId);
  const nonPassedSeatIds = activeSeatIds.filter(
    (seatId) => !auction.passedSeatIds.includes(seatId),
  );
  if (auction.highBidderSeatId !== undefined && nonPassedSeatIds.length === 1) {
    return nonPassedSeatIds[0] === auction.highBidderSeatId
      ? { kind: "sale", winnerSeatId: auction.highBidderSeatId }
      : { kind: "open" };
  }
  if (auction.highBidderSeatId === undefined && nonPassedSeatIds.length === 0) {
    return { kind: "noSale" };
  }
  return { kind: "open" };
}

function validateAuctionTurn(
  state: GameState,
  actorSeatId: SeatId,
  rules: RuleSet,
): Rejection | PendingAuction {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "AwaitAuction" || state.pendingAuction === undefined) {
    return reject(
      "PHASE_MISMATCH",
      "AUCTION_NOT_PENDING",
      "An auction command requires an active auction.",
    );
  }
  const auction = state.pendingAuction;
  if (auction.prioritySeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "AUCTION_PRIORITY_REQUIRED",
      "Only the current auction priority seat may act.",
    );
  }
  if (auction.passedSeatIds.includes(actorSeatId)) {
    return reject(
      "ILLEGAL_ACTION",
      "AUCTION_ALREADY_PASSED",
      "A seat that passed cannot act again in this auction.",
    );
  }
  const deed = rules.content.deeds.find((candidate) => candidate.deedId === auction.deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === auction.deedId);
  if (
    deed === undefined ||
    deedState === undefined ||
    deedState.ownerSeatId !== undefined ||
    !state.bank.deedIds.includes(auction.deedId)
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "AUCTION_DEED_NOT_BANK_OWNED",
      "The auction deed must remain bank-owned until settlement.",
    );
  }
  if (
    !Number.isSafeInteger(auction.highBid) ||
    auction.highBid < 0 ||
    (auction.highBidderSeatId !== undefined &&
      !state.seats.some(
        (seat) => seat.seatId === auction.highBidderSeatId && seat.status === "active",
      ))
  ) {
    return reject("INVALID_PAYLOAD", "INVALID_AUCTION_STATE", "The auction high bid is not valid.");
  }
  return auction;
}

/** RULE-004, RULE-006: resolve one no-timer auction command atomically. */
function resolveAuction(
  state: GameState,
  actorSeatId: SeatId,
  command: "bid" | "pass",
  amount: number | undefined,
  rules: RuleSet,
): Resolution {
  const validated = validateAuctionTurn(state, actorSeatId, rules);
  if ("ok" in validated) return validated;
  const auction = validated;
  const actor = findSeat(state, actorSeatId);
  if (actor === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_SEAT", "The auction seat is not in the game.");
  }

  if (command === "bid") {
    if (amount === undefined || !Number.isSafeInteger(amount) || amount < 0) {
      return reject(
        "INVALID_PAYLOAD",
        "INVALID_BID_AMOUNT",
        "Auction bids must be non-negative integer minor units.",
      );
    }
    if (amount <= auction.highBid) {
      return reject(
        "ILLEGAL_ACTION",
        "BID_MUST_INCREASE",
        "A bid must be greater than the current high bid.",
      );
    }
    if (amount > actor.balance) {
      return reject(
        "ILLEGAL_ACTION",
        "BID_EXCEEDS_BALANCE",
        "A bid cannot exceed the bidder's current balance.",
      );
    }
  }

  const nextAuction: PendingAuction =
    command === "bid"
      ? {
          ...auction,
          highBid: amount as number,
          highBidderSeatId: actorSeatId,
          prioritySeatId:
            nextAuctionSeatId(state, actorSeatId, auction.passedSeatIds) ?? actorSeatId,
        }
      : {
          ...auction,
          passedSeatIds: [...auction.passedSeatIds, actorSeatId],
          prioritySeatId:
            nextAuctionSeatId(state, actorSeatId, [...auction.passedSeatIds, actorSeatId]) ??
            actorSeatId,
        };
  const outcome = auctionOutcome(state, nextAuction);
  const actionEvent = freezeEvent({
    type: command === "bid" ? "AuctionBidPlaced" : "AuctionPassed",
    eventVersion: 1,
    actorSeatId,
    payload:
      command === "bid"
        ? {
            deedId: auction.deedId,
            bidderSeatId: actorSeatId,
            amount,
            previousBid: auction.highBid,
            nextPrioritySeatId: outcome.kind === "open" ? nextAuction.prioritySeatId : undefined,
          }
        : {
            deedId: auction.deedId,
            passerSeatId: actorSeatId,
            nextPrioritySeatId: outcome.kind === "open" ? nextAuction.prioritySeatId : undefined,
          },
  } satisfies EngineEvent);
  const events: EngineEvent[] = [actionEvent];
  if (outcome.kind !== "open") {
    events.push(
      freezeEvent({
        type: "AuctionClosed",
        eventVersion: 1,
        actorSeatId,
        payload:
          outcome.kind === "sale"
            ? {
                deedId: auction.deedId,
                sold: true,
                winnerSeatId: outcome.winnerSeatId,
                winningBid: nextAuction.highBid,
              }
            : { deedId: auction.deedId, sold: false, winningBid: 0 },
      }),
    );
  }
  return {
    ok: true,
    state: freezeState(events.reduce(applyEvent, state)),
    events: Object.freeze(events),
  };
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

interface RentCalculation {
  readonly amount: Money;
  readonly basis: Readonly<Record<string, boolean | number | string>>;
}

function calculateRent(
  state: GameState,
  rules: RuleSet,
  deed: Deed,
  deedState: DeedState,
  ownerSeatId: SeatId,
): RentCalculation | Rejection {
  const ownerDeeds = state.deeds.filter((candidate) => candidate.ownerSeatId === ownerSeatId);
  switch (deed.category) {
    case "district": {
      const districtId = deed.districtId;
      const district = rules.content.districts.find(
        (candidate) => candidate.districtId === districtId,
      );
      if (district === undefined || deed.completeDistrictMultiplier === undefined) {
        return reject(
          "INVALID_PAYLOAD",
          "INVALID_DISTRICT_RENT_DATA",
          "The district deed has no complete-district rent data.",
        );
      }
      const complete = district.deedIds.every((districtDeedId) => {
        const member = state.deeds.find((candidate) => candidate.deedId === districtDeedId);
        return member?.ownerSeatId === ownerSeatId && !member.mortgaged;
      });
      if (deedState.improvementLevel === 0) {
        const multiplier = complete ? deed.completeDistrictMultiplier : 1;
        const amount = deed.baseRent * multiplier;
        if (!Number.isSafeInteger(amount)) {
          return reject(
            "INVALID_PAYLOAD",
            "RENT_OVERFLOW",
            "The rent does not fit in minor units.",
          );
        }
        return {
          amount,
          basis: {
            category: "district",
            improvementLevel: 0,
            completeDistrict: complete,
            multiplier,
          },
        };
      }
      const level = deed.improvementLevels?.find(
        (candidate) => candidate.level === deedState.improvementLevel,
      );
      if (level === undefined) {
        return reject(
          "INVALID_PAYLOAD",
          "INVALID_IMPROVEMENT_LEVEL",
          "The deed improvement level has no rent data.",
        );
      }
      return {
        amount: level.rent,
        basis: { category: "district", improvementLevel: level.level, completeDistrict: complete },
      };
    }
    case "transit": {
      const count = ownerDeeds.filter((candidate) => {
        const owned = rules.content.deeds.find(
          (candidateDeed) => candidateDeed.deedId === candidate.deedId,
        );
        return owned?.category === "transit";
      }).length;
      const amount = deed.transitRentByCount?.[count];
      if (amount === undefined) {
        return reject(
          "INVALID_PAYLOAD",
          "INVALID_TRANSIT_RENT_DATA",
          "The transit deed has no rent for the owner's deed count.",
        );
      }
      return { amount, basis: { category: "transit", ownedTransitCount: count } };
    }
    case "utility": {
      const count = ownerDeeds.filter((candidate) => {
        const owned = rules.content.deeds.find(
          (candidateDeed) => candidateDeed.deedId === candidate.deedId,
        );
        return owned?.category === "utility";
      }).length;
      const multiplier = deed.utilityMultiplierByCount?.[count];
      const dice = state.lastRoll;
      if (multiplier === undefined || dice === undefined) {
        return reject(
          "INVALID_PAYLOAD",
          "UTILITY_ROLL_REQUIRED",
          "Utility rent requires the recorded movement roll.",
        );
      }
      const rollTotal = dice[0] + dice[1];
      const amount = rollTotal * multiplier;
      if (!Number.isSafeInteger(amount)) {
        return reject("INVALID_PAYLOAD", "RENT_OVERFLOW", "The rent does not fit in minor units.");
      }
      return {
        amount,
        basis: { category: "utility", ownedUtilityCount: count, rollTotal, multiplier },
      };
    }
  }
}

function moveEvent(
  actorSeatId: SeatId,
  movement: Movement,
  movementType: "normalDice" | "forced",
  remainingEffects: readonly QueuedEffect[] = [],
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
      remainingEffects,
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
  remainingEffects: readonly QueuedEffect[] = [],
): GameState {
  let nextState = freezeState({
    ...state,
    seats: state.seats.map((seat) =>
      seat.seatId === actorSeatId
        ? { ...seat, position: movement.toPosition, detained: false, detentionTurnsRemaining: 0 }
        : seat,
    ),
  });
  events.push(moveEvent(actorSeatId, movement, movementType, remainingEffects));

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

  const deckOrders: { readonly deckId: string; readonly cardIds: readonly string[] }[] = [];
  const decks: DeckState[] = [];
  for (const deck of rules.content.decks) {
    const shuffled = shuffleCardIds(
      deck.cards.map((card) => card.cardId),
      prng,
    );
    prng = shuffled.prng;
    deckOrders.push({ deckId: deck.deckId, cardIds: shuffled.cardIds });
    decks.push({ deckId: deck.deckId, drawPile: shuffled.cardIds, discardPile: [] });
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
    decks,
    resolvingCard: undefined,
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
        // Shuffle order is an internal event fact for replay. The server must
        // strip it from every public projection. ENG-022, PROTO-004.
        deckOrders,
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

function paymentObligation(
  state: GameState,
  actorSeatId: SeatId,
  amount: Money,
  creditorSeatId: SeatId | undefined,
  reasonCode: string,
  continuation: readonly QueuedEffect[],
): QueueResolution {
  const event = freezeEvent({
    type: "ObligationCreated",
    eventVersion: 1,
    actorSeatId,
    payload: {
      debtorSeatId: actorSeatId,
      ...(creditorSeatId === undefined ? {} : { creditorSeatId }),
      amount,
      reasonCode,
      remainingEffects: continuation,
    },
  } satisfies EngineEvent);
  return {
    state: freezeState(applyEvent(state, event)),
    events: Object.freeze([event]),
  };
}

function cardDefinition(rules: RuleSet, deckId: string, cardId: string) {
  return rules.content.decks
    .find((deck) => deck.deckId === deckId)
    ?.cards.find((card) => card.cardId === cardId);
}

function bankPaymentEvent(
  actorSeatId: SeatId,
  amount: Money,
  reasonCode: string,
  remainingEffects: readonly QueuedEffect[] = [],
): EngineEvent {
  return freezeEvent({
    type: "FeePaid",
    eventVersion: 1,
    actorSeatId,
    payload: { seatId: actorSeatId, amount, reasonCode, remainingEffects },
  });
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
  if (seat === undefined || deed === undefined || deedState === undefined) {
    return { state: freezeState({ ...state, effectQueue: [] }), events: Object.freeze([]) };
  }

  if (deedState.ownerSeatId !== undefined) {
    if (deedState.ownerSeatId === actorSeatId || deedState.mortgaged) {
      // RULE-005: a player never pays rent to themselves, and a mortgaged deed
      // earns no rent. Both cases finish the landing without an obligation.
      return {
        state: freezeState({ ...state, phase: "ResolveMove", effectQueue: [] }),
        events: Object.freeze([]),
      };
    }

    const rent = calculateRent(state, rules, deed, deedState, deedState.ownerSeatId);
    if ("ok" in rent) {
      return { state: freezeState({ ...state, effectQueue: [] }), events: Object.freeze([]) };
    }
    const creditorSeatId = deedState.ownerSeatId;
    const creditor = findSeat(state, creditorSeatId);
    if (creditor === undefined || !Number.isSafeInteger(creditor.balance + rent.amount)) {
      return {
        state: freezeState({ ...state, effectQueue: [] }),
        events: Object.freeze([]),
      };
    }
    const reasonCode = "RENT_DUE";
    const continuation: readonly QueuedEffect[] = [];
    if (seat.balance < rent.amount) {
      const obligation: PendingObligation = {
        debtorSeatId: actorSeatId,
        creditorSeatId,
        amount: rent.amount,
        reasonCode,
        continuation,
      };
      return {
        state: freezeState({
          ...state,
          phase: "AwaitDebt",
          effectQueue: continuation,
          obligation,
        }),
        events: Object.freeze([
          freezeEvent({
            type: "ObligationCreated",
            eventVersion: 1,
            actorSeatId,
            payload: {
              debtorSeatId: actorSeatId,
              creditorSeatId,
              amount: rent.amount,
              reasonCode,
              reason: "RENT_DUE",
              deedId: deed.deedId,
              ...rent.basis,
              remainingEffects: continuation,
            },
          }),
        ]),
      };
    }

    return {
      state: freezeState({
        ...state,
        phase: "ResolveMove",
        effectQueue: continuation,
        obligation: undefined,
        seats: state.seats.map((candidate) =>
          candidate.seatId === actorSeatId
            ? { ...candidate, balance: candidate.balance - rent.amount }
            : candidate.seatId === creditorSeatId
              ? { ...candidate, balance: candidate.balance + rent.amount }
              : candidate,
        ),
      }),
      events: Object.freeze([
        freezeEvent({
          type: "RentPaid",
          eventVersion: 1,
          actorSeatId,
          payload: {
            deedId: deed.deedId,
            debtorSeatId: actorSeatId,
            creditorSeatId,
            amount: rent.amount,
            ...rent.basis,
          },
        }),
      ]),
    };
  }

  if (!state.bank.deedIds.includes(deed.deedId)) {
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
    highBidderSeatId: undefined,
    prioritySeatId,
    passedSeatIds: [],
  } satisfies PendingAuction;
  return {
    state: freezeState({
      ...state,
      phase: "AwaitAuction",
      prioritySeatId,
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

    // A non-retained card leaves circulation once its final instruction has
    // completed. The card context is server-only; its identity is revealed by
    // the CardDrawn event, not by a future deck projection. ENG-022.
    if (
      nextState.resolvingCard !== undefined &&
      entry.sourceId !== nextState.resolvingCard.cardId
    ) {
      const card = nextState.resolvingCard;
      const discarded = freezeEvent({
        type: "CardDiscarded",
        eventVersion: 1,
        actorSeatId,
        payload: {
          deckId: card.deckId,
          cardId: card.cardId,
          remainingEffects: [entry, ...remaining],
          resolvingCardStack: nextState.resolvingCardStack ?? [],
        },
      } satisfies EngineEvent);
      events.push(discarded);
      nextState = freezeState(applyEvent(nextState, discarded));
      continue;
    }

    const effect = entry.effect;
    switch (effect.type) {
      case "Draw": {
        const deck = nextState.decks?.find((candidate) => candidate.deckId === effect.deckId);
        const contentDeck = rules.content.decks.find(
          (candidate) => candidate.deckId === effect.deckId,
        );
        if (deck === undefined || contentDeck === undefined) break;

        let drawPile = [...deck.drawPile];
        let discardPile = [...deck.discardPile];
        let prng = nextState.prng;
        if (drawPile.length === 0) {
          if (discardPile.length === 0) break;
          const reshuffled = shuffleCardIds(discardPile, prng);
          drawPile = [...reshuffled.cardIds];
          discardPile = [];
          prng = reshuffled.prng;
        }
        const cardId = drawPile.shift();
        const card =
          cardId === undefined ? undefined : cardDefinition(rules, effect.deckId, cardId);
        if (card === undefined || cardId === undefined) break;
        const cardEffects = card.effects.map((effect) => ({ sourceId: card.cardId, effect }));
        const queuedEffects = [...cardEffects, ...remaining];
        const resolvingCardStack =
          nextState.resolvingCard === undefined
            ? (nextState.resolvingCardStack ?? [])
            : [...(nextState.resolvingCardStack ?? []), nextState.resolvingCard];
        const drawEvent = freezeEvent({
          type: "CardDrawn",
          eventVersion: 1,
          actorSeatId,
          payload: {
            deckId: effect.deckId,
            cardId,
            retainable: card.retainable,
            remainingCardIds: drawPile,
            discardCardIds: discardPile,
            remainingEffects: queuedEffects,
            resolvingCardStack,
          },
        } satisfies EngineEvent);
        events.push(drawEvent);
        nextState = freezeState({ ...nextState, prng });
        nextState = freezeState(applyEvent(nextState, drawEvent));
        continue;
      }
      case "PayBank": {
        const amount = effect.amount;
        const seat = findSeat(nextState, actorSeatId);
        if (seat === undefined || !Number.isSafeInteger(amount) || amount < 0) break;
        if (seat.balance < amount) {
          return paymentObligation(nextState, actorSeatId, amount, undefined, "CARD_PAY_BANK", [
            entry,
            ...remaining,
          ]);
        }
        const payment = bankPaymentEvent(actorSeatId, amount, "CARD_PAY_BANK", remaining);
        events.push(payment);
        nextState = freezeState(applyEvent(nextState, payment));
        nextState = freezeState({ ...nextState, effectQueue: remaining });
        continue;
      }
      case "CollectBank": {
        const amount = effect.amount;
        if (!Number.isSafeInteger(amount) || amount < 0) break;
        const payment = freezeEvent({
          type: "BankPaymentCollected",
          eventVersion: 1,
          actorSeatId,
          payload: {
            seatId: actorSeatId,
            amount,
            reasonCode: "CARD_COLLECT_BANK",
            remainingEffects: remaining,
          },
        } satisfies EngineEvent);
        events.push(payment);
        nextState = freezeState(applyEvent(nextState, payment));
        nextState = freezeState({ ...nextState, effectQueue: remaining });
        continue;
      }
      case "PayEachPlayer":
      case "CollectEachPlayer": {
        const amount = effect.amount;
        if (!Number.isSafeInteger(amount) || amount < 0) break;
        const otherSeats = nextState.seats.filter(
          (seat) => seat.status === "active" && seat.seatId !== actorSeatId,
        );
        let working = nextState;
        for (const otherSeat of otherSeats) {
          const payerSeatId = effect.type === "PayEachPlayer" ? actorSeatId : otherSeat.seatId;
          const recipientSeatId = effect.type === "PayEachPlayer" ? otherSeat.seatId : actorSeatId;
          const payer = findSeat(working, payerSeatId);
          if (payer === undefined) break;
          if (payer.balance < amount) {
            return paymentObligation(
              working,
              actorSeatId,
              amount,
              recipientSeatId,
              effect.type === "PayEachPlayer" ? "CARD_PAY_EACH_PLAYER" : "CARD_COLLECT_EACH_PLAYER",
              remaining,
            );
          }
          const payment = freezeEvent({
            type: "PlayerPaymentCollected",
            eventVersion: 1,
            actorSeatId,
            payload: {
              payerSeatId,
              recipientSeatId,
              amount,
              remainingEffects: remaining,
              reasonCode:
                effect.type === "PayEachPlayer"
                  ? "CARD_PAY_EACH_PLAYER"
                  : "CARD_COLLECT_EACH_PLAYER",
            },
          } satisfies EngineEvent);
          events.push(payment);
          working = freezeState(applyEvent(working, payment));
        }
        nextState = freezeState({ ...working, effectQueue: remaining });
        continue;
      }
      case "RepairCharge": {
        const seat = findSeat(nextState, actorSeatId);
        if (seat === undefined) break;
        let improvements = 0;
        let landmarks = 0;
        for (const deedState of nextState.deeds) {
          if (deedState.ownerSeatId !== actorSeatId || deedState.improvementLevel <= 0) continue;
          const deed = rules.content.deeds.find(
            (candidate) => candidate.deedId === deedState.deedId,
          );
          const maxLevel = deed?.improvementLevels?.at(-1)?.level ?? 0;
          if (deedState.improvementLevel === maxLevel) landmarks += 1;
          else improvements += deedState.improvementLevel;
        }
        const amount = improvements * effect.perImprovement + landmarks * effect.perLandmark;
        if (!Number.isSafeInteger(amount) || amount < 0) break;
        if (seat.balance < amount) {
          return paymentObligation(
            nextState,
            actorSeatId,
            amount,
            undefined,
            "CARD_REPAIR_CHARGE",
            [entry, ...remaining],
          );
        }
        const payment = bankPaymentEvent(actorSeatId, amount, "CARD_REPAIR_CHARGE", remaining);
        events.push(payment);
        nextState = freezeState(applyEvent(nextState, payment));
        nextState = freezeState({ ...nextState, effectQueue: remaining });
        continue;
      }
      case "GrantDetentionReleaseCard": {
        const card = nextState.resolvingCard;
        if (card === undefined || !card.retainable) break;
        const granted = freezeEvent({
          type: "DetentionReleaseCardGranted",
          eventVersion: 1,
          actorSeatId,
          payload: {
            seatId: actorSeatId,
            cardId: card.cardId,
            deckId: card.deckId,
            remainingEffects: remaining,
            resolvingCardStack: nextState.resolvingCardStack ?? [],
          },
        } satisfies EngineEvent);
        events.push(granted);
        nextState = freezeState(applyEvent(nextState, granted));
        nextState = freezeState({ ...nextState, effectQueue: remaining });
        continue;
      }
      case "MoveBy": {
        const seat = findSeat(nextState, actorSeatId);
        if (seat === undefined) break;
        const movement = walkRoute(rules, seat.position, effect.spaces, effect.spaces >= 0);
        if (!("toPosition" in movement)) break;
        const destination = findSpaceAtPosition(rules, movement.toPosition);
        if (destination === undefined) break;
        nextState = applyMovement(
          nextState,
          actorSeatId,
          movement,
          rules,
          events,
          "forced",
          false,
          [...queuedEffects(destination), ...remaining],
        );
        nextState = freezeState({
          ...nextState,
          effectQueue: [...queuedEffects(destination), ...remaining],
        });
        continue;
      }
      case "MoveTo": {
        const seat = findSeat(nextState, actorSeatId);
        const destination = findSpace(rules, effect.spaceId);
        if (seat === undefined || destination === undefined) break;
        const movement = movementToTarget(
          rules,
          seat.position,
          destination,
          effect.collectStartWhenCrossed,
        );
        if (!("toPosition" in movement)) break;
        nextState = applyMovement(
          nextState,
          actorSeatId,
          movement,
          rules,
          events,
          "forced",
          false,
          [...queuedEffects(destination), ...remaining],
        );
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
        if (nextState.resolvingCard !== undefined) {
          const card = nextState.resolvingCard;
          const discarded = freezeEvent({
            type: "CardDiscarded",
            eventVersion: 1,
            actorSeatId,
            payload: {
              deckId: card.deckId,
              cardId: card.cardId,
              remainingEffects: [],
              resolvingCardStack: nextState.resolvingCardStack ?? [],
            },
          } satisfies EngineEvent);
          events.push(discarded);
          nextState = freezeState(applyEvent(nextState, discarded));
        }
        return { state: nextState, events: Object.freeze(events) };
      }
      case "Choose": {
        const continuation = Object.freeze([...remaining]);
        nextState = freezeState({
          ...nextState,
          phase: "AwaitChoice",
          effectQueue: continuation,
          pendingChoice: { choiceId: effect.choiceId, continuation },
        });
        events.push(
          freezeEvent({
            type: "PendingChoiceCreated",
            eventVersion: 1,
            actorSeatId,
            payload: {
              choiceId: effect.choiceId,
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

  while (nextState.resolvingCard !== undefined) {
    const card = nextState.resolvingCard;
    const discarded = freezeEvent({
      type: "CardDiscarded",
      eventVersion: 1,
      actorSeatId,
      payload: {
        deckId: card.deckId,
        cardId: card.cardId,
        remainingEffects: [],
        resolvingCardStack: nextState.resolvingCardStack ?? [],
      },
    } satisfies EngineEvent);
    events.push(discarded);
    nextState = freezeState(applyEvent(nextState, discarded));
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
    highBidderSeatId: undefined,
    prioritySeatId,
    passedSeatIds: [],
  } satisfies PendingAuction;
  return {
    ok: true,
    state: freezeState({
      ...state,
      phase: "AwaitAuction",
      prioritySeatId,
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

function managementActorRejection(
  state: GameState,
  actorSeatId: SeatId,
  action: "mortgage" | "redeem",
): Rejection | undefined {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  const allowedPhase =
    state.phase === "ResolveMove" ||
    state.phase === "TurnStart" ||
    (action === "mortgage" && state.phase === "AwaitDebt");
  if (!allowedPhase) {
    return reject(
      "PHASE_MISMATCH",
      action === "mortgage" ? "MORTGAGE_REQUIRES_MANAGE_PHASE" : "REDEEM_REQUIRES_MANAGE_PHASE",
      "This deed action is not available during the current resolution phase.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may manage deeds.");
  }
  if (state.phase === "AwaitDebt" && state.obligation?.debtorSeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "DEBTOR_REQUIRED",
      "Only the debtor may mortgage assets during an obligation.",
    );
  }
  return undefined;
}

/** RULE-005, RULE-008: mortgage an eligible deed and pay its owner atomically. */
function resolveMortgage(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const phaseRejection = managementActorRejection(state, actorSeatId, "mortgage");
  if (phaseRejection !== undefined) return phaseRejection;
  const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === deedId);
  const actor = findSeat(state, actorSeatId);
  if (deed === undefined || deedState === undefined || actor === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_DEED", "The deed is not in the content ledger.");
  }
  if (deedState.ownerSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "DEED_NOT_OWNED", "Only the deed owner may mortgage it.");
  }
  if (deedState.mortgaged) {
    return reject("ILLEGAL_ACTION", "DEED_ALREADY_MORTGAGED", "The deed is already mortgaged.");
  }
  if (deedState.improvementLevel !== 0) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_PRESENT",
      "A deed with improvements cannot be mortgaged.",
    );
  }
  if (deed.category === "district" && deed.districtId !== undefined) {
    const district = rules.content.districts.find(
      (candidate) => candidate.districtId === deed.districtId,
    );
    if (
      district?.deedIds.some(
        (id) => state.deeds.find((item) => item.deedId === id)?.improvementLevel !== 0,
      )
    ) {
      return reject(
        "ILLEGAL_ACTION",
        "DISTRICT_HAS_IMPROVEMENTS",
        "A district deed cannot be mortgaged while any district deed has improvements.",
      );
    }
  }
  if (!Number.isSafeInteger(deed.mortgageValue) || deed.mortgageValue < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_MORTGAGE_VALUE",
      "The deed has no valid mortgage value.",
    );
  }
  if (!Number.isSafeInteger(state.bank.cash - deed.mortgageValue)) {
    return reject(
      "INVALID_PAYLOAD",
      "BANK_CASH_OVERFLOW",
      "The bank ledger cannot represent this mortgage payment.",
    );
  }
  const event = freezeEvent({
    type: "DeedMortgaged",
    eventVersion: 1,
    actorSeatId,
    payload: { deedId, ownerSeatId: actorSeatId, amount: deed.mortgageValue },
  } satisfies EngineEvent);
  return { ok: true, state: freezeState(applyEvent(state, event)), events: Object.freeze([event]) };
}

/** RULE-005, RULE-008: redeem a mortgage with content-defined integer charges. */
function resolveRedeemMortgage(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const phaseRejection = managementActorRejection(state, actorSeatId, "redeem");
  if (phaseRejection !== undefined) return phaseRejection;
  const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === deedId);
  const actor = findSeat(state, actorSeatId);
  if (deed === undefined || deedState === undefined || actor === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_DEED", "The deed is not in the content ledger.");
  }
  if (deedState.ownerSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "DEED_NOT_OWNED", "Only the deed owner may redeem it.");
  }
  if (!deedState.mortgaged) {
    return reject("ILLEGAL_ACTION", "DEED_NOT_MORTGAGED", "Only a mortgaged deed can be redeemed.");
  }
  if (
    !Number.isSafeInteger(deed.mortgageValue) ||
    deed.mortgageValue < 0 ||
    !Number.isSafeInteger(deed.redemptionCharge) ||
    deed.redemptionCharge < 0 ||
    !Number.isSafeInteger(deed.mortgageValue + deed.redemptionCharge)
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_REDEMPTION_DATA",
      "The deed has invalid redemption data.",
    );
  }
  const amount = deed.mortgageValue + deed.redemptionCharge;
  if (actor.balance < amount) {
    return reject(
      "ILLEGAL_ACTION",
      "INSUFFICIENT_FUNDS",
      "The active seat cannot afford this redemption.",
    );
  }
  if (!Number.isSafeInteger(state.bank.cash + amount)) {
    return reject(
      "INVALID_PAYLOAD",
      "BANK_CASH_OVERFLOW",
      "The bank ledger cannot represent this redemption payment.",
    );
  }
  const event = freezeEvent({
    type: "MortgageRedeemed",
    eventVersion: 1,
    actorSeatId,
    payload: {
      deedId,
      ownerSeatId: actorSeatId,
      amount,
      mortgageValue: deed.mortgageValue,
      redemptionCharge: deed.redemptionCharge,
    },
  } satisfies EngineEvent);
  return { ok: true, state: freezeState(applyEvent(state, event)), events: Object.freeze([event]) };
}

/**
 * Transfers one deed for future trade/bankruptcy reducers. A mortgaged deed
 * stays mortgaged; its transfer charge is paid atomically when possible, or
 * becomes a visible bank obligation. RULE-005, RULE-007, CONTENT-004.
 */
export function transferDeed(
  state: GameState,
  fromSeatId: SeatId,
  toSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === deedId);
  const fromSeat = findSeat(state, fromSeatId);
  const toSeat = findSeat(state, toSeatId);
  if (deed === undefined || deedState === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_DEED", "The deed is not in the content ledger.");
  }
  if (fromSeat === undefined || toSeat === undefined || fromSeatId === toSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "INVALID_TRANSFER_PARTIES",
      "A deed transfer needs two distinct seats.",
    );
  }
  if (deedState.ownerSeatId !== fromSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "DEED_NOT_OWNED",
      "The transferring seat does not own this deed.",
    );
  }
  if (!Number.isSafeInteger(deed.transferCharge) || deed.transferCharge < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_TRANSFER_CHARGE",
      "The deed has no valid transfer charge.",
    );
  }
  const transferCharge = deedState.mortgaged ? deed.transferCharge : 0;
  const chargePaid = toSeat.balance >= transferCharge ? transferCharge : 0;
  if (!Number.isSafeInteger(state.bank.cash + chargePaid)) {
    return reject(
      "INVALID_PAYLOAD",
      "BANK_CASH_OVERFLOW",
      "The bank ledger cannot represent this transfer charge.",
    );
  }
  const transferEvent = freezeEvent({
    type: "DeedTransferred",
    eventVersion: 1,
    actorSeatId: fromSeatId,
    payload: { deedId, fromSeatId, toSeatId, transferCharge, chargePaid },
  } satisfies EngineEvent);
  const transferred = applyEvent(state, transferEvent);
  if (chargePaid === transferCharge) {
    return { ok: true, state: freezeState(transferred), events: Object.freeze([transferEvent]) };
  }
  const debtEvent = freezeEvent({
    type: "ObligationCreated",
    eventVersion: 1,
    actorSeatId: toSeatId,
    payload: {
      debtorSeatId: toSeatId,
      amount: transferCharge,
      reasonCode: "MORTGAGED_DEED_TRANSFER_CHARGE",
      remainingEffects: state.effectQueue,
    },
  } satisfies EngineEvent);
  return {
    ok: true,
    state: freezeState(applyEvent(transferred, debtEvent)),
    events: Object.freeze([transferEvent, debtEvent]),
  };
}

interface ImprovementContext {
  readonly deed: Deed;
  readonly deedState: DeedState;
  readonly districtDeedStates: readonly DeedState[];
  readonly inventoryKind: string;
}

function improvementContext(
  state: GameState,
  rules: RuleSet,
  deedId: string,
): ImprovementContext | Rejection {
  const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedId);
  const deedState = state.deeds.find((candidate) => candidate.deedId === deedId);
  if (deed === undefined || deedState === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_DEED", "The improvement deed is not in the ledger.");
  }
  if (deed.category !== "district" || deed.districtId === undefined) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_REQUIRES_DISTRICT",
      "Only district deeds can carry improvements.",
    );
  }
  const district = rules.content.districts.find(
    (candidate) => candidate.districtId === deed.districtId,
  );
  if (district === undefined) {
    return reject("INVALID_PAYLOAD", "INVALID_DISTRICT", "The deed's district is not in content.");
  }
  const districtDeedStates = district.deedIds.map((districtDeedId) =>
    state.deeds.find((candidate) => candidate.deedId === districtDeedId),
  );
  if (districtDeedStates.some((candidate) => candidate === undefined)) {
    return reject(
      "INVALID_PAYLOAD",
      "INCOMPLETE_DEED_LEDGER",
      "Every district deed must be present in the ledger.",
    );
  }
  const inventoryKind = Object.keys(rules.content.economy.improvementInventory)[0];
  if (inventoryKind === undefined) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_IMPROVEMENT_INVENTORY",
      "Improvement content must declare an inventory pool.",
    );
  }
  return {
    deed,
    deedState,
    districtDeedStates: districtDeedStates as readonly DeedState[],
    inventoryKind,
  };
}

/** RULE-005, RULE-008: enforce ownership, complete districts, and even building. */
function resolveBuyImprovement(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "ResolveMove" && state.phase !== "TurnStart") {
    return reject(
      "PHASE_MISMATCH",
      "IMPROVEMENT_REQUIRES_MANAGE_PHASE",
      "Improvements may only be bought after movement resolution.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may buy improvements.");
  }
  const context = improvementContext(state, rules, deedId);
  if ("ok" in context) return context;
  const actor = findSeat(state, actorSeatId);
  if (actor === undefined || context.deedState.ownerSeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_NOT_OWNED",
      "A seat may only improve its own deed.",
    );
  }
  if (
    context.deedState.mortgaged ||
    context.districtDeedStates.some((deed) => deed.mortgaged) ||
    context.districtDeedStates.some((deed) => deed.ownerSeatId !== actorSeatId)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "DISTRICT_NOT_COMPLETE",
      "A district must be complete and unmortgaged before building.",
    );
  }
  const currentLevel = context.deedState.improvementLevel;
  const nextLevel = context.deed.improvementLevels?.find(
    (level) => level.level === currentLevel + 1,
  );
  if (nextLevel === undefined) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_AT_MAX_LEVEL",
      "The deed is already fully improved.",
    );
  }
  const lowestLevel = Math.min(...context.districtDeedStates.map((deed) => deed.improvementLevel));
  if (currentLevel > lowestLevel) {
    return reject(
      "ILLEGAL_ACTION",
      "EVEN_BUILDING_REQUIRED",
      "A deed cannot be improved ahead of the lowest deed in its district.",
    );
  }
  const cost = context.deed.improvementCost;
  if (cost === undefined || !Number.isSafeInteger(cost) || cost < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_IMPROVEMENT_COST",
      "The deed has no valid improvement cost.",
    );
  }
  const inventory = state.bank.improvementInventory[context.inventoryKind];
  const inventoryDelta = rules.configuration.unlimitedImprovementInventory
    ? 0
    : nextLevel.inventoryDelta;
  if (
    (!rules.configuration.unlimitedImprovementInventory && inventory === undefined) ||
    !Number.isSafeInteger(inventoryDelta)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_EXHAUSTED",
      "The bank has no available improvement pieces for this level.",
    );
  }
  const nextInventory = (inventory ?? 0) - inventoryDelta;
  if (
    !rules.configuration.unlimitedImprovementInventory &&
    (!Number.isSafeInteger(nextInventory) || nextInventory < 0)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_EXHAUSTED",
      "The bank has no available improvement pieces for this level.",
    );
  }
  if (actor.balance < cost) {
    return reject(
      "ILLEGAL_ACTION",
      "INSUFFICIENT_FUNDS",
      "The active seat cannot afford this improvement.",
    );
  }
  if (!Number.isSafeInteger(state.bank.cash + cost)) {
    return reject(
      "INVALID_PAYLOAD",
      "BANK_CASH_OVERFLOW",
      "The bank ledger cannot represent this payment.",
    );
  }
  const event = freezeEvent({
    type: "ImprovementBought",
    eventVersion: 1,
    actorSeatId,
    payload: {
      deedId,
      seatId: actorSeatId,
      fromLevel: currentLevel,
      toLevel: nextLevel.level,
      amount: cost,
      inventoryKind: context.inventoryKind,
      inventoryDelta,
    },
  } satisfies EngineEvent);
  return { ok: true, state: freezeState(applyEvent(state, event)), events: Object.freeze([event]) };
}

/** RULE-005, RULE-008: return one level to bank with content-defined rounding. */
function resolveSellImprovement(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "ResolveMove" && state.phase !== "TurnStart") {
    return reject(
      "PHASE_MISMATCH",
      "IMPROVEMENT_REQUIRES_MANAGE_PHASE",
      "Improvements may only be sold after movement resolution.",
    );
  }
  if (state.activeSeatId !== actorSeatId) {
    return reject("ILLEGAL_ACTION", "OUT_OF_TURN", "Only the active seat may sell improvements.");
  }
  const context = improvementContext(state, rules, deedId);
  if ("ok" in context) return context;
  const actor = findSeat(state, actorSeatId);
  if (actor === undefined || context.deedState.ownerSeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_NOT_OWNED",
      "A seat may only sell its own improvements.",
    );
  }
  const currentLevel = context.deedState.improvementLevel;
  const previousLevel = context.deed.improvementLevels?.find(
    (level) => level.level === currentLevel,
  );
  if (previousLevel === undefined || currentLevel <= 0) {
    return reject(
      "ILLEGAL_ACTION",
      "NO_IMPROVEMENT_TO_SELL",
      "The deed has no improvement to sell.",
    );
  }
  const highestLevel = Math.max(...context.districtDeedStates.map((deed) => deed.improvementLevel));
  if (currentLevel !== highestLevel) {
    return reject(
      "ILLEGAL_ACTION",
      "EVEN_BUILDING_REQUIRED",
      "Improvements must be sold from a currently highest-level deed.",
    );
  }
  const nextLevels = context.districtDeedStates.map((deed) =>
    deed.deedId === deedId ? deed.improvementLevel - 1 : deed.improvementLevel,
  );
  if (Math.max(...nextLevels) - Math.min(...nextLevels) > 1) {
    return reject(
      "ILLEGAL_ACTION",
      "EVEN_BUILDING_REQUIRED",
      "Selling this improvement would violate even building.",
    );
  }
  const ratio = rules.content.economy.improvementResaleRatio;
  const cost = context.deed.improvementCost;
  if (cost === undefined) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_RESALE_RATIO",
      "Improvement resale rounding is invalid.",
    );
  }
  if (
    !Number.isSafeInteger(ratio.numerator) ||
    !Number.isSafeInteger(ratio.denominator) ||
    ratio.numerator < 0 ||
    ratio.denominator <= 0 ||
    !Number.isSafeInteger(cost) ||
    cost < 0
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_RESALE_RATIO",
      "Improvement resale rounding is invalid.",
    );
  }
  if (ratio.numerator > 0 && cost > Math.floor(Number.MAX_SAFE_INTEGER / ratio.numerator)) {
    return reject("INVALID_PAYLOAD", "RESALE_OVERFLOW", "The improvement resale amount overflows.");
  }
  const amount = Math.floor((cost * ratio.numerator) / ratio.denominator);
  const inventory = state.bank.improvementInventory[context.inventoryKind];
  const inventoryDelta = rules.configuration.unlimitedImprovementInventory
    ? 0
    : previousLevel.inventoryDelta;
  if (
    (!rules.configuration.unlimitedImprovementInventory && inventory === undefined) ||
    !Number.isSafeInteger(inventoryDelta)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_INVALID",
      "The returned improvement pieces cannot fit in bank inventory.",
    );
  }
  const nextInventory = (inventory ?? 0) + inventoryDelta;
  if (
    !rules.configuration.unlimitedImprovementInventory &&
    (!Number.isSafeInteger(nextInventory) || nextInventory < 0)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_INVALID",
      "The returned improvement pieces cannot fit in bank inventory.",
    );
  }
  if (
    !Number.isSafeInteger(actor.balance + amount) ||
    !Number.isSafeInteger(state.bank.cash - amount)
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "IMPROVEMENT_PAYMENT_OVERFLOW",
      "The improvement payment overflows.",
    );
  }
  const event = freezeEvent({
    type: "ImprovementSold",
    eventVersion: 1,
    actorSeatId,
    payload: {
      deedId,
      seatId: actorSeatId,
      fromLevel: currentLevel,
      toLevel: currentLevel - 1,
      amount,
      inventoryKind: context.inventoryKind,
      inventoryDelta,
    },
  } satisfies EngineEvent);
  return { ok: true, state: freezeState(applyEvent(state, event)), events: Object.freeze([event]) };
}

function scarceDemandContext(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): ScarceImprovementDemand | Rejection {
  const context = improvementContext(state, rules, deedId);
  if ("ok" in context) return context;
  const actor = findSeat(state, actorSeatId);
  if (actor === undefined || context.deedState.ownerSeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_NOT_OWNED",
      "A seat may only request an improvement for its own deed.",
    );
  }
  if (
    context.deedState.mortgaged ||
    context.districtDeedStates.some((deed) => deed.mortgaged) ||
    context.districtDeedStates.some((deed) => deed.ownerSeatId !== actorSeatId)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "DISTRICT_NOT_COMPLETE",
      "A district must be complete and unmortgaged before building.",
    );
  }
  const currentLevel = context.deedState.improvementLevel;
  const nextLevel = context.deed.improvementLevels?.find(
    (level) => level.level === currentLevel + 1,
  );
  const baseCost = context.deed.improvementCost;
  if (nextLevel === undefined) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_AT_MAX_LEVEL",
      "The deed is already fully improved.",
    );
  }
  if (currentLevel > Math.min(...context.districtDeedStates.map((deed) => deed.improvementLevel))) {
    return reject(
      "ILLEGAL_ACTION",
      "EVEN_BUILDING_REQUIRED",
      "A deed cannot be improved ahead of the lowest deed in its district.",
    );
  }
  if (baseCost === undefined || !Number.isSafeInteger(baseCost) || baseCost < 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_IMPROVEMENT_COST",
      "The deed has no valid improvement cost.",
    );
  }
  const inventory = state.bank.improvementInventory[context.inventoryKind];
  if (!Number.isSafeInteger(nextLevel.inventoryDelta) || nextLevel.inventoryDelta <= 0) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_SCARCE_INVENTORY_DELTA",
      "A scarce improvement demand must consume a positive inventory quantity.",
    );
  }
  if (inventory === undefined || inventory < nextLevel.inventoryDelta) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_EXHAUSTED",
      "The bank has no available improvement pieces for this demand.",
    );
  }
  if (actor.balance < baseCost) {
    return reject(
      "ILLEGAL_ACTION",
      "INSUFFICIENT_FUNDS",
      "The requesting seat cannot afford the improvement base cost.",
    );
  }
  return {
    seatId: actorSeatId,
    deedId,
    fromLevel: currentLevel,
    toLevel: nextLevel.level,
    inventoryKind: context.inventoryKind,
    inventoryDelta: nextLevel.inventoryDelta,
    baseCost,
  };
}

function validateStoredDemand(
  state: GameState,
  demand: ScarceImprovementDemand,
  rules: RuleSet,
): Rejection | undefined {
  const current = scarceDemandContext(state, demand.seatId, demand.deedId, rules);
  if ("ok" in current) return current;
  if (
    current.fromLevel !== demand.fromLevel ||
    current.toLevel !== demand.toLevel ||
    current.inventoryKind !== demand.inventoryKind ||
    current.inventoryDelta !== demand.inventoryDelta ||
    current.baseCost !== demand.baseCost
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "SCARCE_DEMAND_STALE",
      "A declared improvement demand is no longer legal.",
    );
  }
  return undefined;
}

function validateImprovementAuction(
  state: GameState,
  actorSeatId: SeatId,
  rules: RuleSet,
): Rejection | PendingImprovementAuction {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "ImprovementAuction" || state.pendingImprovementAuction === undefined) {
    return reject(
      "PHASE_MISMATCH",
      "IMPROVEMENT_AUCTION_NOT_PENDING",
      "An auction command requires an active improvement auction.",
    );
  }
  const auction = state.pendingImprovementAuction;
  if (auction.prioritySeatId !== actorSeatId) {
    return reject(
      "ILLEGAL_ACTION",
      "AUCTION_PRIORITY_REQUIRED",
      "Only the current auction priority seat may act.",
    );
  }
  if (auction.passedSeatIds.includes(actorSeatId)) {
    return reject(
      "ILLEGAL_ACTION",
      "AUCTION_ALREADY_PASSED",
      "A seat that passed cannot act again in this auction.",
    );
  }
  if (!auction.demands.some((demand) => demand.seatId === actorSeatId)) {
    return reject(
      "ILLEGAL_ACTION",
      "SCARCE_DEMANDER_REQUIRED",
      "Only seats with a declared improvement demand may bid.",
    );
  }
  const inventory = state.bank.improvementInventory[auction.demands[0]?.inventoryKind ?? ""];
  if (inventory === undefined || inventory <= 0) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_EXHAUSTED",
      "The improvement inventory is exhausted.",
    );
  }
  for (const demand of auction.demands) {
    const stale = validateStoredDemand(state, demand, rules);
    if (stale !== undefined) return stale;
  }
  if (
    !Number.isSafeInteger(auction.highBid) ||
    auction.highBid < 0 ||
    (auction.highBidderSeatId !== undefined &&
      !auction.demands.some((demand) => demand.seatId === auction.highBidderSeatId))
  ) {
    return reject(
      "INVALID_PAYLOAD",
      "INVALID_IMPROVEMENT_AUCTION_STATE",
      "The improvement auction high bid is not valid.",
    );
  }
  return auction;
}

/** RULE-006, RULE-008, CONTENT-005: resolve one no-timer scarce-unit bid/pass. */
function resolveImprovementAuction(
  state: GameState,
  actorSeatId: SeatId,
  command: "bid" | "pass",
  amount: number | undefined,
  rules: RuleSet,
): Resolution {
  const validated = validateImprovementAuction(state, actorSeatId, rules);
  if ("ok" in validated) return validated;
  const auction = validated;
  const actor = findSeat(state, actorSeatId);
  const demand = auction.demands.find((candidate) => candidate.seatId === actorSeatId);
  if (actor === undefined || demand === undefined) {
    return reject("INVALID_PAYLOAD", "UNKNOWN_SEAT", "The auction seat is not in the game.");
  }
  if (command === "bid") {
    if (amount === undefined || !Number.isSafeInteger(amount) || amount < 0) {
      return reject(
        "INVALID_PAYLOAD",
        "INVALID_BID_AMOUNT",
        "Auction bids must be non-negative integer minor units.",
      );
    }
    if (amount <= auction.highBid) {
      return reject(
        "ILLEGAL_ACTION",
        "BID_MUST_INCREASE",
        "A bid must be greater than the current high bid.",
      );
    }
    if (
      !Number.isSafeInteger(demand.baseCost + amount) ||
      demand.baseCost + amount > actor.balance
    ) {
      return reject(
        "ILLEGAL_ACTION",
        "BID_EXCEEDS_BALANCE",
        "The bid plus the content-defined improvement cost exceeds the balance.",
      );
    }
  }
  const nextPassedSeatIds =
    command === "pass" ? [...auction.passedSeatIds, actorSeatId] : auction.passedSeatIds;
  const nextAuction: PendingImprovementAuction =
    command === "bid"
      ? {
          ...auction,
          highBid: amount as number,
          highBidderSeatId: actorSeatId,
          prioritySeatId:
            nextDemandSeatId(state, actorSeatId, auction.demands, auction.passedSeatIds) ??
            actorSeatId,
        }
      : {
          ...auction,
          passedSeatIds: nextPassedSeatIds,
          prioritySeatId:
            nextDemandSeatId(state, actorSeatId, auction.demands, nextPassedSeatIds) ?? actorSeatId,
        };
  const outcome = improvementAuctionOutcome(state, nextAuction);
  const actionEvent = freezeEvent({
    type: command === "bid" ? "AuctionBidPlaced" : "AuctionPassed",
    eventVersion: 1,
    actorSeatId,
    payload:
      command === "bid"
        ? {
            auctionKind: "improvement",
            deedId: demand.deedId,
            bidderSeatId: actorSeatId,
            amount,
            previousBid: auction.highBid,
            nextPrioritySeatId: outcome.kind === "open" ? nextAuction.prioritySeatId : undefined,
          }
        : {
            auctionKind: "improvement",
            deedId: demand.deedId,
            passerSeatId: actorSeatId,
            nextPrioritySeatId: outcome.kind === "open" ? nextAuction.prioritySeatId : undefined,
          },
  } satisfies EngineEvent);
  const events: EngineEvent[] = [actionEvent];
  if (outcome.kind === "noSale") {
    events.push(
      freezeEvent({
        type: "AuctionClosed",
        eventVersion: 1,
        actorSeatId,
        payload: { auctionKind: "improvement", sold: false, winningBid: 0 },
      }),
    );
  } else if (outcome.kind === "sale") {
    const winnerDemand = auction.demands.find(
      (candidate) => candidate.seatId === outcome.winnerSeatId,
    );
    if (winnerDemand === undefined) {
      return reject(
        "INVALID_PAYLOAD",
        "INVALID_IMPROVEMENT_AUCTION_STATE",
        "The auction winner has no demand.",
      );
    }
    const winningBid = nextAuction.highBid;
    const amountPaid = winningBid + winnerDemand.baseCost;
    const inventory = state.bank.improvementInventory[winnerDemand.inventoryKind];
    const nextInventory =
      inventory === undefined ? undefined : inventory - winnerDemand.inventoryDelta;
    if (
      !Number.isSafeInteger(amountPaid) ||
      !Number.isSafeInteger(nextInventory) ||
      nextInventory === undefined ||
      nextInventory < 0
    ) {
      return reject(
        "INVALID_PAYLOAD",
        "IMPROVEMENT_AUCTION_OVERFLOW",
        "The scarce improvement settlement cannot be represented.",
      );
    }
    const remainingDemands = auction.demands.filter((candidate) => candidate !== winnerDemand);
    const remainingInventoryDemand = remainingDemands.reduce(
      (total, candidate) => total + candidate.inventoryDelta,
      0,
    );
    const remainingDemandSeatCount = new Set(remainingDemands.map((candidate) => candidate.seatId))
      .size;
    const continues =
      nextInventory > 0 &&
      remainingDemandSeatCount >= 2 &&
      remainingInventoryDemand > nextInventory;
    events.push(
      freezeEvent({
        type: "ScarceImprovementAwarded",
        eventVersion: 1,
        actorSeatId,
        payload: {
          auctionKind: "improvement",
          seatId: winnerDemand.seatId,
          deedId: winnerDemand.deedId,
          fromLevel: winnerDemand.fromLevel,
          toLevel: winnerDemand.toLevel,
          winningBid,
          baseCost: winnerDemand.baseCost,
          amount: amountPaid,
          inventoryKind: winnerDemand.inventoryKind,
          inventoryDelta: winnerDemand.inventoryDelta,
          remainingDemands: continues ? remainingDemands : [],
        },
      }),
    );
    if (continues) {
      const prioritySeatId =
        nextDemandSeatId(state, outcome.winnerSeatId, remainingDemands, []) ??
        remainingDemands[0]?.seatId;
      if (prioritySeatId === undefined) {
        return reject(
          "INVALID_PAYLOAD",
          "NO_AUCTION_PRIORITY",
          "No demand seat is available for the next auction.",
        );
      }
      events.push(
        freezeEvent({
          type: "AuctionOpened",
          eventVersion: 1,
          actorSeatId,
          payload: {
            auctionKind: "improvement",
            highBid: 0,
            prioritySeatId,
            demands: remainingDemands,
          },
        }),
      );
    }
  }
  return {
    ok: true,
    state: freezeState(events.reduce(applyEvent, state)),
    events: Object.freeze(events),
  };
}

function resolveScarceImprovementRequest(
  state: GameState,
  actorSeatId: SeatId,
  deedId: string,
  rules: RuleSet,
): Resolution {
  const actorRejection = requireActiveActor(state, actorSeatId);
  if (actorRejection !== undefined) return actorRejection;
  if (state.phase !== "ResolveMove" && state.phase !== "TurnStart") {
    return reject(
      "PHASE_MISMATCH",
      "SCARCE_IMPROVEMENT_REQUIRES_MANAGE_PHASE",
      "Scarce improvement demands may only be declared during management.",
    );
  }
  if (rules.configuration.unlimitedImprovementInventory) {
    return reject(
      "ILLEGAL_ACTION",
      "SCARCE_AUCTION_DISABLED",
      "Unlimited improvement inventory bypasses scarcity auctions.",
    );
  }
  const demand = scarceDemandContext(state, actorSeatId, deedId, rules);
  if ("ok" in demand) return demand;
  const existing = state.scarceImprovementDemands ?? [];
  if (
    existing.some((candidate) => candidate.seatId === actorSeatId && candidate.deedId === deedId)
  ) {
    return reject(
      "ILLEGAL_ACTION",
      "SCARCE_DEMAND_DUPLICATE",
      "That improvement demand is already declared.",
    );
  }
  const demands = [...existing, demand];
  const inventory = state.bank.improvementInventory[demand.inventoryKind];
  if (inventory === undefined || inventory <= 0) {
    return reject(
      "ILLEGAL_ACTION",
      "IMPROVEMENT_INVENTORY_EXHAUSTED",
      "The bank has no available improvement pieces.",
    );
  }
  const requestEvent = freezeEvent({
    type: "ScarceImprovementRequested",
    eventVersion: 1,
    actorSeatId,
    payload: { ...demand },
  } satisfies EngineEvent);
  const events: EngineEvent[] = [requestEvent];
  const demandSeatCount = new Set(demands.map((candidate) => candidate.seatId)).size;
  if (
    demandSeatCount >= 2 &&
    demands.reduce((total, candidate) => total + candidate.inventoryDelta, 0) > inventory
  ) {
    const prioritySeatId = demands.find((candidate) =>
      state.seats.some((seat) => seat.seatId === candidate.seatId && seat.status === "active"),
    )?.seatId;
    if (prioritySeatId === undefined) {
      return reject(
        "INVALID_PAYLOAD",
        "NO_AUCTION_PRIORITY",
        "No active demand seat is available.",
      );
    }
    events.push(
      freezeEvent({
        type: "AuctionOpened",
        eventVersion: 1,
        actorSeatId,
        payload: {
          auctionKind: "improvement",
          highBid: 0,
          prioritySeatId,
          demands,
        },
      }),
    );
  }
  return {
    ok: true,
    state: freezeState(events.reduce(applyEvent, state)),
    events: Object.freeze(events),
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
    queuedEffects(destination),
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
    case "PassAuction":
      return state.phase === "ImprovementAuction"
        ? resolveImprovementAuction(state, command.actorSeatId, "pass", undefined, rules)
        : resolveAuction(state, command.actorSeatId, "pass", undefined, rules);
    case "RequestScarceImprovement":
      return resolveScarceImprovementRequest(
        state,
        command.actorSeatId,
        command.command.deedId,
        rules,
      );
    case "PlaceAuctionBid":
      return state.phase === "ImprovementAuction"
        ? resolveImprovementAuction(
            state,
            command.actorSeatId,
            "bid",
            command.command.amount,
            rules,
          )
        : resolveAuction(state, command.actorSeatId, "bid", command.command.amount, rules);
    case "BuyImprovement":
      return resolveBuyImprovement(state, command.actorSeatId, command.command.deedId, rules);
    case "SellImprovement":
      return resolveSellImprovement(state, command.actorSeatId, command.command.deedId, rules);
    case "MortgageDeed":
      return resolveMortgage(state, command.actorSeatId, command.command.deedId, rules);
    case "RedeemMortgage":
      return resolveRedeemMortgage(state, command.actorSeatId, command.command.deedId, rules);
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
