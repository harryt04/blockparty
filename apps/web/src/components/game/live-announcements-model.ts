import type { DomainEvent, GameSnapshotProjection, SeatProjection } from "@blockparty/contracts";
import { formatMoney } from "@/components/display-names";

export type AnnouncementPriority = "polite" | "assertive";

export interface LiveAnnouncement {
  readonly key: string;
  readonly message: string;
  readonly priority: AnnouncementPriority;
}

export type ConnectionAnnouncementState =
  "connecting" | "live" | "reconnecting" | "resyncing" | "closed";

const DECISION_TYPES = new Set([
  "ChoosePendingOption",
  "AcquireDeed",
  "DeclineAcquisition",
  "PlaceAuctionBid",
  "PassAuction",
  "PayObligation",
  "DeclareBankruptcy",
  "AcceptTrade",
  "RejectTrade",
  "CancelTrade",
]);

function payloadString(event: DomainEvent, key: string): string | undefined {
  const value = event.payload[key];
  return typeof value === "string" ? value : undefined;
}

function payloadNumber(event: DomainEvent, key: string): number | undefined {
  const value = event.payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function seatName(seats: readonly SeatProjection[], seatId: string | undefined): string {
  return seatId === undefined
    ? "A player"
    : (seats.find((seat) => seat.seatId === seatId)?.name ?? "A player");
}

function eventSeatId(event: DomainEvent, payloadKey: string): string | undefined {
  return event.actorSeatId ?? payloadString(event, payloadKey);
}

function announcement(
  event: DomainEvent,
  message: string,
  priority: AnnouncementPriority,
): LiveAnnouncement {
  return { key: `event:${event.sequence}`, message, priority };
}

/**
 * Converts only turn-critical authoritative events into announcements. The
 * event feed remains the complete readable history; routine movement,
 * payments, cards, and presence do not enter this allowlist. See UX-040 and
 * DS-070.
 */
export function announcementForEvent(
  event: DomainEvent,
  seats: readonly SeatProjection[],
  viewerSeatId?: string,
): LiveAnnouncement | undefined {
  const actorId = eventSeatId(event, "seatId");
  const actor = seatName(seats, actorId);

  switch (event.type) {
    case "TurnStarted":
      return announcement(
        event,
        actorId === viewerSeatId ? "Your turn has started." : `${actor}'s turn has started.`,
        "polite",
      );
    case "DiceRolled": {
      const dice = event.payload.dice;
      const first = Array.isArray(dice) ? dice[0] : undefined;
      const second = Array.isArray(dice) ? dice[1] : undefined;
      if (
        !Array.isArray(dice) ||
        dice.length !== 2 ||
        typeof first !== "number" ||
        typeof second !== "number"
      ) {
        return announcement(event, `${actor} rolled the dice.`, "polite");
      }
      return announcement(
        event,
        `${actor} rolled ${first} and ${second}, total ${first + second}.`,
        "polite",
      );
    }
    case "PendingChoiceCreated":
      return announcement(event, "A decision is required before play can continue.", "assertive");
    case "AuctionOpened":
      return announcement(event, "An auction is open and requires a decision.", "polite");
    case "AuctionBidPlaced": {
      const amount = payloadNumber(event, "amount");
      return announcement(
        event,
        amount === undefined
          ? `${actor} placed an auction bid.`
          : `${actor} is leading the auction at ${formatMoney(amount, "Tabs")}.`,
        "polite",
      );
    }
    case "AuctionPassed":
      return announcement(event, `${actor} passed in the auction.`, "polite");
    case "AuctionClosed": {
      const winnerId = payloadString(event, "winnerSeatId");
      const winningBid = payloadNumber(event, "winningBid");
      return announcement(
        event,
        winnerId === undefined
          ? "The auction closed without a sale."
          : `${seatName(seats, winnerId)} won the auction${
              winningBid === undefined ? "." : ` at ${formatMoney(winningBid, "Tabs")}.`
            }`,
        "polite",
      );
    }
    case "ObligationCreated": {
      const debtorId = payloadString(event, "debtorSeatId") ?? actorId;
      const amount = payloadNumber(event, "amount");
      return announcement(
        event,
        amount === undefined
          ? `${seatName(seats, debtorId)} has an Owed that must be resolved.`
          : `${seatName(seats, debtorId)} owes ${formatMoney(amount, "Tabs")} and must resolve it.`,
        "assertive",
      );
    }
    case "ObligationSettled": {
      const debtorId = payloadString(event, "debtorSeatId") ?? actorId;
      const amount = payloadNumber(event, "amount");
      return announcement(
        event,
        amount === undefined
          ? `${seatName(seats, debtorId)} resolved the Owed.`
          : `${seatName(seats, debtorId)} resolved the Owed of ${formatMoney(amount, "Tabs")}.`,
        "polite",
      );
    }
    case "PlayPaused":
      return announcement(
        event,
        "Play is paused until the required player reconnects.",
        "assertive",
      );
    case "PlayResumed":
      return announcement(event, "Play has resumed.", "polite");
    case "SeatEliminated":
      return announcement(
        event,
        `${seatName(seats, payloadString(event, "seatId"))} has been eliminated.`,
        "assertive",
      );
    case "GameCompleted": {
      const winnerId = payloadString(event, "winnerSeatId");
      return announcement(
        event,
        winnerId === undefined
          ? "The game is complete with no winner."
          : `${seatName(seats, winnerId)} won the game.`,
        "assertive",
      );
    }
    case "GameEndedNoContest":
      return announcement(event, "The game ended without a result.", "assertive");
    default:
      return undefined;
  }
}

function decisionSignature(snapshot: GameSnapshotProjection): string {
  const decisions = snapshot.legalActions
    .filter((action) => DECISION_TYPES.has(action.type))
    .map((action) => ({ type: action.type, constraints: action.constraints ?? {} }));
  return JSON.stringify({
    phase: snapshot.phase,
    decisions,
    obligation: snapshot.obligation?.amount,
  });
}

/** Finds one newly authoritative critical event, or a newly required decision. */
export function announcementForSnapshot(
  previous: GameSnapshotProjection | undefined,
  current: GameSnapshotProjection,
): LiveAnnouncement | undefined {
  if (previous === undefined) return undefined;

  const newEvents = (current.publicEvents ?? [])
    .filter((event) => event.sequence > previous.sequence)
    .sort((left, right) => left.sequence - right.sequence);
  const eventAnnouncement = [...newEvents]
    .reverse()
    .map((event) => announcementForEvent(event, current.seats, current.viewerSeatId))
    .find((value): value is LiveAnnouncement => value !== undefined);
  if (eventAnnouncement !== undefined) return eventAnnouncement;

  if (current.paused !== previous.paused) {
    return {
      key: `paused:${current.sequence}:${current.paused}`,
      message: current.paused
        ? "Play is paused until the required player reconnects."
        : "Play has resumed.",
      priority: current.paused ? "assertive" : "polite",
    };
  }

  if (current.phase === "Finished" && previous.phase !== "Finished") {
    return {
      key: `finished:${current.sequence}`,
      message: "The game is complete. Final standings are ready.",
      priority: "assertive",
    };
  }

  if (
    decisionSignature(current) !== decisionSignature(previous) &&
    current.legalActions.some((action) => DECISION_TYPES.has(action.type))
  ) {
    return {
      key: `decision:${current.sequence}:${decisionSignature(current)}`,
      message:
        current.obligation === undefined
          ? "A decision is required from you."
          : "You must resolve the Owed before play can continue.",
      priority: current.obligation === undefined ? "assertive" : "assertive",
    };
  }
  return undefined;
}

/** Announces transport transitions without making presence churn audible. */
export function announcementForConnection(
  previous: ConnectionAnnouncementState | undefined,
  current: ConnectionAnnouncementState,
): LiveAnnouncement | undefined {
  if (current === "reconnecting" && previous !== "reconnecting") {
    return {
      key: "connection:reconnecting",
      message: "Connection lost. Reconnecting to the live game.",
      priority: "assertive",
    };
  }
  if (current === "live" && (previous === "reconnecting" || previous === "resyncing")) {
    return {
      key: "connection:restored",
      message: "Connection restored. Live game state is up to date.",
      priority: "polite",
    };
  }
  if (current === "closed" && previous !== "closed") {
    return {
      key: "connection:closed",
      message: "The live game is unavailable.",
      priority: "assertive",
    };
  }
  return undefined;
}
