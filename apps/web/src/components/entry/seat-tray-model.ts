import type { SeatToken } from "@blockparty/contracts";
import { PIECE_OPTIONS } from "./piece-options";

export interface SeatTrayEntry {
  readonly id: string;
  readonly label: string;
  readonly kind: "host" | "human" | "bot";
  readonly token?: SeatToken;
}

export interface SetupSeatTrayProps {
  readonly humanSeatCount: number;
  readonly botSeatCount: number;
  readonly hostToken?: SeatToken;
}

export function setupSeatTrayEntries({
  humanSeatCount,
  botSeatCount,
  hostToken,
}: SetupSeatTrayProps): readonly SeatTrayEntry[] {
  const entries: SeatTrayEntry[] = [
    { id: "host", label: "Your seat", kind: "host", token: hostToken },
  ];
  for (let index = 1; index < humanSeatCount; index += 1) {
    entries.push({ id: `human-${index}`, label: `Open Human seat ${index}`, kind: "human" });
  }

  const botPieces = PIECE_OPTIONS.filter((piece) => piece.token.pieceId !== hostToken?.pieceId);
  for (let index = 0; index < botSeatCount; index += 1) {
    entries.push({
      id: `bot-${index + 1}`,
      label: `Computer ${index + 1}`,
      kind: "bot",
      token: botPieces[index]?.token,
    });
  }
  return entries;
}
