import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "../src/bundles/placeholder";
import { validateBundle } from "../src/validate";

describe("validateBundle", () => {
  it("accepts the structurally valid placeholder only outside production", () => {
    expect(validateBundle(PLACEHOLDER_BUNDLE)).toEqual({ valid: true, issues: [] });

    const production = validateBundle(PLACEHOLDER_BUNDLE, { production: true });
    expect(production.valid).toBe(false);
    expect(production.issues).toContainEqual(
      expect.objectContaining({ code: "PLACEHOLDER_IN_PRODUCTION" }),
    );
  });
});
