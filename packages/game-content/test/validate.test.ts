import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "../src/bundles/placeholder";
import type { ContentBundle } from "../src/types";
import { validateBundle } from "../src/validate";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

const copyBundle = (): Mutable<ContentBundle> => structuredClone(PLACEHOLDER_BUNDLE);

const expectIssue = (bundle: ContentBundle, code: string, id: string) => {
  const result = validateBundle(bundle);
  expect(result.valid).toBe(false);
  expect(result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        message: expect.stringContaining(id),
      }),
    ]),
  );
};

describe("validateBundle", () => {
  it("accepts the structurally valid placeholder only outside production", () => {
    expect(validateBundle(PLACEHOLDER_BUNDLE)).toEqual({ valid: true, issues: [] });

    const production = validateBundle(PLACEHOLDER_BUNDLE, { production: true });
    expect(production.valid).toBe(false);
    expect(production.issues).toContainEqual(
      expect.objectContaining({ code: "PLACEHOLDER_IN_PRODUCTION" }),
    );
  });

  it.each([
    [
      "duplicate IDs",
      (bundle: Mutable<ContentBundle>) => bundle.spaces.push({ ...bundle.spaces[0] }),
      "DUPLICATE_SPACE_ID",
      "s00",
    ],
    [
      "missing route targets",
      (bundle: Mutable<ContentBundle>) => (bundle.spaces[0].next = "missing-space"),
      "MISSING_ROUTE_TARGET",
      "s00",
    ],
    [
      "invalid district membership",
      (bundle: Mutable<ContentBundle>) => (bundle.deeds[0].districtId = "missing-district"),
      "INVALID_DISTRICT",
      "d-sawhorse-lane",
    ],
    [
      "negative money",
      (bundle: Mutable<ContentBundle>) => (bundle.deeds[0].price = -1),
      "NON_INTEGER_MONEY",
      "d-sawhorse-lane",
    ],
    [
      "non-integer money",
      (bundle: Mutable<ContentBundle>) => (bundle.economy.startPayment = 1.5),
      "NON_INTEGER_MONEY",
      "economy",
    ],
    [
      "incomplete rent levels",
      (bundle: Mutable<ContentBundle>) =>
        (bundle.deeds[0].improvementLevels = [
          bundle.deeds[0].improvementLevels![0],
          bundle.deeds[0].improvementLevels![2],
        ]),
      "INCOMPLETE_RENT_LEVELS",
      "d-sawhorse-lane",
    ],
    [
      "impossible inventory",
      (bundle: Mutable<ContentBundle>) =>
        (bundle.economy.improvementInventory = { stall: 0, stage: 0 }),
      "IMPOSSIBLE_INVENTORY",
      "economy.improvementInventory",
    ],
    [
      "unrepresentable effects",
      (bundle: Mutable<ContentBundle>) =>
        (bundle.spaces[0].effects = [{ type: "Teleport" } as never]),
      "UNREPRESENTABLE_EFFECT",
      "s00",
    ],
    [
      "invalid card targets",
      (bundle: Mutable<ContentBundle>) =>
        (bundle.decks[0].cards[0].effects = [
          { type: "MoveTo", spaceId: "missing-space", collectStartWhenCrossed: true },
        ]),
      "INVALID_CARD_TARGET",
      "c-flyer-01",
    ],
    [
      "variant schema bounds",
      (bundle: Mutable<ContentBundle>) => (bundle.variantSchemaVersion = "2.0.0"),
      "VARIANT_OUT_OF_BOUNDS",
      "2.0.0",
    ],
    [
      "starting asset bounds",
      (bundle: Mutable<ContentBundle>) => (bundle.economy.startingAssetDealCount = 10),
      "VARIANT_OUT_OF_BOUNDS",
      "economy.startingAssetDealCount",
    ],
  ] as const)("rejects %s and names the offending canonical ID", (_name, mutate, code, id) => {
    const bundle = copyBundle();
    mutate(bundle);
    expectIssue(bundle, code, id);
  });
});
