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
  hash: "d60e4967890d22b8d2c3d835dbb7be935843b8ee3991076dad20697491513ad5",
};

describe("canonical content identity", () => {
  it("matches the recorded canonical hash golden", () => {
    expect(canonicalHashBundle(PLACEHOLDER_BUNDLE)).toBe(
      "4ff6b56b74c9d7ad7cd2687bb6b8faab1b96d9ed29b35a92df01af4f21488db7",
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
