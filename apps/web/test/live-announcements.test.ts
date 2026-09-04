import { describe, expect, it } from "vitest";
import {
  STANDARD_CONFIGURATION,
  type DomainEvent,
  type GameSnapshotProjection,
} from "@blockparty/contracts";
import {
  announcementForConnection,
  announcementForEvent,
  announcementForSnapshot,
} from "../src/components/game/live-announcements-model";

const seats = [
  {
    seatId: "seat-a",
    name: "Maya",
    kind: "human" as const,
    status: "active" as const,
    token: { colorIndex: 1, shape: "barricade" as const, pattern: "solid" as const },
    isHost: true,
    connected: true,
    isSelf: true,
  },
  {
    seatId: "seat-b",
    name: "Noah",
    kind: "human" as const,
    status: "active" as const,
    token: { colorIndex: 2, shape: "cooler" as const, pattern: "stripe" as const },
    isHost: false,
    connected: true,
    isSelf: false,
  },
];

function event(
  type: DomainEvent["type"],
  sequence: number,
  payload: Record<string, unknown> = {},
  actorSeatId?: string,
): DomainEvent {
  return {
    gameId: "00000000-0000-4000-8000-000000000099",
    sequence,
    aggregateVersion: sequence,
    type,
    eventVersion: 1,
    ...(actorSeatId === undefined ? {} : { actorSeatId }),
    occurredAt: "2026-09-03T15:00:00.000Z",
    payload,
  };
}

function snapshot(overrides: Partial<GameSnapshotProjection> = {}): GameSnapshotProjection {
  return {
    gameId: "00000000-0000-4000-8000-000000000099",
    status: "ACTIVE",
    phase: "AwaitRoll",
    aggregateVersion: 1,
    sequence: 1,
    versions: {
      contentVersion: "1.0.0",
      rulesSchemaVersion: "1.0.0",
      variantSchemaVersion: "1.0.0",
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    viewerSeatId: "seat-a",
    activeSeatId: "seat-a",
    seats,
    board: [],
    legalActions: [],
    actionAvailability: [],
    recovery: {
      safeBoundary: true,
      replacementSeatIds: [],
      viewerCanRequestReclaim: false,
      viewerCanClaimHost: false,
    },
    paused: false,
    expiresAt: "2026-10-03T15:00:00.000Z",
    configuration: STANDARD_CONFIGURATION,
    ...overrides,
  };
}

describe("live announcement model", () => {
  it("announces critical events with actor and result context", () => {
    expect(announcementForEvent(event("TurnStarted", 2, {}, "seat-a"), seats, "seat-a")).toEqual({
      key: "event:2",
      message: "Your turn has started.",
      priority: "polite",
    });
    expect(
      announcementForEvent(event("DiceRolled", 3, { dice: [2, 5] }, "seat-b"), seats, "seat-a"),
    ).toMatchObject({ message: "Noah rolled 2 and 5, total 7.", priority: "polite" });
    expect(
      announcementForEvent(
        event("ObligationCreated", 4, { debtorSeatId: "seat-a", amount: 4200 }, "seat-a"),
        seats,
        "seat-a",
      ),
    ).toMatchObject({
      message: "Maya owes 42 Tabs and must resolve it.",
      priority: "assertive",
    });
    expect(
      announcementForEvent(event("GameCompleted", 5, { winnerSeatId: "seat-b" }), seats, "seat-a"),
    ).toMatchObject({ message: "Noah won the game.", priority: "assertive" });
  });

  it("keeps routine feed events silent and announces a newly required decision once", () => {
    expect(
      announcementForEvent(event("TokenMoved", 2, { from: 1, to: 4 }, "seat-a"), seats),
    ).toBeUndefined();
    expect(
      announcementForEvent(event("PlayerPaymentCollected", 3, { amount: 100 }, "seat-a"), seats),
    ).toBeUndefined();
    const previous = snapshot();
    const current = snapshot({
      sequence: 2,
      aggregateVersion: 2,
      phase: "AwaitChoice",
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-1", optionId: "pay-release-fee" },
        },
      ],
      publicEvents: [event("PendingChoiceCreated", 2, { choiceId: "choice-1" }, "seat-a")],
    });
    expect(announcementForSnapshot(undefined, current)).toBeUndefined();
    expect(announcementForSnapshot(previous, current)).toMatchObject({
      message: "A decision is required before play can continue.",
      priority: "assertive",
    });
    expect(announcementForSnapshot(current, current)).toBeUndefined();
  });

  it("announces reconnect transitions but ignores ordinary live/resync churn", () => {
    expect(announcementForConnection(undefined, "live")).toBeUndefined();
    expect(announcementForConnection("live", "resyncing")).toBeUndefined();
    expect(announcementForConnection("live", "reconnecting")).toMatchObject({
      message: "Connection lost. Reconnecting to the live game.",
      priority: "assertive",
    });
    expect(announcementForConnection("reconnecting", "live")).toMatchObject({
      message: "Connection restored. Live game state is up to date.",
      priority: "polite",
    });
  });
});
