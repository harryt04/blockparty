import { describe, expect, it } from "vitest";
import { VARIANT_KEYS } from "@blockparty/contracts";
import {
  createRequestFromForm,
  invitePathFromInput,
} from "../src/components/entry/create-form-model";

function validForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("name", "  Friday night  ");
  form.set("hostName", "Host");
  form.set("hostToken", "piece-lantern");
  form.set("humanSeatCount", "3");
  form.set("botSeatCount", "1");
  form.set("preset", "standard");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("create form request mapping", () => {
  it("normalizes the optional name and creates a complete standard request", () => {
    const result = createRequestFromForm(validForm());

    expect(result).toEqual({
      ok: true,
      request: {
        name: "Friday night",
        humanSeatCount: 3,
        botSeatCount: 1,
        hostName: "Host",
        hostToken: { colorIndex: 1, pieceId: "piece-lantern", pattern: "solid" },
        preset: "standard",
        configuration: {
          schemaVersion: "1.0.0",
          preset: "standard",
          restSpaceJackpot: false,
          doubleStartOnExactLanding: false,
          noAuctionAfterDeclinedAcquisition: false,
          noIncomeWhileDetained: false,
          bonusForMatchingOnes: false,
          startingAssetsDealt: false,
          relaxedEvenBuilding: false,
          unlimitedImprovementInventory: false,
        },
      },
    });
  });

  it("keeps the named short-game preset when its defaults are unchanged", () => {
    const form = validForm({ preset: "short-game" });
    form.set("startingAssetsDealt", "on");
    form.set("relaxedEvenBuilding", "on");
    const result = createRequestFromForm(form);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.preset).toBe("short-game");
      expect(result.request.configuration.startingAssetsDealt).toBe(true);
      expect(result.request.configuration.relaxedEvenBuilding).toBe(true);
    }
  });

  it("records changed preset options as custom while retaining all eight toggles", () => {
    const form = validForm({ preset: "standard" });
    form.set("startingAssetsDealt", "on");
    const result = createRequestFromForm(form);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.preset).toBe("custom");
      expect(result.request.configuration.startingAssetsDealt).toBe(true);
      expect(Object.keys(result.request.configuration)).toHaveLength(VARIANT_KEYS.length + 2);
    }
  });

  it("reports player and bot boundary errors before making a request", () => {
    const result = createRequestFromForm(validForm({ humanSeatCount: "1", botSeatCount: "0" }));

    expect(result).toEqual({
      ok: false,
      errors: {
        botSeatCount: "Choose between 2 and 6 total players.",
      },
    });
  });
});

describe("landing invite navigation", () => {
  it("extracts only an opaque invite admission path", () => {
    const inviteId = "a".repeat(32);

    expect(invitePathFromInput(`/join/${inviteId}`)).toBe(`/join/${inviteId}`);
    expect(invitePathFromInput(`https://play.example/join/${inviteId}`)).toBe(`/join/${inviteId}`);
    expect(invitePathFromInput(`/join/${inviteId}?seatCapability=secret`)).toBeUndefined();
    expect(invitePathFromInput("https://play.example/game/not-an-invite")).toBeUndefined();
  });
});
