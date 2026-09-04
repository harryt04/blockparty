import { describe, expect, it } from "vitest";
import {
  migrateRulesConfiguration,
  RulesConfiguration,
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
} from "../src/variants";

describe("rule configuration contract", () => {
  it("accepts the two supported presets and exactly eight boolean toggles", () => {
    expect(RulesConfiguration.safeParse(STANDARD_CONFIGURATION).success).toBe(true);
    expect(RulesConfiguration.safeParse(SHORT_GAME_CONFIGURATION).success).toBe(true);
    expect(VARIANT_KEYS).toHaveLength(8);
    expect(Object.keys(STANDARD_CONFIGURATION)).toHaveLength(10);
  });

  it.each([
    [
      "missing toggle",
      (() => {
        const value = { ...STANDARD_CONFIGURATION };
        delete (value as Partial<typeof value>).restSpaceJackpot;
        return value;
      })(),
    ],
    ["unknown key", { ...STANDARD_CONFIGURATION, futureToggle: true }],
    ["non-boolean toggle", { ...STANDARD_CONFIGURATION, restSpaceJackpot: "true" }],
    ["unsupported schema", { ...STANDARD_CONFIGURATION, schemaVersion: "2.0.0" }],
    ["inconsistent standard preset", { ...STANDARD_CONFIGURATION, restSpaceJackpot: true }],
    ["inconsistent short-game preset", { ...SHORT_GAME_CONFIGURATION, relaxedEvenBuilding: false }],
  ])("rejects %s", (_label, value) => {
    expect(RulesConfiguration.safeParse(value).success).toBe(false);
  });

  it("allows a deliberate custom configuration", () => {
    expect(
      RulesConfiguration.safeParse({
        ...STANDARD_CONFIGURATION,
        preset: "custom",
        restSpaceJackpot: true,
      }).success,
    ).toBe(true);
  });

  it("migrates every supported archived fixture deterministically", () => {
    const fixtures = [
      STANDARD_CONFIGURATION,
      SHORT_GAME_CONFIGURATION,
      { ...STANDARD_CONFIGURATION, preset: "custom" as const, bonusForMatchingOnes: true },
    ];

    for (const fixture of fixtures) {
      expect(migrateRulesConfiguration(fixture)).toEqual(fixture);
      expect(migrateRulesConfiguration(JSON.parse(JSON.stringify(fixture)))).toEqual(fixture);
    }
  });
});
