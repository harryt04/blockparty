import type { BoardSpaceProjection } from "@blockparty/contracts";

export interface BoardCellCoordinates {
  readonly x: number;
  readonly y: number;
}

export type LayoutMap = Record<string, { x: number; y: number } | undefined>;

/**
 * A classic route has one cell for each perimeter position. Keep this
 * fallback for old or malformed presentation hints so a single bad layout
 * record cannot create page overflow or a cell in the board center.
 */
export function perimeterCoordinates(routeIndex: number): BoardCellCoordinates {
  const index = ((routeIndex % 40) + 40) % 40;
  if (index <= 10) return { x: index, y: 0 };
  if (index <= 20) return { x: 10, y: index - 10 };
  if (index <= 30) return { x: 30 - index, y: 10 };
  return { x: 0, y: 40 - index };
}

export function boardCellCoordinates(
  space: Pick<BoardSpaceProjection, "routeIndex">,
  layout: LayoutMap,
  spaceId: string,
): BoardCellCoordinates {
  const point = layout[spaceId];
  if (
    point !== undefined &&
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= 0 &&
    point.x <= 10 &&
    point.y >= 0 &&
    point.y <= 10 &&
    (point.x === 0 || point.x === 10 || point.y === 0 || point.y === 10)
  ) {
    return point;
  }
  return perimeterCoordinates(space.routeIndex);
}
