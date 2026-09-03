/**
 * Rule presets and the exactly-eight MVP toggles.
 * See docs/product/rule-variants.md. Content cannot add a ninth toggle.
 */
import { z } from "zod";

export const VARIANT_SCHEMA_VERSION = "1.0.0" as const;

export const RulesPreset = z.enum(["standard", "short-game", "custom"]);
export type RulesPreset = z.infer<typeof RulesPreset>;

/**
 * The eight toggles, in VAR-001 through VAR-008 order.
 * Adding a key here is a schema change, not a feature flag.
 */
export const VARIANT_KEYS = [
  "restSpaceJackpot",
  "doubleStartOnExactLanding",
  "noAuctionAfterDeclinedAcquisition",
  "noIncomeWhileDetained",
  "bonusForMatchingOnes",
  "startingAssetsDealt",
  "relaxedEvenBuilding",
  "unlimitedImprovementInventory",
] as const;

export type VariantKey = (typeof VARIANT_KEYS)[number];

/**
 * A resolved configuration. `.strict()` enforces VAR-009: unknown keys,
 * missing keys, and non-booleans are rejected before start.
 */
export const RulesConfiguration = z
  .object({
    schemaVersion: z.literal(VARIANT_SCHEMA_VERSION),
    preset: RulesPreset,
    restSpaceJackpot: z.boolean(),
    doubleStartOnExactLanding: z.boolean(),
    noAuctionAfterDeclinedAcquisition: z.boolean(),
    noIncomeWhileDetained: z.boolean(),
    bonusForMatchingOnes: z.boolean(),
    startingAssetsDealt: z.boolean(),
    relaxedEvenBuilding: z.boolean(),
    unlimitedImprovementInventory: z.boolean(),
  })
  .strict();
export type RulesConfiguration = z.infer<typeof RulesConfiguration>;

/** All eight toggles false. See the `standard` preset row in VAR. */
export const STANDARD_CONFIGURATION: RulesConfiguration = {
  schemaVersion: VARIANT_SCHEMA_VERSION,
  preset: "standard",
  restSpaceJackpot: false,
  doubleStartOnExactLanding: false,
  noAuctionAfterDeclinedAcquisition: false,
  noIncomeWhileDetained: false,
  bonusForMatchingOnes: false,
  startingAssetsDealt: false,
  relaxedEvenBuilding: false,
  unlimitedImprovementInventory: false,
};

/** startingAssetsDealt and relaxedEvenBuilding true; the rest false. */
export const SHORT_GAME_CONFIGURATION: RulesConfiguration = {
  ...STANDARD_CONFIGURATION,
  preset: "short-game",
  startingAssetsDealt: true,
  relaxedEvenBuilding: true,
};

export const PRESET_CONFIGURATIONS = {
  standard: STANDARD_CONFIGURATION,
  "short-game": SHORT_GAME_CONFIGURATION,
} as const;
