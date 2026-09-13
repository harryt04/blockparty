import { describe, expect, it } from "vitest";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import { boardCellCoordinates, perimeterCoordinates } from "../src/components/game/board-model";

const classicLayout = Object.fromEntries(
  CLASSIC_BUNDLE.spaces.map((space) => [space.spaceId, space.layout]),
);

describe("classic board topology", () => {
  it("places all 40 production spaces on unique perimeter cells", () => {
    const coordinates = CLASSIC_BUNDLE.spaces.map((space) =>
      boardCellCoordinates(space, classicLayout, space.spaceId),
    );

    expect(coordinates).toHaveLength(40);
    expect(new Set(coordinates.map(({ x, y }) => `${x}:${y}`)).size).toBe(40);
    expect(coordinates.every(({ x, y }) => x === 0 || x === 10 || y === 0 || y === 10)).toBe(true);
  });

  it("keeps route-order fallback cells on the perimeter when a hint is invalid", () => {
    expect(boardCellCoordinates({ routeIndex: 12 }, { s12: { x: 4, y: 4 } }, "s12")).toEqual({
      x: 10,
      y: 2,
    });
    expect(perimeterCoordinates(39)).toEqual({ x: 0, y: 1 });
  });
});
