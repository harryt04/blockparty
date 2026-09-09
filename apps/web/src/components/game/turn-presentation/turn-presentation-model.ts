import type { DomainEvent, GameSnapshotProjection } from "@blockparty/contracts";

/** A confirmed movement as a presentation fact, never a predicted game move. */
export interface PresentedMovement {
  readonly eventSequence: number;
  readonly seatId: string;
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly movementType: string;
  /** Includes the origin and every confirmed route stop when the payload is sound. */
  readonly path: readonly number[];
  readonly interpolated: boolean;
}

export interface PresentationStage {
  readonly eventSequence: number;
  readonly eventType: DomainEvent["type"];
  readonly actorSeatId?: string;
  readonly dice?: readonly [number, number];
  readonly reasonCode?: string;
  readonly movement?: PresentedMovement;
  readonly durationMs: number;
}

export interface ConfirmedPresentationUpdate {
  readonly snapshot: GameSnapshotProjection;
  /** Events from the previous authorized snapshot, in ascending sequence order. */
  readonly events?: readonly DomainEvent[];
}

const ROUTE_SIZE = 40;
const MAX_STEPS = ROUTE_SIZE * 2;

const MAJOR_OUTCOME_EVENTS = new Set<DomainEvent["type"]>([
  "DeedAcquired",
  "AcquisitionDeclined",
  "AuctionOpened",
  "AuctionClosed",
  "RentPaid",
  "FeePaid",
  "BankPaymentCollected",
  "PlayerPaymentCollected",
  "CardDrawn",
  "DetentionEntered",
  "DetentionReleased",
  "ObligationCreated",
  "ObligationSettled",
  "BankruptcyDeclared",
  "SeatEliminated",
]);

type IntegerPayloadKey = "fromPosition" | "toPosition" | "spaces";

function integerPayload(event: DomainEvent, key: IntegerPayloadKey): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function stringPayload(event: DomainEvent, key: "seatId" | "movementType"): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" ? value : undefined;
}

function dicePayload(event: DomainEvent): readonly [number, number] | undefined {
  const value = event.payload.dice;
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((die) => typeof die === "number" && Number.isInteger(die) && die >= 1 && die <= 6)
  ) {
    return undefined;
  }
  return [value[0] as number, value[1] as number];
}

/**
 * Derives a route path only when the public movement payload is unambiguous.
 * The active classic bundle has a 40-stop ordered route. Invalid or legacy
 * evidence deliberately falls back to a direct final placement.
 */
export function movementFromEvent(
  event: DomainEvent,
  routeSize = ROUTE_SIZE,
): PresentedMovement | undefined {
  if (event.type !== "TokenMoved") return undefined;
  const seatId = stringPayload(event, "seatId") ?? event.actorSeatId;
  const fromPosition = integerPayload(event, "fromPosition");
  const toPosition = integerPayload(event, "toPosition");
  const spaces = integerPayload(event, "spaces");
  const movementType = stringPayload(event, "movementType");
  if (
    seatId === undefined ||
    fromPosition === undefined ||
    toPosition === undefined ||
    movementType === undefined ||
    routeSize < 1
  ) {
    return undefined;
  }

  const normalize = (position: number) => ((position % routeSize) + routeSize) % routeSize;
  const normalizedFrom = normalize(fromPosition);
  const normalizedTo = normalize(toPosition);
  if (spaces === undefined || Math.abs(spaces) > MAX_STEPS) {
    return {
      eventSequence: event.sequence,
      seatId,
      fromPosition: normalizedFrom,
      toPosition: normalizedTo,
      movementType,
      path: [normalizedTo],
      interpolated: false,
    };
  }
  const path = [normalizedFrom];
  const direction = spaces < 0 ? -1 : 1;
  for (let step = 1; step <= Math.abs(spaces); step += 1) {
    path.push(normalize(normalizedFrom + direction * step));
  }
  const endpoint = path.at(-1);
  if (endpoint !== normalizedTo) {
    return {
      eventSequence: event.sequence,
      seatId,
      fromPosition: normalizedFrom,
      toPosition: normalizedTo,
      movementType,
      path: [normalizedTo],
      interpolated: false,
    };
  }
  return {
    eventSequence: event.sequence,
    seatId,
    fromPosition: normalizedFrom,
    toPosition: normalizedTo,
    movementType,
    path,
    interpolated: true,
  };
}

function stageDuration(event: DomainEvent, movement: PresentedMovement | undefined): number {
  if (event.type === "TurnStarted") return 400;
  if (event.type === "DiceRolled") return 700;
  if (event.type === "BotDecisionExplained") return 600;
  if (movement?.interpolated === true) {
    return Math.min(1_200, Math.max(90, (movement.path.length - 1) * 105));
  }
  if (MAJOR_OUTCOME_EVENTS.has(event.type)) return 800;
  return 0;
}

/** Maps each confirmed domain event to one ordered presentation boundary. */
export function presentationStages(
  events: readonly DomainEvent[],
  routeSize = ROUTE_SIZE,
): readonly PresentationStage[] {
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => {
      const movement = movementFromEvent(event, routeSize);
      const dice = event.type === "DiceRolled" ? dicePayload(event) : undefined;
      const reasonCode =
        event.type === "BotDecisionExplained" && typeof event.payload.reasonCode === "string"
          ? event.payload.reasonCode
          : undefined;
      return {
        eventSequence: event.sequence,
        eventType: event.type,
        ...(event.actorSeatId === undefined ? {} : { actorSeatId: event.actorSeatId }),
        ...(dice === undefined ? {} : { dice }),
        ...(reasonCode === undefined ? {} : { reasonCode }),
        ...(movement === undefined ? {} : { movement }),
        durationMs: stageDuration(event, movement),
      };
    });
}

/**
 * Returns only event evidence newer than the prior authorized snapshot. A gap
 * means the bounded public journal cannot prove a complete recap, so callers
 * must converge directly to the latest snapshot instead of guessing.
 */
export function confirmedEvents(
  previous: GameSnapshotProjection | undefined,
  current: GameSnapshotProjection,
): readonly DomainEvent[] | undefined {
  if (previous === undefined) return undefined;
  if (
    current.sequence <= previous.sequence ||
    current.aggregateVersion < previous.aggregateVersion
  ) {
    return [];
  }
  const events = [...(current.publicEvents ?? [])]
    .filter((event) => event.sequence > previous.sequence)
    .sort((left, right) => left.sequence - right.sequence);
  if (events.length === 0 || events[0]?.sequence !== previous.sequence + 1) return undefined;
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.sequence !== events[index - 1]!.sequence + 1) return undefined;
  }
  return events;
}
