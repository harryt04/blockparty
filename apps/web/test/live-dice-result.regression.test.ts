import { describe, expect, it } from "vitest";
import type { GameSnapshotProjection } from "@blockparty/contracts";
import { latestDiceResult } from "../src/components/game/game-model";

describe("live dice result", () => {
  it("reads the canonical engine dice payload", () => {
    // Regression: LIVE-DICE-RESULT-001 — live rolls used `dice`, but the UI only read legacy fields.
    // Found by /qa on 2026-09-04
    // Report: memory/2026-09-04-npm-run-dev-debug.md
    const snapshot = {
      publicEvents: [
        {
          type: "DiceRolled",
          sequence: 9,
          payload: { dice: [4, 4] },
        },
      ],
    } as unknown as GameSnapshotProjection;

    expect(latestDiceResult(snapshot)).toEqual({ first: 4, second: 4 });
  });
});
