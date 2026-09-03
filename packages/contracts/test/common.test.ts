import { describe, expect, it } from "vitest";
import { CapturedVersions, Money } from "../src/common";

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
});
