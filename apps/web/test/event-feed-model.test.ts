import { describe, expect, it } from "vitest";
import type { DomainEvent } from "@blockparty/contracts";
import { groupEvents } from "../src/components/game/event-feed-model";

const GAME_ID = "00000000-0000-4000-8000-000000000064";

function event(sequence: number, aggregateVersion: number, type: DomainEvent["type"]): DomainEvent {
  return {
    gameId: GAME_ID,
    sequence,
    aggregateVersion,
    type,
    eventVersion: 1,
    occurredAt: "2026-09-08T12:00:00.000Z",
    payload: {},
  };
}

describe("event feed model", () => {
  it("orders events and groups contiguous events from one committed update", () => {
    const groups = groupEvents([
      event(4, 2, "RentPaid"),
      event(2, 1, "DiceRolled"),
      event(3, 1, "TokenMoved"),
    ]);

    expect(
      groups.map(({ aggregateVersion, firstSequence, lastSequence }) => ({
        aggregateVersion,
        firstSequence,
        lastSequence,
      })),
    ).toEqual([
      { aggregateVersion: 1, firstSequence: 2, lastSequence: 3 },
      { aggregateVersion: 2, firstSequence: 4, lastSequence: 4 },
    ]);
    expect(groups[0]?.events.map((item) => item.sequence)).toEqual([2, 3]);
  });

  it("does not merge a sequence gap even when the aggregate version matches", () => {
    const groups = groupEvents([event(5, 3, "RentPaid"), event(3, 3, "TokenMoved")]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.events.map((item) => item.sequence))).toEqual([[3], [5]]);
  });

  it("returns a new empty history without inventing a group", () => {
    expect(groupEvents([])).toEqual([]);
  });
});
