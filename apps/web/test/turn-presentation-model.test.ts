import { describe, expect, it, vi } from "vitest";
import {
  STANDARD_CONFIGURATION,
  type DomainEvent,
  type GameSnapshotProjection,
} from "@blockparty/contracts";
import { TurnPresentationCoordinator } from "../src/components/game/turn-presentation/turn-presentation-coordinator";
import {
  confirmedEvents,
  movementFromEvent,
  presentationStages,
} from "../src/components/game/turn-presentation/turn-presentation-model";

const gameId = "00000000-0000-4000-8000-000000000099";

function event(
  type: DomainEvent["type"],
  sequence: number,
  payload: Record<string, unknown>,
  actorSeatId = "seat-a",
): DomainEvent {
  return {
    gameId,
    sequence,
    aggregateVersion: sequence,
    type,
    eventVersion: 1,
    actorSeatId,
    occurredAt: "2026-09-09T15:00:00.000Z",
    payload,
  };
}

function snapshot(
  sequence: number,
  publicEvents: readonly DomainEvent[] = [],
): GameSnapshotProjection {
  return {
    gameId,
    status: "ACTIVE",
    phase: "AwaitRoll",
    aggregateVersion: sequence,
    sequence,
    versions: {
      contentVersion: "1.0.0",
      rulesSchemaVersion: "1.0.0",
      variantSchemaVersion: "1.0.0",
      stateSchemaVersion: "1.0.0",
      engineVersion: "1.0.0",
    },
    configuration: STANDARD_CONFIGURATION,
    activeSeatId: "seat-a",
    seats: [],
    board: [],
    publicEvents: [...publicEvents],
    recovery: {
      safeBoundary: true,
      replacementSeatIds: [],
      viewerCanRequestReclaim: false,
      viewerCanClaimHost: false,
    },
    legalActions: [],
    actionAvailability: [],
    paused: false,
    expiresAt: "2026-10-09T15:00:00.000Z",
  };
}

describe("turn presentation model", () => {
  it("walks a confirmed forward movement one route stop at a time", () => {
    const move = event("TokenMoved", 2, {
      seatId: "seat-a",
      fromPosition: 38,
      toPosition: 2,
      spaces: 4,
      movementType: "normalDice",
    });
    expect(movementFromEvent(move)).toMatchObject({
      fromPosition: 38,
      toPosition: 2,
      path: [38, 39, 0, 1, 2],
      interpolated: true,
    });
  });

  it("keeps every confirmed event in sequence and maps malformed movement to a final placement", () => {
    const events = [
      event("DiceRolled", 2, { dice: [3, 5] }),
      event("TokenMoved", 3, {
        seatId: "seat-a",
        fromPosition: 1,
        toPosition: 9,
        movementType: "forced",
      }),
      event("RentPaid", 4, { amount: 1800 }),
    ];
    expect(presentationStages(events).map((stage) => stage.eventSequence)).toEqual([2, 3, 4]);
    expect(presentationStages(events)[1]?.movement).toMatchObject({
      path: [9],
      interpolated: false,
    });
  });

  it("rejects an incomplete journal range so a client can converge without guessing", () => {
    const previous = snapshot(4);
    const current = snapshot(7, [
      event("TokenMoved", 6, {
        seatId: "seat-a",
        fromPosition: 1,
        toPosition: 2,
        spaces: 1,
        movementType: "normalDice",
      }),
    ]);
    expect(confirmedEvents(previous, current)).toBeUndefined();
  });

  it("queues multiple confirmed movements instead of keeping only the last one", () => {
    vi.useFakeTimers();
    const coordinator = new TurnPresentationCoordinator();
    coordinator.acceptConfirmedUpdate({ snapshot: snapshot(1) });
    const firstMove = event("TokenMoved", 2, {
      seatId: "seat-a",
      fromPosition: 1,
      toPosition: 3,
      spaces: 2,
      movementType: "normalDice",
    });
    const secondMove = event("TokenMoved", 3, {
      seatId: "seat-a",
      fromPosition: 3,
      toPosition: 4,
      spaces: 1,
      movementType: "forced",
    });
    coordinator.acceptConfirmedUpdate({
      snapshot: snapshot(3, [firstMove, secondMove]),
      events: [firstMove, secondMove],
    });
    expect(coordinator.currentState.stage?.movement?.path).toEqual([1, 2, 3]);
    coordinator.skipCurrent();
    expect(coordinator.currentState.stage?.movement?.path).toEqual([3, 4]);
    coordinator.skipCurrent();
    expect(coordinator.currentState.presentedSequence).toBe(3);
    expect(coordinator.currentState.catchingUp).toBe(false);
    coordinator.close();
    vi.useRealTimers();
  });
});
