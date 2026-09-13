import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { deriveInitialState, nextInt } from "../src/prng";
import { resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const CARD_ID = "card-collect-each-player-regression";
const RULES: RuleSet = {
  content: {
    ...PLACEHOLDER_BUNDLE,
    spaces: PLACEHOLDER_BUNDLE.spaces.map((space) =>
      space.spaceId === "s06"
        ? {
            ...space,
            type: "eventDraw" as const,
            effects: [{ type: "Draw" as const, deckId: "deck-regression" }],
          }
        : { ...space, effects: [] },
    ),
    decks: [
      {
        deckId: "deck-regression",
        name: "Regression deck",
        cards: [
          {
            cardId: CARD_ID,
            title: "Collect each player",
            text: "Collect from every other player.",
            effects: [{ type: "CollectEachPlayer" as const, amount: 1_000 }],
            retainable: false,
          },
        ],
      },
    ],
  },
  configuration: STANDARD_CONFIGURATION,
};

const beforeFirstRoll = () => {
  let prng = deriveInitialState(SEED);
  for (let index = 0; index < 3; index += 1) prng = nextInt(prng, Number.MAX_SAFE_INTEGER).next;
  return prng;
};

const seat = (seatId: string, balance: number): SeatState => ({
  seatId,
  kind: "bot",
  status: "active",
  balance,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const initialState = (): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: RULES.content.contentVersion,
  gameId: "card-collection-debt-regression",
  aggregateVersion: 0,
  phase: "AwaitRoll",
  seats: [seat("seat-a", 100_000), seat("seat-b", 100_000), seat("seat-c", 0)],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  decks: [{ deckId: "deck-regression", drawPile: [CARD_ID], discardPile: [] }],
  prng: beforeFirstRoll(),
});

describe("card collection debt regression", () => {
  it("charges the actual payer and resumes the card with its original actor", () => {
    // Regression: CARD-COLLECT-DEBT — a broke recipient was recorded as owing itself.
    // Found by /qa on 2026-09-06
    // Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-06.md
    const first = resolve(
      initialState(),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );

    expect(first).toMatchObject({
      ok: true,
      state: {
        phase: "AwaitDebt",
        activeSeatId: "seat-c",
        obligation: {
          debtorSeatId: "seat-c",
          creditorSeatId: "seat-a",
          continuationActorSeatId: "seat-a",
        },
      },
    });
    if (!first.ok) throw new Error("expected collection debt");

    const funded = {
      ...first.state,
      seats: first.state.seats.map((candidate) =>
        candidate.seatId === "seat-c" ? { ...candidate, balance: 1_000 } : candidate,
      ),
    };
    const settled = resolve(
      funded,
      { actorSeatId: "seat-c", command: { type: "PayObligation" } },
      RULES,
    );

    expect(settled).toMatchObject({
      ok: true,
      state: { phase: "ResolveMove", activeSeatId: "seat-a", obligation: undefined },
    });
    if (!settled.ok) throw new Error("expected collection debt to settle");
    expect(settled.events.map((event) => event.type)).toEqual([
      "ObligationSettled",
      "CardDiscarded",
    ]);
    expect(settled.events[0]?.payload).toMatchObject({
      debtorSeatId: "seat-c",
      creditorSeatId: "seat-a",
      continuationActorSeatId: "seat-a",
    });
    expect(settled.state.seats.map((candidate) => candidate.balance)).toEqual([102_000, 99_000, 0]);
  });
});
