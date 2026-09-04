import { describe, expect, it } from "vitest";
import { actionLabel, MANAGEMENT_ACTION_TYPES } from "../src/components/game/game-model";

describe("scarce improvement action presentation", () => {
  it("keeps the request in the management surface with a display label", () => {
    // Regression: ISSUE-002 — the action sheet exposed the raw RequestScarceImprovement wire type.
    // Found by /qa on 2026-09-04
    // Report: .gstack/qa-reports/qa-report-localhost-2026-09-04.md
    expect(MANAGEMENT_ACTION_TYPES).toContain("RequestScarceImprovement");
    expect(actionLabel("RequestScarceImprovement")).toBe("Request a Stall");
  });
});
