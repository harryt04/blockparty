import type { PieceId, SeatToken } from "@blockparty/contracts";

export const PIECE_OPTIONS = [
  { token: { colorIndex: 1, pieceId: "piece-lantern", pattern: "solid" }, label: "Lantern" },
  { token: { colorIndex: 2, pieceId: "piece-key", pattern: "stripe" }, label: "Key" },
  { token: { colorIndex: 3, pieceId: "piece-crescent", pattern: "dot" }, label: "Crescent" },
  { token: { colorIndex: 4, pieceId: "piece-tower", pattern: "cross" }, label: "Tower" },
  { token: { colorIndex: 5, pieceId: "piece-fox", pattern: "chevron" }, label: "Fox" },
  { token: { colorIndex: 6, pieceId: "piece-teapot", pattern: "grid" }, label: "Teapot" },
] satisfies readonly { token: SeatToken; label: string }[];

export type PieceOption = (typeof PIECE_OPTIONS)[number];
export type PieceOptionId = PieceId;

export const PIECE_PATTERN_LABELS: Record<SeatToken["pattern"], string> = {
  solid: "solid",
  stripe: "diagonal stripes",
  dot: "dots",
  cross: "crosshatch",
  chevron: "chevron",
  grid: "grid",
};

export function pieceIsAvailable(
  piece: PieceOption,
  availablePieceIds: readonly PieceOptionId[] | undefined,
): boolean {
  return availablePieceIds === undefined || availablePieceIds.includes(piece.token.pieceId);
}
