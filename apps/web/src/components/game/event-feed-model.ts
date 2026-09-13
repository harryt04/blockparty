import type { DomainEvent } from "@blockparty/contracts";

export interface EventGroup {
  readonly key: string;
  readonly aggregateVersion: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly events: readonly DomainEvent[];
}

/**
 * Keeps the journal readable by grouping only the contiguous events committed
 * by one aggregate update. Sequence numbers stay on every event so grouping
 * never obscures the authoritative order. See PRD-FUN-008/010 and CO-028.
 */
export function groupEvents(events: readonly DomainEvent[]): readonly EventGroup[] {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const groups: EventGroup[] = [];

  for (const event of ordered) {
    const previous = groups.at(-1);
    if (
      previous !== undefined &&
      previous.aggregateVersion === event.aggregateVersion &&
      previous.lastSequence + 1 === event.sequence
    ) {
      groups[groups.length - 1] = {
        ...previous,
        lastSequence: event.sequence,
        events: [...previous.events, event],
      };
      continue;
    }

    groups.push({
      key: `${event.aggregateVersion}-${event.sequence}`,
      aggregateVersion: event.aggregateVersion,
      firstSequence: event.sequence,
      lastSequence: event.sequence,
      events: [event],
    });
  }

  return groups;
}
