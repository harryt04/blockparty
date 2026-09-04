/**
 * The board. See DS-040 and UX-040.
 *
 * The SVG is decoration only. It is aria-hidden because BoardList carries
 * every stop fact and inspect action as ordered semantic DOM controls.
 *
 * The route is a winding, irregular neighborhood street. It is not a square
 * grid and not a familiar perimeter board. See the DS-001 grid guardrail.
 */
import type { BoardSpaceProjection } from "@blockparty/contracts";
import { SPACE_CATEGORY_DISPLAY } from "@/components/display-names";
import { cn } from "@/lib/utils";

/** Abstract layout units from the content bundle, padded for stroke width. */
function viewBoxFor(spaces: readonly BoardSpaceProjection[], layout: LayoutMap) {
  const points = spaces.map((space) => layout[space.spaceId]).filter(Boolean);
  const xs = points.map((point) => point!.x);
  const ys = points.map((point) => point!.y);
  const minX = Math.min(...xs, 0) - 1.5;
  const minY = Math.min(...ys, 0) - 1.5;
  const maxX = Math.max(...xs, 1) + 1.5;
  const maxY = Math.max(...ys, 1) + 1.5;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export type LayoutMap = Record<string, { x: number; y: number } | undefined>;

export function BoardView({
  spaces,
  layout,
  selectedSpaceId,
  className,
}: {
  spaces: readonly BoardSpaceProjection[];
  layout: LayoutMap;
  selectedSpaceId?: string;
  className?: string;
}) {
  const box = viewBoxFor(spaces, layout);
  const path = spaces
    .map((space) => layout[space.spaceId])
    .filter((point): point is { x: number; y: number } => point !== undefined)
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-(--radius-lg) border border-line bg-surface",
        className,
      )}
    >
      <svg
        viewBox={`${box.minX} ${box.minY} ${box.width} ${box.height}`}
        className="h-full w-full"
        // Decorative: BoardList below is the accessible equivalent. DS-040.
        aria-hidden="true"
        focusable="false"
      >
        {/* Chalk-line hairline route, closed back to the start. */}
        <path
          d={`${path} Z`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.35"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-line"
        />
        {spaces.map((space) => {
          const point = layout[space.spaceId];
          if (point === undefined) return null;
          const selected = space.spaceId === selectedSpaceId;
          return (
            <g key={space.spaceId}>
              <circle
                cx={point.x}
                cy={point.y}
                r={selected ? 0.9 : 0.7}
                className={cn(selected ? "fill-brand" : "fill-surface-raised", "stroke-ink")}
                strokeWidth="0.12"
              />
              <text
                x={point.x}
                y={point.y + 0.22}
                textAnchor="middle"
                fontSize="0.7"
                className={selected ? "fill-brand-ink" : "fill-ink"}
              >
                {space.routeIndex}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-line px-3 py-2 text-xs text-muted-ink">
        A winding neighbourhood street. Numbers are route stops.{" "}
        {spaces.length > 0
          ? `Stop ${spaces[0]?.routeIndex ?? 0} is ${SPACE_CATEGORY_DISPLAY[spaces[0]?.category ?? "start"].label}.`
          : null}
      </p>
    </div>
  );
}
