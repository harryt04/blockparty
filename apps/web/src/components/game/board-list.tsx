/**
 * The non-spatial board list. See UX-040 and DS-040.
 *
 * This is the accessible EQUIVALENT of the SVG board, not a fallback. Every
 * cell shows, in reading order: route index, category, space name, ownership,
 * economic indicator, and state badges. Ownership and status are text, so the
 * meaning survives with no color at all.
 */
import type { BoardSpaceProjection, SeatProjection } from "@blockparty/contracts";
import { Badge } from "@/components/ui/badge";
import {
  DEED_CATEGORY_DISPLAY,
  SPACE_CATEGORY_DISPLAY,
  formatMoney,
} from "@/components/display-names";

export function BoardList({
  spaces,
  seats,
  currencyLabel = "credits",
}: {
  spaces: readonly BoardSpaceProjection[];
  seats: readonly SeatProjection[];
  currencyLabel?: string;
}) {
  const seatName = (seatId: string) => seats.find((seat) => seat.seatId === seatId)?.name ?? seatId;

  return (
    <ol aria-label="Board stops in route order" className="flex flex-col gap-2">
      {spaces.map((space) => {
        const category = SPACE_CATEGORY_DISPLAY[space.category];
        const deedCategory =
          space.deedCategory === undefined ? undefined : DEED_CATEGORY_DISPLAY[space.deedCategory];

        return (
          <li
            key={space.spaceId}
            className="rounded-(--radius-md) border border-line bg-surface-raised p-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="tabular text-sm text-muted-ink">Stop {space.routeIndex}</span>
              <span className="font-medium">{space.name}</span>
              <Badge>{deedCategory?.label ?? category.label}</Badge>
            </div>

            <p className="mt-1 text-sm text-muted-ink">
              {space.ownerSeatId === undefined
                ? space.price === undefined
                  ? "No owner."
                  : `Available for ${formatMoney(space.price, currencyLabel)}.`
                : `Owned by ${seatName(space.ownerSeatId)}.`}
              {space.mortgaged === true ? " Mortgaged." : ""}
              {space.improvementLevel !== undefined && space.improvementLevel > 0
                ? ` Improvement level ${space.improvementLevel}.`
                : ""}
            </p>

            {space.occupantSeatIds.length > 0 ? (
              <p className="mt-1 text-sm">
                Here now: {space.occupantSeatIds.map(seatName).join(", ")}.
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
