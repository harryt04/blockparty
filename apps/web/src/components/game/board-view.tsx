/**
 * The semantic classic board. See UX-044–045 and DS-071–072.
 *
 * Every space is a real button in the 11 × 11 perimeter grid. The ordered
 * BoardList remains available as the equivalent route-order inspection
 * surface; neither surface invents state beyond the authorized projection.
 */
import type { BoardSpaceProjection, SeatProjection } from "@blockparty/contracts";
import { DEED_CATEGORY_DISPLAY, SPACE_CATEGORY_DISPLAY } from "@/components/display-names";
import { cn } from "@/lib/utils";
import { boardStopAccessibleLabel } from "./game-model";
import { PlayerToken } from "./player-token";
import { boardCellCoordinates, type BoardCellCoordinates, type LayoutMap } from "./board-model";

const DISTRICT_BAND_CLASSES: Readonly<Record<string, string>> = {
  "district-ash": "border-t-asset-district-ash",
  "district-moonfen": "border-t-asset-district-moonfen",
  "district-rosecoil": "border-t-asset-district-rosecoil",
  "district-copperwake": "border-t-asset-district-copperwake",
  "district-starling": "border-t-asset-district-starling",
  "district-thornlight": "border-t-asset-district-thornlight",
  "district-nightjar": "border-t-asset-district-nightjar",
  "district-crown": "border-t-asset-district-crown",
};

const DEED_CATEGORY_BAND_CLASSES: Readonly<Record<string, string>> = {
  transit: "border-t-asset-transit",
  utility: "border-t-asset-utility",
};

function bandClass(space: BoardSpaceProjection): string {
  if (space.districtId !== undefined) {
    return DISTRICT_BAND_CLASSES[space.districtId] ?? "border-t-line";
  }
  return DEED_CATEGORY_BAND_CLASSES[space.deedCategory ?? ""] ?? "border-t-line";
}

function sideFor({ x, y }: BoardCellCoordinates): "top" | "right" | "bottom" | "left" {
  if (y === 0) return "top";
  if (x === 10) return "right";
  if (y === 10) return "bottom";
  return "left";
}

function stateLabel(space: BoardSpaceProjection, seats: readonly SeatProjection[]): string {
  const owner =
    space.ownerSeatId === undefined
      ? undefined
      : seats.find((seat) => seat.seatId === space.ownerSeatId);
  const ownership = owner === undefined ? "Available" : `Owned by ${owner.name ?? "a player"}`;
  const mortgage = space.mortgaged === true ? " · Mortgaged" : "";
  const improvement =
    space.improvementLevel === undefined || space.improvementLevel === 0
      ? ""
      : space.improvementLevel === 5
        ? " · Hotel"
        : ` · ${space.improvementLevel} ${space.improvementLevel === 1 ? "House" : "Houses"}`;
  return `${ownership}${mortgage}${improvement}`;
}

function OccupantStack({
  space,
  seats,
}: {
  space: BoardSpaceProjection;
  seats: readonly SeatProjection[];
}) {
  const occupants = space.occupantSeatIds
    .map((seatId) => seats.find((seat) => seat.seatId === seatId))
    .filter((seat): seat is SeatProjection => seat !== undefined);

  if (occupants.length === 0) return null;

  return (
    <span className="flex min-w-0 -space-x-1 overflow-hidden" aria-hidden="true">
      {occupants.map((seat) =>
        seat.token === undefined ? (
          <span
            key={seat.seatId}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-ink bg-surface text-[0.6rem] font-bold"
          >
            {(seat.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
          </span>
        ) : (
          <PlayerToken key={seat.seatId} token={seat.token} name={seat.name} />
        ),
      )}
    </span>
  );
}

export function BoardView({
  spaces,
  layout,
  seats,
  districtNames = {},
  selectedSpaceId,
  currencyLabel = "Tabs",
  onSelect,
  zoom = 1,
  className,
}: {
  spaces: readonly BoardSpaceProjection[];
  layout: LayoutMap;
  seats: readonly SeatProjection[];
  districtNames?: Readonly<Record<string, string>>;
  selectedSpaceId?: string;
  currencyLabel?: string;
  onSelect: (spaceId: string) => void;
  /** Presentation-only zoom, scoped to the board viewport. See UX-045. */
  zoom?: 1 | 1.25 | 1.5;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-(--radius-md)", className)}>
      <div className="game-board-pan-viewport" tabIndex={0} aria-label="Board viewport">
        <div
          className="classic-board-frame game-board-zoom-frame"
          style={{ width: `${zoom * 100}%`, minHeight: `${zoom * 100}%` }}
          data-board-zoom={zoom}
        >
          <div
            className="classic-board-grid"
            role="group"
            aria-label="Classic 40-space board"
            data-board-topology="perimeter-40"
          >
            <div
              className="classic-board-center flex items-center justify-center border border-line bg-canvas p-3 text-center"
              style={{ gridColumn: "2 / span 9", gridRow: "2 / span 9" }}
            >
              <div>
                <p className="font-serif text-lg">Blockparty</p>
                <p className="mt-1 text-xs text-muted-ink">40-space classic table</p>
              </div>
            </div>

            {spaces.map((space) => {
              const coordinates = boardCellCoordinates(space, layout, space.spaceId);
              const side = sideFor(coordinates);
              const selected = space.spaceId === selectedSpaceId;
              const category = SPACE_CATEGORY_DISPLAY[space.category];
              const deedCategory =
                space.deedCategory === undefined
                  ? undefined
                  : DEED_CATEGORY_DISPLAY[space.deedCategory];
              const districtName =
                space.districtId === undefined ? undefined : districtNames[space.districtId];
              const details = boardStopAccessibleLabel(space, seats, currencyLabel, districtNames);
              const state = stateLabel(space, seats);

              return (
                <button
                  key={space.spaceId}
                  type="button"
                  className={cn(
                    "classic-board-cell min-w-0 overflow-hidden border border-line bg-surface-raised p-1 text-left text-ink",
                    "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                    selected && "classic-board-cell-selected",
                  )}
                  style={{
                    gridColumn: coordinates.x + 1,
                    gridRow: coordinates.y + 1,
                  }}
                  data-board-side={side}
                  data-board-state={space.ownerSeatId === undefined ? "available" : "owned"}
                  aria-label={`Inspect ${details}`}
                  aria-pressed={selected}
                  aria-current={selected ? "location" : undefined}
                  aria-controls="active-space-detail"
                  title={details}
                  onClick={() => onSelect(space.spaceId)}
                >
                  <span
                    className={cn(
                      "classic-board-band block h-2 shrink-0 border-t-4",
                      bandClass(space),
                    )}
                  />
                  <span className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[0.6rem] leading-none text-muted-ink">
                    <span className="tabular shrink-0">{space.routeIndex}</span>
                    <span className="truncate">{space.spaceId}</span>
                  </span>
                  <span className="classic-board-cell-name mt-1 line-clamp-2 font-semibold leading-tight">
                    {space.name}
                  </span>
                  <span className="mt-1 block truncate text-[0.6rem] leading-tight text-muted-ink">
                    {deedCategory?.label ?? category.label}
                    {districtName === undefined ? "" : ` · ${districtName}`}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[0.6rem] leading-tight">
                    <span className="truncate">{state}</span>
                    <OccupantStack space={space} seats={seats} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="border-t border-line bg-surface px-3 py-2 text-xs text-muted-ink">
        Select any perimeter space to inspect its canonical ID, Property details, ownership, and
        pieces. The Board list below preserves the same facts in route order.
      </p>
    </div>
  );
}
