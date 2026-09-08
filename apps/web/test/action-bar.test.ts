import { describe, expect, it } from "vitest";
import type {
  ActionAvailability,
  GameSnapshotProjection,
  LegalAction,
} from "@blockparty/contracts";
import {
  actionRenderKey,
  blockingDecisionKey,
  blockingDecisionKind,
  isBlockingDecisionAction,
  shouldAutoOpenBlockingDecision,
} from "../src/components/game/action-bar-model";

const decisionSnapshot = (
  overrides: Partial<
    Pick<
      GameSnapshotProjection,
      "phase" | "obligation" | "pendingTrade" | "seats" | "legalActions" | "actionAvailability"
    >
  > = {},
) =>
  ({
    phase: "AwaitRoll",
    obligation: undefined,
    pendingTrade: undefined,
    seats: [{ isSelf: true, detained: false }],
    legalActions: [],
    actionAvailability: [],
    ...overrides,
  }) as unknown as Pick<
    GameSnapshotProjection,
    "phase" | "obligation" | "pendingTrade" | "seats" | "legalActions" | "actionAvailability"
  >;

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

  it("classifies one foreground decision and scopes acquisition controls", () => {
    const snapshot = decisionSnapshot({
      phase: "AwaitPurchase",
      legalActions: [
        { type: "AcquireDeed", constraints: { deedId: "d-1" } },
        { type: "DeclineAcquisition", constraints: { deedId: "d-1" } },
        { type: "EndTurn" },
      ],
    });

    expect(blockingDecisionKind(snapshot)).toBe("acquisition");
    expect(
      snapshot.legalActions.filter((action) => isBlockingDecisionAction(action, "acquisition")),
    ).toHaveLength(2);
    expect(shouldAutoOpenBlockingDecision("acquisition", snapshot.legalActions)).toBe(true);
  });

  it("keeps debt and trade as distinct blocking decisions", () => {
    const debt = decisionSnapshot({
      obligation: {
        debtorSeatId: "seat-a",
        amount: 5,
        reasonCode: "RENT",
        reason: "Rent",
      },
    });
    const trade = decisionSnapshot({
      pendingTrade: {
        tradeId: "trade-1",
        proposerSeatId: "seat-a",
        counterpartySeatId: "seat-b",
        offered: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 10,
        counterpartyBalance: 10,
        aggregateVersion: 1,
      },
    });

    expect(blockingDecisionKind(debt)).toBe("debt");
    expect(blockingDecisionKind(trade)).toBe("trade");
    expect(blockingDecisionKey(debt)).not.toBe(blockingDecisionKey(trade));
    expect(shouldAutoOpenBlockingDecision("trade", trade.legalActions)).toBe(false);
  });
});
