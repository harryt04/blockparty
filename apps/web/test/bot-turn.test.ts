import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { botActorSeatId } from "../src/server/commands/run-bot-turn";
import type { GameState } from "@blockparty/game-engine";

function state(overrides: Partial<GameState>): GameState {
  return {
    phase: "AwaitRoll",
    activeSeatId: "seat-human",
    prioritySeatId: "seat-human",
    pendingTrade: undefined,
    ...overrides,
  } as GameState;
}

describe("bot command actor selection", () => {
  it("uses auction priority instead of the enclosing turn owner", () => {
    expect(
      botActorSeatId(
        state({
          phase: "AwaitAuction",
          activeSeatId: "seat-human",
          prioritySeatId: "seat-bot",
        }),
      ),
    ).toBe("seat-bot");
  });

  it("keeps ordinary turns on the active seat", () => {
    expect(botActorSeatId(state({ activeSeatId: "seat-bot" }))).toBe("seat-bot");
  });

  it("waits for a pending trade counterparty", () => {
    expect(
      botActorSeatId(
        state({
          activeSeatId: "seat-bot",
          pendingTrade: {
            counterpartySeatId: "seat-human",
          } as NonNullable<GameState["pendingTrade"]>,
        }),
      ),
    ).toBe("seat-human");
  });
});
