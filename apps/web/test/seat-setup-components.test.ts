import { describe, expect, it } from "vitest";
import {
  PIECE_OPTIONS,
  PIECE_PATTERN_LABELS,
  pieceIsAvailable,
} from "../src/components/entry/piece-options";
import { seatCountAfterDelta } from "../src/components/entry/seat-stepper-model";
import { setupSeatTrayEntries } from "../src/components/entry/seat-tray-model";

describe("piece picker model", () => {
  it("defines six pieces with distinct IDs, shapes, colors, and patterns", () => {
    expect(PIECE_OPTIONS).toHaveLength(6);
    expect(new Set(PIECE_OPTIONS.map((piece) => piece.token.pieceId)).size).toBe(6);
    expect(new Set(PIECE_OPTIONS.map((piece) => piece.token.colorIndex)).size).toBe(6);
    expect(new Set(PIECE_OPTIONS.map((piece) => piece.token.pattern)).size).toBe(6);
    expect(PIECE_OPTIONS.map((piece) => piece.label)).toEqual([
      "Lantern",
      "Key",
      "Crescent",
      "Tower",
      "Fox",
      "Teapot",
    ]);
    expect(PIECE_PATTERN_LABELS.grid).toBe("grid");
  });

  it("uses the authoritative availability list without dropping unavailable choices", () => {
    expect(pieceIsAvailable(PIECE_OPTIONS[0]!, ["piece-key"])).toBe(false);
    expect(pieceIsAvailable(PIECE_OPTIONS[1]!, ["piece-key"])).toBe(true);
    expect(pieceIsAvailable(PIECE_OPTIONS[2]!, undefined)).toBe(true);
  });
});

describe("seat stepper model", () => {
  it("clamps button changes at both bounds", () => {
    expect(seatCountAfterDelta(1, -1, 1, 6)).toBe(1);
    expect(seatCountAfterDelta(6, 1, 1, 6)).toBe(6);
    expect(seatCountAfterDelta(3, -1, 1, 6)).toBe(2);
    expect(seatCountAfterDelta(3, 1, 1, 6)).toBe(4);
  });
});

describe("seat tray model", () => {
  it("previews the host, open humans, and computers without assigning the host piece twice", () => {
    const hostToken = PIECE_OPTIONS[0]!.token;
    const seats = setupSeatTrayEntries({ humanSeatCount: 3, botSeatCount: 2, hostToken });

    expect(seats.map((seat) => seat.kind)).toEqual(["host", "human", "human", "bot", "bot"]);
    expect(seats.filter((seat) => seat.kind === "human")).toHaveLength(2);
    expect(seats.filter((seat) => seat.kind === "bot")).toHaveLength(2);
    expect(seats[3]!.token?.pieceId).not.toBe(hostToken.pieceId);
  });
});
