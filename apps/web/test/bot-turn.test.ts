import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { botActorSeatId, isBotOnlyGame } from "../src/server/commands/run-bot-turn";
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

describe("bot-only continuation", () => {
  type BotOnlyGame = Parameters<typeof isBotOnlyGame>[0];
  const game = (seats: readonly Partial<GameState["seats"][number]>[]) =>
    ({
      status: "ACTIVE",
      paused: false,
      snapshot: {
        seats: seats.map((seat) => ({
          seatId: "seat",
          kind: "bot",
          status: "active",
          ...seat,
        })),
      } as unknown as GameState,
    }) as BotOnlyGame;

  it("continues when every remaining active seat is a bot", () => {
    expect(
      isBotOnlyGame(game([{ seatId: "bot-a" }, { seatId: "bot-b" }, { status: "eliminated" }])),
    ).toBe(true);
  });

  it("stops when an active human or terminal state remains", () => {
    expect(isBotOnlyGame(game([{ kind: "human" }, { kind: "bot" }]))).toBe(false);
    expect(isBotOnlyGame({ ...game([{ kind: "bot" }]), status: "COMPLETED" })).toBe(false);
  });
});
