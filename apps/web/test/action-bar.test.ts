import { describe, expect, it } from "vitest";
import type { ActionAvailability, LegalAction } from "@blockparty/contracts";
import { actionRenderKey } from "../src/components/game/action-bar-model";

describe("action bar render keys", () => {
  it("keeps repeated blocked actions distinct from each other and legal actions", () => {
    // Regression: LIVE-ACTION-KEY-001 — repeated blocked actions emitted duplicate React keys.
    // Found by /qa on 2026-09-04
    // Report: memory/2026-09-04-npm-run-dev-debug.md
    const blocked: ActionAvailability = {
      type: "RequestScarceImprovement",
      available: false,
      reasonCode: "DEED_NOT_OWNED",
      reason: "This seat does not own that deed.",
    };
    const legal: LegalAction = {
      type: "RequestScarceImprovement",
      constraints: { deedId: "d-sawhorse-lane" },
    };

    const blockedKeys = [0, 1, 2].map((index) => actionRenderKey(blocked, "blocked", index));
    expect(new Set(blockedKeys).size).toBe(blockedKeys.length);
    expect(actionRenderKey(legal, "legal", 0)).not.toBe(blockedKeys[0]);
  });
});
