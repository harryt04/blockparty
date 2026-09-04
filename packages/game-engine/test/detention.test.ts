import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE, type ContentBundle } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import { deriveInitialState, nextInt } from "../src/prng";
import { replay, resolve, type GameState, type RuleSet, type SeatState } from "../src/index";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff));
const CONTENT: ContentBundle = {
  ...PLACEHOLDER_BUNDLE,
  spaces: PLACEHOLDER_BUNDLE.spaces.map((space) => ({ ...space, effects: [] })),
};
const RULES: RuleSet = { content: CONTENT, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, options: Partial<SeatState> = {}): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance: 100_000,
  position: 6,
  deedIds: [],
  detained: true,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
  ...options,
});

const detainedState = (options: Partial<SeatState> = {}): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: CONTENT.contentVersion,
  gameId: "game-a11",
  aggregateVersion: 0,
  phase: "TurnStart",
  seats: [seat("seat-a", options), seat("seat-b", { detained: false, position: 0 })],
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 2,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

const choiceState = (state: GameState): GameState =>
  replay(state, [{ type: "TurnStarted", eventVersion: 1, payload: { seatId: "seat-a" } }], RULES);

const prngForRoll = (matching: boolean): ReturnType<typeof deriveInitialState> => {
  let prng = deriveInitialState(SEED);
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const first = nextInt(prng, 6);
    const second = nextInt(first.next, 6);
    if ((first.value === second.value) === matching) return prng;
    prng = second.next;
  }
  throw new Error("fixed seed did not produce the requested detention roll");
};

describe("A11 detention state machine", () => {
  it("opens one explicit release choice at the start of a detained turn", () => {
    const state = choiceState(detainedState());
    expect(state.phase).toBe("AwaitChoice");
    expect(state.pendingChoice).toEqual({ choiceId: "detention:seat-a", continuation: [] });

    expect(
      resolve(
        state,
        {
          actorSeatId: "seat-a",
          command: { type: "ChoosePendingOption", choiceId: "detention:seat-a", optionId: "bad" },
        },
        RULES,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_PAYLOAD", reasonCode: "INVALID_DETENTION_OPTION" });
  });

  it("uses a held release card, removes it from circulation, and preserves asset rights", () => {
    const releaseDeck = CONTENT.decks.find((deck) => deck.cards.some((card) => card.retainable));
    const releaseCard = releaseDeck?.cards.find((card) => card.retainable);
    if (releaseDeck === undefined || releaseCard === undefined)
      throw new Error("missing card fixture");
    const beforeState = choiceState(
      detainedState({ detentionReleaseCardIds: [releaseCard.cardId], deedIds: ["deed-a"] }),
    );
    const before = {
      ...beforeState,
      decks: [{ deckId: releaseDeck.deckId, drawPile: [], discardPile: [] }],
    };
    const result = resolve(
      before,
      {
        actorSeatId: "seat-a",
        command: {
          type: "ChoosePendingOption",
          choiceId: "detention:seat-a",
          optionId: `use-release-card:${releaseCard.cardId}`,
        },
      },
      RULES,
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected release card use");
    expect(result.events.map((event) => event.type)).toEqual([
      "DetentionReleaseCardUsed",
      "DetentionReleased",
    ]);
    expect(result.state.phase).toBe("AwaitRoll");
    expect(result.state.seats[0]).toMatchObject({
      detained: false,
      detentionTurnsRemaining: 0,
      detentionReleaseCardIds: [],
      deedIds: ["deed-a"],
    });
    expect(result.state.decks?.[0]?.discardPile).toEqual([releaseCard.cardId]);
    expect(replay(before, result.events, RULES)).toEqual(result.state);
  });

  it("requires the fee only after the configured attempts, then releases without a timer", () => {
    const beforeAttempts = choiceState(detainedState({ balance: 100_000 }));
    expect(
      resolve(
        beforeAttempts,
        {
          actorSeatId: "seat-a",
          command: {
            type: "ChoosePendingOption",
            choiceId: "detention:seat-a",
            optionId: "pay-release-fee",
          },
        },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "RELEASE_FEE_REQUIRED_AFTER_ATTEMPTS" });

    const afterAttempts = choiceState(detainedState({ detentionTurnsRemaining: 3 }));
    const result = resolve(
      afterAttempts,
      {
        actorSeatId: "seat-a",
        command: {
          type: "ChoosePendingOption",
          choiceId: "detention:seat-a",
          optionId: "pay-release-fee",
        },
      },
      RULES,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected detention fee payment");
    expect(result.events.map((event) => event.type).slice(0, 4)).toEqual([
      "FeePaid",
      "DetentionReleased",
      "DiceRolled",
      "TokenMoved",
    ]);
    expect(result.state.seats[0]).toMatchObject({ balance: 115_000, detained: false });
    expect(result.state.phase).toBe("ResolveMove");

    const debt = resolve(
      choiceState(detainedState({ balance: 0, detentionTurnsRemaining: 3 })),
      {
        actorSeatId: "seat-a",
        command: {
          type: "ChoosePendingOption",
          choiceId: "detention:seat-a",
          optionId: "pay-release-fee",
        },
      },
      RULES,
    );
    expect(debt).toMatchObject({
      ok: true,
      state: {
        phase: "AwaitDebt",
        obligation: { debtorSeatId: "seat-a", amount: 5_000, reasonCode: "DETENTION_RELEASE_FEE" },
      },
    });
  });

  it("ends a failed matching attempt and starts the next seat, with no automatic timeout", () => {
    const before = choiceState({ ...detainedState(), prng: prngForRoll(false) });
    const result = resolve(
      before,
      {
        actorSeatId: "seat-a",
        command: {
          type: "ChoosePendingOption",
          choiceId: "detention:seat-a",
          optionId: "attempt-roll",
        },
      },
      RULES,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected failed detention attempt");
    expect(result.events.map((event) => event.type)).toEqual([
      "DiceRolled",
      "TurnEnded",
      "TurnStarted",
    ]);
    expect(result.events[0]?.payload).toMatchObject({
      source: "detentionAttempt",
      matching: false,
    });
    expect(result.state.seats[0]).toMatchObject({ detained: true, detentionTurnsRemaining: 1 });
    expect(result.state.phase).toBe("AwaitRoll");
    expect(result.state.activeSeatId).toBe("seat-b");
    expect(result.state.consecutiveMatchingRolls).toBe(0);
    expect(replay(before, result.events, RULES)).toEqual({ ...result.state, prng: before.prng });
  });

  it("releases and moves on a matching attempt without granting an extra turn", () => {
    const before = choiceState({ ...detainedState(), prng: prngForRoll(true) });
    const result = resolve(
      before,
      {
        actorSeatId: "seat-a",
        command: {
          type: "ChoosePendingOption",
          choiceId: "detention:seat-a",
          optionId: "attempt-roll",
        },
      },
      RULES,
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected matching detention attempt");
    expect(result.events.map((event) => event.type).slice(0, 3)).toEqual([
      "DiceRolled",
      "DetentionReleased",
      "TokenMoved",
    ]);
    expect(result.events[0]?.payload).toMatchObject({ source: "detentionAttempt", matching: true });
    expect(result.state.seats[0]).toMatchObject({ detained: false, detentionTurnsRemaining: 0 });
    expect(result.state.phase).toBe("ResolveMove");
    expect(result.state.consecutiveMatchingRolls).toBe(0);
  });

  it("keeps a detained owner's assets but suppresses their rent income under VAR-004", () => {
    const first = nextInt(deriveInitialState(SEED), 6);
    const second = nextInt(first.next, 6);
    const deedId = "d-sawhorse-lane";
    const destinationRouteIndex = 6 + first.value + second.value + 2;
    const content = {
      ...CONTENT,
      spaces: CONTENT.spaces.map((space) =>
        space.routeIndex === destinationRouteIndex
          ? { ...space, type: "deed" as const, deedId, effects: [] }
          : space,
      ),
    };
    const base = detainedState({ detained: false });
    const before: GameState = {
      ...base,
      phase: "AwaitRoll",
      contentVersion: content.contentVersion,
      seats: [base.seats[0]!, { ...base.seats[1]!, detained: true, deedIds: [deedId] }],
      deeds: content.deeds.map((deed) => ({
        deedId: deed.deedId,
        ownerSeatId: deed.deedId === deedId ? "seat-b" : undefined,
        mortgaged: false,
        improvementLevel: 0,
      })),
      prng: deriveInitialState(SEED),
    };
    const rules: RuleSet = {
      content,
      configuration: { ...STANDARD_CONFIGURATION, preset: "custom", noIncomeWhileDetained: true },
    };
    const result = resolve(before, { actorSeatId: "seat-a", command: { type: "RollDice" } }, rules);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected detained-owner rent landing");
    expect(result.events.map((event) => event.type)).not.toContain("RentPaid");
    expect(result.state.seats[1]).toMatchObject({
      detained: true,
      balance: 100_000,
      deedIds: [deedId],
    });

    const defaultResult = resolve(
      before,
      { actorSeatId: "seat-a", command: { type: "RollDice" } },
      RULES,
    );
    expect(defaultResult).toMatchObject({ ok: true });
    if (!defaultResult.ok) throw new Error("expected default detained-owner rent landing");
    expect(defaultResult.events.at(-1)).toMatchObject({
      type: "RentPaid",
      payload: { deedId, amount: 1_000, creditorSeatId: "seat-b" },
    });
    expect(defaultResult.state.seats[1]?.balance).toBe(101_000);
  });
});
