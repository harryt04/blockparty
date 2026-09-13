import { describe, expect, it } from "vitest";
import { VARIANT_KEYS } from "@blockparty/contracts";
import {
  DISPLAY_TERM_GUIDE,
  INTERACTION_GUIDE,
  VARIANT_COPY,
  displayTermKey,
} from "../src/app/rules/rules-content";
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  PRESENTATION_PREFERENCES_KEY,
  parsePresentationPreferences,
  serializePresentationPreferences,
} from "../src/components/settings/presentation-preferences-model";

describe("presentation preferences", () => {
  it("round-trips only device presentation state", () => {
    const preferences = {
      ...DEFAULT_PRESENTATION_PREFERENCES,
      theme: "dark" as const,
      contrast: true,
      reducedMotion: true,
      sound: true,
      haptics: false,
      boardLabels: false,
    };

    expect(PRESENTATION_PREFERENCES_KEY).toBe("blockparty.presentation-preferences.v1");
    expect(parsePresentationPreferences(serializePresentationPreferences(preferences))).toEqual(
      preferences,
    );
  });

  it("rejects malformed or incomplete local data without changing defaults", () => {
    expect(parsePresentationPreferences(null)).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
    expect(parsePresentationPreferences("not-json")).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
    expect(
      parsePresentationPreferences(
        JSON.stringify({ ...DEFAULT_PRESENTATION_PREFERENCES, sound: "yes" }),
      ),
    ).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
  });
});

describe("rules and accessibility content", () => {
  it("documents each of the exactly eight variants with effect, warning, and interaction copy", () => {
    expect(Object.keys(VARIANT_COPY)).toEqual(VARIANT_KEYS);
    for (const key of VARIANT_KEYS) {
      expect(VARIANT_COPY[key].effect.length).toBeGreaterThan(20);
      expect(VARIANT_COPY[key].warning.length).toBeGreaterThan(10);
      expect(VARIANT_COPY[key].interaction.length).toBeGreaterThan(20);
    }
  });

  it("includes display terms and non-audio/non-motion equivalents", () => {
    expect(DISPLAY_TERM_GUIDE.map((term) => term.label)).toEqual(
      expect.arrayContaining(["Address", "Block", "Noise Complaint", "Sunup"]),
    );
    expect(INTERACTION_GUIDE.map((item) => item.heading)).toEqual(
      expect.arrayContaining(["Inspect the route", "Stay connected", "Resolve Owed"]),
    );
  });

  it("gives repeated display labels stable unique render keys", () => {
    const keys = DISPLAY_TERM_GUIDE.map((term, index) => displayTermKey(term.label, index));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
