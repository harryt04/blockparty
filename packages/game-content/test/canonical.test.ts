import { describe, expect, it } from "vitest";
import {
  canonicalHashBundle,
  canonicalSerializeBundle,
  createBundleRegistry,
  getBundle,
  PLACEHOLDER_BUNDLE,
  type ContentBundle,
} from "../src/index";
import { validateBundle } from "../src/validate";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};

// Compatibility fixture: the content is intentionally still placeholder data,
// but its recorded version and hash exercise old-game lookup.
const ARCHIVED_V1_BUNDLE: ContentBundle = {
  ...PLACEHOLDER_BUNDLE,
  contentVersion: "1.0.0",
  hash: "6ae619bbccd076395b903ed27e1527c576a7f2ab01733b5455dce8d7eca858cf",
};

describe("canonical content identity", () => {
  it("matches the recorded canonical hash golden", () => {
    expect(canonicalHashBundle(PLACEHOLDER_BUNDLE)).toBe(
      "2ba58630b981f8b06a5062121bb45e8e27b2e529ade54b2fe62df8b7e14ac447",
    );
    expect(canonicalSerializeBundle(PLACEHOLDER_BUNDLE)).not.toContain(PLACEHOLDER_BUNDLE.hash);
    expect(validateBundle(PLACEHOLDER_BUNDLE)).toEqual({ valid: true, issues: [] });
  });

  it("keeps an archived v1.0.0 lookup distinct from the current default", () => {
    const registry = createBundleRegistry([ARCHIVED_V1_BUNDLE, PLACEHOLDER_BUNDLE]);

    expect(canonicalHashBundle(ARCHIVED_V1_BUNDLE)).toBe(ARCHIVED_V1_BUNDLE.hash);
    expect(getBundle("1.0.0", {}, registry)).toBe(ARCHIVED_V1_BUNDLE);
    expect(Object.isFrozen(ARCHIVED_V1_BUNDLE)).toBe(true);
    expect(Object.isFrozen(ARCHIVED_V1_BUNDLE.spaces)).toBe(true);
    expect(getBundle(PLACEHOLDER_BUNDLE.contentVersion, {}, registry)).toBe(PLACEHOLDER_BUNDLE);
    expect(getBundle("missing", {}, registry)).toBeUndefined();
  });

  it("rejects tampering and every placeholder bundle in production", () => {
    const tampered = structuredClone(PLACEHOLDER_BUNDLE) as Mutable<ContentBundle>;
    tampered.spaces[1].name = "tampered";
    expect(validateBundle(tampered)).toEqual(
      expect.objectContaining({
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: "BUNDLE_HASH_MISMATCH" })]),
      }),
    );

    expect(getBundle(PLACEHOLDER_BUNDLE.contentVersion, { production: true })).toBeUndefined();
    expect(
      getBundle("1.0.0", { production: true }, createBundleRegistry([ARCHIVED_V1_BUNDLE])),
    ).toBeUndefined();
    expect(validateBundle(PLACEHOLDER_BUNDLE, { production: true }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "PLACEHOLDER_IN_PRODUCTION" })]),
    );
  });
});
