/**
 * The event feed: a readable log rendered from the authoritative event log,
 * never inferred from animation. See UX-002 and UX-040.
 *
 * It is a collapsible labelled panel on mobile and a persistent panel on
 * desktop. Announcements stay restrained; this log is the readable record.
 */
import type { DomainEvent, SeatProjection } from "@blockparty/contracts";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/components/display-names";

const EVENT_LABELS: Partial<Record<DomainEvent["type"], string>> = {
  GameStarted: "Game started",
  TurnStarted: "Turn started",
  DiceRolled: "Dice rolled",
  TokenMoved: "Token moved",
  StartPaymentCollected: "Sunup payment collected",
  DeedAcquired: "Address acquired",
  AcquisitionDeclined: "Address declined",
  RentPaid: "Rent paid",
  FeePaid: "Permit fee paid",
  BankPaymentCollected: "Payment collected by the Committee",
  PlayerPaymentCollected: "Payment collected by a player",
  ObligationCreated: "Owed created",
  ObligationSettled: "Owed settled",
  DeedMortgaged: "Address mortgaged",
  MortgageRedeemed: "Address bought back",
  DeedTransferred: "Address transferred",
  TradeProposed: "Trade proposed",
  TradeAccepted: "Trade accepted",
  TradeRejected: "Trade rejected",
  TradeCancelled: "Trade cancelled",
  TradeStaled: "Trade became stale",
  CardDrawn: "Taped Flyer drawn",
  DetentionEntered: "Noise Complaint entered",
  DetentionReleased: "Noise Complaint cleared",
  BankruptcyDeclared: "Packed Up declared",
  SeatEliminated: "Seat eliminated",
  GameCompleted: "Game completed",
  GameEndedNoContest: "Game ended without a result",
  PlayPaused: "Play paused",
  PlayResumed: "Play resumed",
};

function eventLabel(type: DomainEvent["type"]): string {
  return (
    EVENT_LABELS[type] ??
    type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase())
  );
}

function eventDescription(
  event: DomainEvent,
  seats: readonly SeatProjection[],
  currencyLabel: string,
): string {
  const actor =
    event.actorSeatId === undefined
      ? "The Committee"
      : (seats.find((seat) => seat.seatId === event.actorSeatId)?.name ?? "A player");
  const payload = event.payload;
  const amount =
    typeof payload.amount === "number"
      ? ` · ${formatMoney(payload.amount, currencyLabel)}`
      : typeof payload.bid === "number"
        ? ` · ${formatMoney(payload.bid, currencyLabel)}`
        : "";
  return `${actor}: ${eventLabel(event.type)}${amount}`;
}

export function EventFeed({
  events,
  seats = [],
  currencyLabel = "Tabs",
  defaultOpen = false,
}: {
  events: readonly DomainEvent[];
  seats?: readonly SeatProjection[];
  currencyLabel?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-(--radius-lg) border border-line bg-surface-raised"
    >
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 font-medium">
        Event log{events.length > 0 ? ` (${events.length})` : ""}
      </summary>
      <div className="max-h-80 overflow-y-auto px-4 pb-4">
        {events.length === 0 ? (
          <EmptyState
            title="Nothing has happened yet"
            description="Rolls, payments, and ownership changes appear here as the game runs."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((event) => (
              <li key={`${event.gameId}-${event.sequence}`} className="text-sm">
                <span className="tabular text-muted-ink">#{event.sequence}</span>{" "}
                <span>{eventDescription(event, seats, currencyLabel)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
