import { describe, expect, it } from "vitest";
import { selectedSpaceAfterActiveChange } from "../src/components/game/game-model";

describe("board selection after authoritative movement", () => {
  it("moves the active detail to the newly reached space", () => {
    // Regression: ISSUE-001 — active-space detail stayed on an inspected stop after movement.
    // Found by /qa on 2026-09-04
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-04.md
    expect(selectedSpaceAfterActiveChange("s05", "s07", "s05")).toBe("s07");
  });

  it("keeps an intentional inspection while the active space is unchanged", () => {
    expect(selectedSpaceAfterActiveChange("s07", "s07", "s05")).toBe("s05");
  });
});
