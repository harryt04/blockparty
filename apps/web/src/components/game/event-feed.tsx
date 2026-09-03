/**
 * The event feed: a readable log rendered from the authoritative event log,
 * never inferred from animation. See UX-002 and UX-040.
 *
 * It is a collapsible labelled panel on mobile and a persistent panel on
 * desktop. Announcements stay restrained; this log is the readable record.
 */
import type { DomainEvent } from "@blockparty/contracts";
import { EmptyState } from "@/components/ui/empty-state";

export function EventFeed({
  events,
  defaultOpen = false,
}: {
  events: readonly DomainEvent[];
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
                <span className="font-medium">{event.type}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
