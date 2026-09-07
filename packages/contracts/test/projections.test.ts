import { describe, expect, it } from "vitest";
import { LegalAction } from "../src/projections";

describe("projection improvement transition detail", () => {
  it("accepts complete signed inventory maps on legal actions", () => {
    expect(
      LegalAction.parse({
        type: "BuyImprovement",
        constraints: { deedId: "deed-1" },
        inventoryDeltas: { house: 1, hotel: 0 },
      }),
    ).toMatchObject({ inventoryDeltas: { house: 1, hotel: 0 } });
  });

  it("rejects fractional maps and unknown legal-action fields", () => {
    expect(
      LegalAction.safeParse({
        type: "BuyImprovement",
        inventoryDeltas: { house: 0.5 },
      }).success,
    ).toBe(false);
    expect(
      LegalAction.safeParse({
        type: "BuyImprovement",
        inventoryDeltas: { house: 1 },
        leaked: true,
      }).success,
    ).toBe(false);
  });
});
