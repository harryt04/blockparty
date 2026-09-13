import { describe, expect, it } from "vitest";
import {
  BUNDLES,
  CLASSIC_BUNDLE,
  canonicalHashBundle,
  getBundle,
  validateBundle,
} from "../src/index";
import type { ContentBundle } from "../src/types";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

const copyBundle = (): Mutable<ContentBundle> => structuredClone(CLASSIC_BUNDLE);

describe("classic 1.0.0 content bundle", () => {
  it("matches the authoritative route, deed, district, deck, and economy counts", () => {
    expect(CLASSIC_BUNDLE.spaces.map((space) => space.routeIndex)).toEqual(
      Array.from({ length: 40 }, (_, index) => index),
    );
    expect(CLASSIC_BUNDLE.spaces.filter((space) => space.type === "deed")).toHaveLength(28);
    expect(CLASSIC_BUNDLE.spaces.filter((space) => space.type === "eventDraw")).toHaveLength(6);
    expect(CLASSIC_BUNDLE.spaces.filter((space) => space.type === "fee")).toHaveLength(2);
    expect(CLASSIC_BUNDLE.districts.map((district) => district.deedIds.length)).toEqual([
      2, 3, 3, 3, 3, 3, 3, 2,
    ]);
    expect(CLASSIC_BUNDLE.deeds).toHaveLength(28);
    expect(CLASSIC_BUNDLE.decks.map((deck) => [deck.deckId, deck.cards.length])).toEqual([
      ["deck-moonletters", 16],
      ["deck-echoes", 16],
    ]);
    expect(CLASSIC_BUNDLE.economy).toMatchObject({
      currencyLabel: "crowns",
      startingCash: 150_000,
      startPayment: 20_000,
      detentionReleaseFee: 5_000,
      detentionMaxAttempts: 3,
      improvementInventory: { house: 32, hotel: 12 },
    });
  });

  it("covers every bounded card effect family with distinct authored IDs", () => {
    const cards = CLASSIC_BUNDLE.decks.flatMap((deck) => deck.cards);
    expect(new Set(cards.map((card) => card.cardId)).size).toBe(32);
    expect(new Set(cards.map((card) => card.title)).size).toBe(32);
    expect(new Set(cards.flatMap((card) => card.effects.map((effect) => effect.type)))).toEqual(
      new Set([
        "MoveTo",
        "MoveBy",
        "Choose",
        "CollectBank",
        "PayBank",
        "RepairCharge",
        "GrantDetentionReleaseCard",
        "CollectEachPlayer",
        "PayEachPlayer",
        "SendToDetention",
      ]),
    );
    expect(cards.filter((card) => card.retainable).map((card) => card.cardId)).toEqual([
      "moon-06",
      "moon-16",
      "echo-09",
      "echo-16",
    ]);
    expect(CLASSIC_BUNDLE.provenance.status).toBe("AUTHORED");
    expect(CLASSIC_BUNDLE.provenance.sourceInputs).toContain("docs/product/game-content.md");
  });

  it("is canonically hashed, frozen in the registry, and production-readable", () => {
    expect(CLASSIC_BUNDLE.contentVersion).toBe("1.0.0");
    expect(CLASSIC_BUNDLE.hash).toBe(canonicalHashBundle(CLASSIC_BUNDLE));
    expect(validateBundle(CLASSIC_BUNDLE, { production: true })).toEqual({
      valid: true,
      issues: [],
    });
    expect(BUNDLES["1.0.0"]).toBe(CLASSIC_BUNDLE);
    expect(getBundle("1.0.0", { production: true })).toBe(CLASSIC_BUNDLE);
    expect(Object.isFrozen(CLASSIC_BUNDLE)).toBe(true);
    expect(Object.isFrozen(CLASSIC_BUNDLE.spaces)).toBe(true);
  });

  it.each([
    [
      "route topology",
      (bundle: Mutable<ContentBundle>) => (bundle.spaces[0].next = "missing"),
      "MISSING_ROUTE_TARGET",
    ],
    [
      "deed value",
      (bundle: Mutable<ContentBundle>) => (bundle.deeds[0].price = -1),
      "NON_INTEGER_MONEY",
    ],
    [
      "district membership",
      (bundle: Mutable<ContentBundle>) => bundle.districts[0].deedIds.push("missing"),
      "MISSING_DISTRICT_DEED",
    ],
    [
      "deck effect",
      (bundle: Mutable<ContentBundle>) =>
        (bundle.decks[0].cards[0].effects = [{ type: "Teleport" } as never]),
      "UNREPRESENTABLE_EFFECT",
    ],
    [
      "economy",
      (bundle: Mutable<ContentBundle>) => (bundle.economy.startingCash = 1.5),
      "NON_INTEGER_MONEY",
    ],
    [
      "recorded hash",
      (bundle: Mutable<ContentBundle>) => (bundle.hash = "corrupt"),
      "BUNDLE_HASH_MISMATCH",
    ],
  ] as const)("rejects corrupted %s data", (_label, mutate, issueCode) => {
    const bundle = copyBundle();
    mutate(bundle);
    expect(validateBundle(bundle)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: issueCode })]),
      }),
    );
  });
});
