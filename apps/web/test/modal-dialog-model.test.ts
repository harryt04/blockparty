import { describe, expect, it } from "vitest";
import {
  escapeDismisses,
  FOCUSABLE_SELECTOR,
  wrappedTabIndex,
} from "../src/components/ui/modal-dialog-model";

describe("modal dialog keyboard contract", () => {
  it("keeps tab movement inside the dialog at both boundaries", () => {
    expect(wrappedTabIndex(0, 3, true)).toBe(2);
    expect(wrappedTabIndex(2, 3, false)).toBe(0);
    expect(wrappedTabIndex(1, 3, true)).toBeUndefined();
    expect(wrappedTabIndex(1, 3, false)).toBeUndefined();
    expect(wrappedTabIndex(-1, 0, false)).toBeUndefined();
  });

  it("only lets dismissible surfaces consume Escape", () => {
    expect(escapeDismisses(true, "Escape")).toBe(true);
    expect(escapeDismisses(false, "Escape")).toBe(false);
    expect(escapeDismisses(true, "Enter")).toBe(false);
    expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
  });
});
