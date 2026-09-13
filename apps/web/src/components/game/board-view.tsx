/**
 * The semantic classic board. See UX-044–045 and DS-071–072.
 *
 * Every space is a real button in the 11 × 11 perimeter grid. The ordered
 * BoardList remains available as the equivalent route-order inspection
 * surface; neither surface invents state beyond the authorized projection.
 */
import type {
  BoardSpaceProjection,
  GameSnapshotProjection,
  SeatProjection,
} from "@blockparty/contracts";
import {
  DEED_CATEGORY_DISPLAY,
  SPACE_CATEGORY_DISPLAY,
  formatMoney,
} from "@/components/display-names";
import { cn } from "@/lib/utils";
import { boardStopAccessibleLabel } from "./game-model";
import { PlayerToken } from "./player-token";
import { boardCellCoordinates, type BoardCellCoordinates, type LayoutMap } from "./board-model";
import type { PresentedMovement } from "./turn-presentation/turn-presentation-model";
import { TurnStage } from "./turn-presentation/turn-stage";
import type { PresentationStage } from "./turn-presentation/turn-presentation-model";

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

function collisionOffset(index: number, count: number): { x: string; y: string } {
  if (count <= 1) return { x: "0px", y: "0px" };
  if (count <= 3) return { x: `${(index - (count - 1) / 2) * 0.7}rem`, y: "0px" };
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: `${Math.cos(angle) * 0.8}rem`, y: `${Math.sin(angle) * 0.8}rem` };
}

export function BoardView({
  snapshot,
  spaces,
  layout,
  seats,
  districtNames = {},
  selectedSpaceId,
  currencyLabel = "Tabs",
  onSelect,
  zoom = 1,
  movement,
  movementStep = 0,
  activeSeatId,
  presentationStage,
  presentationQueueLength = 0,
  canReplayPresentation = false,
  onSkipPresentation,
  onSkipToLive,
  onReplayPresentation,
  className,
}: {
  snapshot: GameSnapshotProjection;
  spaces: readonly BoardSpaceProjection[];
  layout: LayoutMap;
  seats: readonly SeatProjection[];
  districtNames?: Readonly<Record<string, string>>;
  selectedSpaceId?: string;
  currencyLabel?: string;
  onSelect: (spaceId: string) => void;
  /** Presentation-only zoom, scoped to the board viewport. See UX-045. */
  zoom?: 1 | 1.25 | 1.5;
  movement?: PresentedMovement;
  movementStep?: number;
  activeSeatId?: string;
  presentationStage?: PresentationStage;
  presentationQueueLength?: number;
  canReplayPresentation?: boolean;
  onSkipPresentation?: () => void;
  onSkipToLive?: () => void;
  onReplayPresentation?: () => void;
  className?: string;
}) {
  const seatsByPosition = new Map<number, SeatProjection[]>();
  for (const seat of seats) {
    const position =
      movement?.seatId === seat.seatId
        ? (movement.path[movementStep ?? 0] ?? movement.toPosition)
        : seat.position;
    if (position === undefined || seat.token === undefined) continue;
    const occupants = seatsByPosition.get(position) ?? [];
    occupants.push(seat);
    seatsByPosition.set(position, occupants);
  }

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-(--radius-md)", className)}>
      <div className="game-board-pan-viewport" tabIndex={0} aria-label="Board viewport">
        <div
          className="classic-board-frame game-board-zoom-frame relative"
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
              className="classic-board-center flex items-center justify-center border p-3 text-center"
              style={{ gridColumn: "2 / span 9", gridRow: "2 / span 9" }}
            >
              <TurnStage
                snapshot={snapshot}
                stage={presentationStage}
                onSkip={onSkipPresentation ?? (() => undefined)}
                onReplay={onReplayPresentation ?? (() => undefined)}
                canReplay={canReplayPresentation ?? false}
                queueLength={presentationQueueLength ?? 0}
                onSkipToLive={onSkipToLive ?? (() => undefined)}
              />
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
                    "classic-board-cell min-w-0 overflow-hidden border p-1 text-left",
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
                      "classic-board-band block h-3 shrink-0 border-t-4",
                      bandClass(space),
                    )}
                  />
                  <span className="classic-board-muted mt-1 flex min-w-0 items-center justify-between gap-1 text-[0.6rem] leading-none">
                    <span className="tabular shrink-0">{space.routeIndex + 1}</span>
                    <span className="truncate">{deedCategory?.label ?? category.label}</span>
                  </span>
                  <span className="classic-board-cell-name mt-1 line-clamp-2 font-semibold leading-tight">
                    {space.name}
                  </span>
                  <span className="classic-board-muted mt-1 block truncate text-[0.6rem] leading-tight">
                    {space.price === undefined
                      ? (districtName ?? category.label)
                      : formatMoney(space.price, currencyLabel)}
                  </span>
                  <span className="mt-auto min-w-0 truncate pt-1 text-[0.6rem] leading-tight">
                    {state === "Available" ? "" : state}
                  </span>
                </button>
              );
            })}
            <div className="classic-board-piece-overlay" aria-hidden="true">
              {[...seatsByPosition.entries()].flatMap(([position, positionedSeats]) =>
                positionedSeats.map((seat, index) => {
                  const space = spaces.find((candidate) => candidate.routeIndex === position);
                  if (space === undefined || seat.token === undefined) return null;
                  const coordinates = boardCellCoordinates(space, layout, space.spaceId);
                  const offset = collisionOffset(index, positionedSeats.length);
                  const moving = movement?.seatId === seat.seatId;
                  return (
                    <span
                      key={seat.seatId}
                      className={cn(
                        "game-board-overlay-token",
                        seat.seatId === activeSeatId && "game-board-overlay-token-active",
                        moving && "game-board-overlay-token-moving",
                      )}
                      style={{
                        left: `${((coordinates.x + 0.5) / 11) * 100}%`,
                        top: `${((coordinates.y + 0.5) / 11) * 100}%`,
                        transform: `translate(-50%, -50%) translate(${offset.x}, ${offset.y})`,
                      }}
                    >
                      <PlayerToken token={seat.token} name={seat.name} />
                    </span>
                  );
                }),
              )}
            </div>
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
