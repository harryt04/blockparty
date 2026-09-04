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
import { boardStopAccessibleLabel, orderedBoard } from "./game-model";

export function BoardList({
  spaces,
  seats,
  currencyLabel = "Tabs",
  districtNames = {},
  selectedSpaceId,
  onSelect,
}: {
  spaces: readonly BoardSpaceProjection[];
  seats: readonly SeatProjection[];
  currencyLabel?: string;
  districtNames?: Readonly<Record<string, string>>;
  selectedSpaceId?: string;
  onSelect: (spaceId: string) => void;
}) {
  const seatName = (seatId: string) => seats.find((seat) => seat.seatId === seatId)?.name ?? seatId;
  const orderedSpaces = orderedBoard(spaces);

  return (
    <ol
      aria-label="Board stops in route order"
      className="flex flex-col gap-2"
      data-board-list="route-order"
    >
      {orderedSpaces.map((space) => {
        const category = SPACE_CATEGORY_DISPLAY[space.category];
        const deedCategory =
          space.deedCategory === undefined ? undefined : DEED_CATEGORY_DISPLAY[space.deedCategory];
        const districtName =
          space.districtId === undefined ? undefined : districtNames[space.districtId];
        const selected = space.spaceId === selectedSpaceId;
        const details = boardStopAccessibleLabel(space, seats, currencyLabel, districtNames);

        return (
          <li
            key={space.spaceId}
            className={
              selected
                ? "rounded-(--radius-md) border-2 border-brand bg-surface-raised p-3"
                : "rounded-(--radius-md) border border-line bg-surface-raised p-3"
            }
          >
            <button
              type="button"
              className="min-h-11 w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              aria-label={`Inspect ${details}`}
              aria-pressed={selected}
              aria-current={selected ? "location" : undefined}
              aria-controls="active-space-detail"
              onClick={() => onSelect(space.spaceId)}
            >
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="tabular text-sm text-muted-ink">Stop {space.routeIndex}</span>
                <span className="board-stop-name font-medium">{space.name}</span>
                <Badge>{deedCategory?.label ?? category.label}</Badge>
                {districtName === undefined ? null : <Badge variant="info">{districtName}</Badge>}
              </span>

              <span className="mt-1 block text-sm text-muted-ink">
                {space.ownerSeatId === undefined
                  ? space.price === undefined
                    ? "Available."
                    : `Available for ${formatMoney(space.price, currencyLabel)}.`
                  : `Owned by ${seatName(space.ownerSeatId)}.`}
                {space.ownerSeatId !== undefined && space.price !== undefined
                  ? ` Price: ${formatMoney(space.price, currencyLabel)}.`
                  : ""}
                {space.mortgaged === true ? " Mortgaged." : ""}
                {space.improvementLevel !== undefined && space.improvementLevel > 0
                  ? ` Improvement level ${space.improvementLevel}.`
                  : ""}
              </span>

              {space.occupantSeatIds.length > 0 ? (
                <span className="mt-1 block text-sm">
                  Here now: {space.occupantSeatIds.map(seatName).join(", ")}.
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
