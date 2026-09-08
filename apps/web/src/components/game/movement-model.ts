import type { DomainEvent } from "@blockparty/contracts";

export interface AuthoritativeMovement {
  readonly eventSequence: number;
  readonly seatId: string;
  readonly fromPosition: number;
  readonly toPosition: number;
  readonly movementType: string;
}

interface SnapshotMovementEvidence {
  readonly sequence: number;
  readonly publicEvents?: readonly DomainEvent[];
}

function integerPayload(event: DomainEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function stringPayload(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Finds movement confirmed by a newer authorized snapshot. The client never
 * predicts intermediate stops: only a TokenMoved event already present in the
 * snapshot can start the destination transition. See UX-044–045 and DS-050.
 */
export function confirmedMovement(
  previous: SnapshotMovementEvidence | undefined,
  current: SnapshotMovementEvidence,
): AuthoritativeMovement | undefined {
  if (previous === undefined || current.sequence <= previous.sequence) return undefined;

  const event = [...(current.publicEvents ?? [])]
    .filter((candidate) => candidate.sequence > previous.sequence)
    .filter((candidate) => candidate.type === "TokenMoved")
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  if (event === undefined) return undefined;

  const seatId = stringPayload(event, "seatId") ?? event.actorSeatId;
  const fromPosition = integerPayload(event, "fromPosition");
  const toPosition = integerPayload(event, "toPosition");
  const movementType = stringPayload(event, "movementType");
  if (
    seatId === undefined ||
    fromPosition === undefined ||
    toPosition === undefined ||
    movementType === undefined
  ) {
    return undefined;
  }

  return {
    eventSequence: event.sequence,
    seatId,
    fromPosition,
    toPosition,
    movementType,
  };
}
