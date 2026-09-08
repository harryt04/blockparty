import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { deriveInitialState } from "../src/prng";
import { resolve, type GameState, type RuleSet } from "../src/index";

const RULES: RuleSet = {
  content: PLACEHOLDER_BUNDLE,
  configuration: STANDARD_CONFIGURATION,
};

function lobby(): GameState {
  return {
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: "game-lobby-seats",
    aggregateVersion: 0,
    phase: "Lobby",
    seats: [
      {
        seatId: "host",
        kind: "human",
        status: "active",
        balance: 0,
        position: 0,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
      {
        seatId: "open",
        kind: "open",
        status: "active",
        balance: 0,
        position: 0,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
      {
        seatId: "computer",
        kind: "bot",
        status: "active",
        balance: 0,
        position: 0,
        deedIds: [],
        detained: false,
        detentionTurnsRemaining: 0,
        detentionReleaseCardIds: [],
      },
    ],
    deeds: [],
    bank: { cash: 0, deedIds: [], improvementInventory: {} },
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(new Uint8Array(32)),
  };
}

describe("lobby seat commands", () => {
  it("fills an open Human seat with a Computer and can safely reopen it", () => {
    const before = lobby();
    const added = resolve(before, { actorSeatId: "host", command: { type: "AddBotSeat" } }, RULES);

    expect(added).toMatchObject({ ok: true });
    if (!added.ok) throw new Error("expected the Computer seat to be added");
    expect(added.events.map((event) => event.type)).toEqual(["BotSeatAdded"]);
    expect(added.state.seats.find((seat) => seat.seatId === "open")?.kind).toBe("bot");
    expect(before.seats.find((seat) => seat.seatId === "open")?.kind).toBe("open");

    const removed = resolve(
      added.state,
      { actorSeatId: "host", command: { type: "RemoveSeat", seatId: "open" } },
      RULES,
    );
    expect(removed).toMatchObject({ ok: true });
    if (!removed.ok) throw new Error("expected the Computer seat to be removed");
    expect(removed.events.map((event) => event.type)).toEqual(["SeatOpened"]);
    expect(removed.state.seats.find((seat) => seat.seatId === "open")?.kind).toBe("open");
  });

  it("does not let a host remove a claimed Human seat", () => {
    expect(
      resolve(
        lobby(),
        { actorSeatId: "host", command: { type: "RemoveSeat", seatId: "host" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "COMPUTER_SEAT_REQUIRED" });
  });
});
