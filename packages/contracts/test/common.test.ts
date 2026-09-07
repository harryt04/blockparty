import { describe, expect, it } from "vitest";
import { CapturedVersions, createDisplayNameSchema, DisplayName, Money } from "../src/common";
import { Command } from "../src/commands";

describe("wire primitives", () => {
  it("accepts integer money and rejects floating-point money", () => {
    expect(Money.parse(125)).toBe(125);
    expect(Money.safeParse(1.25).success).toBe(false);
  });

  it("rejects unknown captured-version fields", () => {
    const result = CapturedVersions.safeParse({
      contentVersion: "1.0.0",
      rulesSchemaVersion: "1.0.0",
      variantSchemaVersion: "1.0.0",
      stateSchemaVersion: "1.0.0",
      engineVersion: "1.0.0",
      displayName: "presentation-does-not-belong-on-the-wire",
    });

    expect(result.success).toBe(false);
  });

  it("normalizes pseudonyms and counts Unicode grapheme clusters", () => {
    expect(DisplayName.parse("  👩‍💻   Rivera ")).toBe("👩‍💻 Rivera");
    expect(DisplayName.safeParse("👩‍💻".repeat(24)).success).toBe(true);
    expect(DisplayName.safeParse("👩‍💻".repeat(25)).success).toBe(false);
    expect(DisplayName.safeParse("a".repeat(25)).success).toBe(false);
    expect(DisplayName.safeParse("\u202Ename").success).toBe(false);
    expect(DisplayName.safeParse("admin").success).toBe(false);
  });

  it("supports a deployment-specific pseudonym denylist", () => {
    const schema = createDisplayNameSchema(["Reserved House"]);

    expect(schema.parse("  Friendly   House ")).toBe("Friendly House");
    expect(schema.safeParse("reserved house").success).toBe(false);
  });

  it("accepts production-shaped trade IDs across the command boundary", () => {
    const tradeId =
      "trade:8e44406b-f54d-4cb4-b33d-f9065de8943d:269:" +
      "b1a2c3d4-e5f6-4789-abcd-0123456789ab:" +
      "c1a2c3d4-e5f6-4789-abcd-0123456789ab";

    expect(Command.parse({ type: "CancelTrade", tradeId })).toEqual({
      type: "CancelTrade",
      tradeId,
    });
    expect(Command.parse({ type: "AcceptTrade", tradeId })).toEqual({
      type: "AcceptTrade",
      tradeId,
    });
    expect(Command.parse({ type: "RejectTrade", tradeId })).toEqual({
      type: "RejectTrade",
      tradeId,
    });
  });
});
