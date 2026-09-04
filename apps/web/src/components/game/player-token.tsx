/**
 * A player token: a distinct SILHOUETTE plus a pattern plus an initial.
 * Color is supplemental and never the only cue. See DS-020 and DS-041.
 */
import type { SeatToken } from "@blockparty/contracts";
import { cn } from "@/lib/utils";

const SHAPE_PATHS: Record<SeatToken["shape"], string> = {
  barricade: "M4 18 L7 6 M16 18 L13 6 M2 10 H18",
  cooler: "M3 8 H17 V17 H3 Z M7 8 V5 H13 V8",
  boombox: "M2 7 H18 V16 H2 Z M6 11.5 h0.01 M14 11.5 h0.01",
  hydrant: "M10 4 V17 M6 8 H14 M7 17 H13",
  flyer: "M5 3 H15 V17 L10 14 L5 17 Z",
  stoop: "M3 17 H8 V13 H13 V9 H18",
};

const COLOR_CLASS: Record<number, string> = {
  1: "text-player-1",
  2: "text-player-2",
  3: "text-player-3",
  4: "text-player-4",
  5: "text-player-5",
  6: "text-player-6",
};

/**
 * A visible stroke treatment gives every token a non-colour identity. The
 * accessible label names the same shape and pattern for assistive technology.
 * See DS-020, DS-041, and UX-040.
 */
export const PATTERN_STROKE: Record<SeatToken["pattern"], string | undefined> = {
  solid: undefined,
  stripe: "4 2",
  dot: "0.5 2.5",
  cross: "2 2",
  chevron: "1 2 4 2",
  grid: "1 1 1 3",
};

export function PlayerToken({
  token,
  name,
  className,
}: {
  token: SeatToken;
  name?: string;
  className?: string;
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        COLOR_CLASS[token.colorIndex] ?? "text-ink",
        className,
      )}
      data-token-pattern={token.pattern}
      data-token-shape={token.shape}
    >
      <svg
        viewBox="0 0 20 20"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={`${name ?? "Seat"} token: ${token.shape}, ${token.pattern}`}
      >
        <path d={SHAPE_PATHS[token.shape]} strokeDasharray={PATTERN_STROKE[token.pattern]} />
      </svg>
      <span aria-hidden="true" className="text-xs font-semibold">
        {initial}
      </span>
    </span>
  );
}
