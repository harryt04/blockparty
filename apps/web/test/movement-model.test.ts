import { describe, expect, it } from "vitest";
import type { DomainEvent } from "@blockparty/contracts";
import { confirmedMovement } from "../src/components/game/movement-model";

const GAME_ID = "00000000-0000-4000-8000-000000000066";

function event(
  sequence: number,
  type: DomainEvent["type"],
  payload: Record<string, unknown>,
): DomainEvent {
  return {
    gameId: GAME_ID,
    sequence,
    aggregateVersion: sequence,
    type,
    eventVersion: 1,
    actorSeatId: "seat-a",
    occurredAt: "2026-09-08T12:00:00.000Z",
    payload,
  };
}

describe("confirmed movement", () => {
  it("returns only a movement event confirmed by a newer snapshot", () => {
    expect(
      confirmedMovement(
        { sequence: 3 },
        {
          sequence: 5,
          publicEvents: [
            event(2, "TokenMoved", {
              seatId: "seat-a",
              fromPosition: 1,
              toPosition: 2,
              movementType: "normalDice",
            }),
            event(4, "TokenMoved", {
              seatId: "seat-a",
              fromPosition: 7,
              toPosition: 11,
              movementType: "normalDice",
            }),
          ],
        },
      ),
    ).toEqual({
      eventSequence: 4,
      seatId: "seat-a",
      fromPosition: 7,
      toPosition: 11,
      movementType: "normalDice",
    });
  });

  it("does not predict movement for an initial, stale, unrelated, or malformed snapshot", () => {
    const move = event(4, "TokenMoved", {
      seatId: "seat-a",
      fromPosition: 7,
      toPosition: 11,
      movementType: "normalDice",
    });
    expect(confirmedMovement(undefined, { sequence: 4, publicEvents: [move] })).toBeUndefined();
    expect(
      confirmedMovement({ sequence: 4 }, { sequence: 4, publicEvents: [move] }),
    ).toBeUndefined();
    expect(
      confirmedMovement(
        { sequence: 3 },
        { sequence: 4, publicEvents: [event(4, "RentPaid", { amount: 20 })] },
      ),
    ).toBeUndefined();
    expect(
      confirmedMovement(
        { sequence: 3 },
        { sequence: 4, publicEvents: [event(4, "TokenMoved", { seatId: "seat-a" })] },
      ),
    ).toBeUndefined();
  });
});
