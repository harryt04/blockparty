import { describe, expect, it } from "vitest";
import type { LegalAction } from "@blockparty/contracts";
import { actionRenderKey } from "../src/components/game/action-bar-model";

describe("detention decision render keys", () => {
  it("keeps multiple pending-option routes distinct", () => {
    // Regression: LIVE-ACTION-KEY-002 — detention routes shared the ChoosePendingOption key.
    // Found by /qa on 2026-09-06
    // Report: .gstack/qa-reports/qa-report-localhost-3200-2026-09-06.md
    const routes: LegalAction[] = [
      {
        type: "ChoosePendingOption",
        constraints: { choiceId: "detention", optionId: "attempt-roll" },
      },
      {
        type: "ChoosePendingOption",
        constraints: { choiceId: "detention", optionId: "pay-release-fee" },
      },
    ];

    const keys = routes.map((route, index) => actionRenderKey(route, "legal", index));

    expect(new Set(keys).size).toBe(routes.length);
  });
});
