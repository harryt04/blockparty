import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE, type ContentBundle, type Deck } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState, nextInt } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, position = 0, balance = 100_000): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const prngBeforeFirstRoll = () => {
  let prng = deriveInitialState(SEED);
  for (let index = 0; index < 3; index += 1) prng = nextInt(prng, Number.MAX_SAFE_INTEGER).next;
  return prng;
};

const deck = (deckId: string, cards: Deck["cards"]): Deck => ({ deckId, name: deckId, cards });

const cardContent = (): ContentBundle => {
  const alpha = deck("deck-alpha", [
    {
      cardId: "card-alpha",
      title: "Alpha",
      text: "Collect, then move.",
      effects: [
        { type: "CollectBank", amount: 5_000 },
        { type: "MoveBy", spaces: 1 },
      ],
      retainable: false,
    },
    {
      cardId: "card-alpha-2",
      title: "Alpha two",
      text: "A second route card.",
      effects: [],
      retainable: false,
    },
    {
      cardId: "card-alpha-3",
      title: "Alpha three",
      text: "A third route card.",
      effects: [],
      retainable: false,
    },
  ]);
  const beta = deck("deck-beta", [
    {
      cardId: "card-beta",
      title: "Beta",
      text: "Keep this release card.",
      effects: [{ type: "GrantDetentionReleaseCard" }],
      retainable: true,
    },
    {
      cardId: "card-beta-2",
      title: "Beta two",
      text: "Another release card.",
      effects: [],
      retainable: true,
    },
  ]);
  return {
    ...PLACEHOLDER_BUNDLE,
    spaces: PLACEHOLDER_BUNDLE.spaces.map((space) => {
      if (space.spaceId === "s06") {
        return {
          ...space,
          type: "eventDraw" as const,
          effects: [{ type: "Draw" as const, deckId: "deck-alpha" }],
        };
      }
      if (space.spaceId === "s07") {
        return {
          ...space,
          type: "eventDraw" as const,
          effects: [{ type: "Draw" as const, deckId: "deck-beta" }],
        };
      }
      return { ...space, effects: [] };
    }),
    decks: [alpha, beta],
  };
};

const cardState = (content: ContentBundle): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: content.contentVersion,
  gameId: "game-a10",
  aggregateVersion: 0,
  phase: "AwaitRoll",
  seats: [seat("seat-a"), seat("seat-b")],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  decks: [
    { deckId: "deck-alpha", drawPile: ["card-alpha", "card-alpha-2"], discardPile: [] },
    { deckId: "deck-beta", drawPile: ["card-beta"], discardPile: [] },
  ],
  prng: prngBeforeFirstRoll(),
});

describe("A10 cards and decks", () => {
  it("records deterministic shuffles for every deck at game start", () => {
    const content = cardContent();
    const before = {
      ...cardState(content),
      phase: "Lobby" as const,
      seats: [seat("seat-a"), seat("seat-b")],
    };
    const started = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      { ...RULES, content },
    );

    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error("expected game start");
    expect(started.state.decks).toEqual([
      {
        deckId: "deck-alpha",
        drawPile: ["card-alpha-3", "card-alpha-2", "card-alpha"],
        discardPile: [],
      },
      { deckId: "deck-beta", drawPile: ["card-beta", "card-beta-2"], discardPile: [] },
    ]);
    expect(started.events[0]?.payload).toMatchObject({
      deckOrders: [
        { deckId: "deck-alpha", cardIds: ["card-alpha-3", "card-alpha-2", "card-alpha"] },
        { deckId: "deck-beta", cardIds: ["card-beta", "card-beta-2"] },
      ],
    });
    expect("seed" in started.events[0]!.payload).toBe(false);
  });

  it("resolves card instructions in order, discards ordinary cards, and replays them", () => {
    const content = cardContent();
    const rules = { ...RULES, content };
    const before = cardState(content);
    const result = resolve(before, { actorSeatId: "seat-a", command: { type: "RollDice" } }, rules);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected card draw");
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "CardDrawn",
      "BankPaymentCollected",
      "TokenMoved",
      "CardDiscarded",
      "CardDrawn",
      "DetentionReleaseCardGranted",
    ]);
    expect(result.state.seats[0]).toMatchObject({ balance: 105_000, position: 7 });
    expect(result.state.decks?.[0]).toEqual({
      deckId: "deck-alpha",
      drawPile: ["card-alpha-2"],
      discardPile: ["card-alpha"],
    });
    expect(replay(before, result.events, rules)).toEqual({ ...result.state, prng: before.prng });
  });

  it("removes a retainable release card from the deck and places it in the holder's hand", () => {
    const contentBase = cardContent();
    const content = {
      ...contentBase,
      spaces: contentBase.spaces.map((space) =>
        space.spaceId === "s06"
          ? {
              ...space,
              effects: [{ type: "Draw" as const, deckId: "deck-beta" }],
            }
          : space,
      ),
    };
    const rules = { ...RULES, content };
    const second = resolve(
      cardState(content),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );

    expect(second).toMatchObject({ ok: true });
    if (!second.ok) throw new Error("expected retained card draw");
    expect(second.events.map((event) => event.type)).toContain("DetentionReleaseCardGranted");
    expect(second.events.map((event) => event.type)).not.toContain("CardDiscarded");
    expect(
      second.state.seats.find((candidate) => candidate.seatId === "seat-a")
        ?.detentionReleaseCardIds,
    ).toEqual(["card-beta"]);
    expect(second.state.decks?.[1]).toEqual({ deckId: "deck-beta", drawPile: [], discardPile: [] });
  });

  it("runs each monetary card effect as ordered, replayable ledger events", () => {
    const base = cardContent();
    const content = {
      ...base,
      decks: base.decks.map((candidate) =>
        candidate.deckId === "deck-alpha"
          ? {
              ...candidate,
              cards: candidate.cards.map((card) =>
                card.cardId === "card-alpha"
                  ? {
                      ...card,
                      effects: [
                        { type: "PayBank" as const, amount: 1_000 },
                        { type: "CollectBank" as const, amount: 2_000 },
                        { type: "PayEachPlayer" as const, amount: 1_000 },
                        { type: "CollectEachPlayer" as const, amount: 500 },
                        {
                          type: "RepairCharge" as const,
                          perImprovement: 2_000,
                          perLandmark: 8_000,
                        },
                      ],
                    }
                  : card,
              ),
            }
          : candidate,
      ),
    };
    const rules = { ...RULES, content };
    const result = resolve(
      cardState(content),
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected monetary card effects");
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TokenMoved",
      "CardDrawn",
      "FeePaid",
      "BankPaymentCollected",
      "PlayerPaymentCollected",
      "PlayerPaymentCollected",
      "FeePaid",
      "CardDiscarded",
    ]);
    expect(result.state.seats.map((candidate) => candidate.balance)).toEqual([100_500, 100_500]);
    expect(replay(cardState(content), result.events, rules)).toEqual({
      ...result.state,
      prng: cardState(content).prng,
    });
  });

  it("retains a card choice continuation until the choice resolves", () => {
    const base = cardContent();
    const content = {
      ...base,
      decks: base.decks.map((candidate) =>
        candidate.deckId === "deck-alpha"
          ? {
              ...candidate,
              cards: candidate.cards.map((card) =>
                card.cardId === "card-alpha"
                  ? {
                      ...card,
                      effects: [
                        { type: "Choose" as const, choiceId: "card-choice" },
                        { type: "CollectBank" as const, amount: 1_000 },
                      ],
                    }
                  : card,
              ),
            }
          : candidate,
      ),
    };
    const rules = { ...RULES, content };
    const before = cardState(content);
    const paused = resolve(before, { actorSeatId: "seat-a", command: { type: "RollDice" } }, rules);

    expect(paused).toMatchObject({ ok: true, state: { phase: "AwaitChoice" } });
    if (!paused.ok) throw new Error("expected card choice");
    expect(paused.state.pendingChoice?.choiceId).toBe("card-choice");
    expect(paused.state.decks?.[0]?.discardPile).toEqual([]);

    const resumed = resolve(
      paused.state,
      {
        actorSeatId: "seat-a",
        command: { type: "ChoosePendingOption", choiceId: "card-choice", optionId: "continue" },
      },
      rules,
    );
    expect(resumed).toMatchObject({ ok: true, state: { phase: "ResolveMove" } });
    if (!resumed.ok) throw new Error("expected choice continuation");
    expect(resumed.state.seats[0]?.balance).toBe(101_000);
    expect(resumed.state.decks?.[0]?.discardPile).toEqual(["card-alpha"]);
    expect(resumed.events.map((event) => event.type)).toEqual([
      "PendingChoiceResolved",
      "BankPaymentCollected",
      "CardDiscarded",
    ]);
  });

  it("reshuffles a discard pile only when a deck's draw pile is empty", () => {
    const content = cardContent();
    const rules = { ...RULES, content };
    const before = cardState(content);
    const reshuffleState: GameState = {
      ...before,
      decks: [
        { deckId: "deck-alpha", drawPile: [], discardPile: ["card-alpha", "card-alpha-2"] },
        ...before.decks!.slice(1),
      ],
    };
    const result = resolve(
      reshuffleState,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      rules,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected discard reshuffle");
    const draw = result.events.find((event) => event.type === "CardDrawn");
    expect(draw?.payload).toMatchObject({
      deckId: "deck-alpha",
      discardCardIds: [],
    });
    expect(result.state.decks?.[0]?.drawPile).toHaveLength(1);
    expect(result.state.decks?.[0]?.discardPile).toHaveLength(1);
  });
});
