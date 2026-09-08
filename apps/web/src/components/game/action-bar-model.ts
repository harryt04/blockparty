import type {
  ActionAvailability,
  GameSnapshotProjection,
  LegalAction,
} from "@blockparty/contracts";

export type BlockingDecisionKind = "acquisition" | "auction" | "detention" | "debt" | "trade";

/**
 * Resolve the one blocking decision that should own the foreground surface.
 * This is presentation-only; the server's legalActions remain authoritative.
 */
export function blockingDecisionKind(
  snapshot: Pick<GameSnapshotProjection, "phase" | "obligation" | "pendingTrade" | "seats">,
): BlockingDecisionKind | undefined {
  if (snapshot.pendingTrade !== undefined) return "trade";
  if (snapshot.obligation !== undefined) return "debt";
  if (
    snapshot.phase === "AwaitChoice" &&
    snapshot.seats.some((seat) => seat.isSelf && seat.detained)
  ) {
    return "detention";
  }
  if (snapshot.phase === "AwaitPurchase") return "acquisition";
  if (snapshot.phase === "AwaitAuction") return "auction";
  return undefined;
}

const BLOCKING_ACTIONS: Record<BlockingDecisionKind, readonly LegalAction["type"][]> = {
  acquisition: ["AcquireDeed", "DeclineAcquisition"],
  auction: ["PlaceAuctionBid", "PassAuction"],
  detention: ["ChoosePendingOption"],
  debt: ["PayObligation", "DeclareBankruptcy", "MortgageDeed", "SellImprovement", "ProposeTrade"],
  trade: ["AcceptTrade", "RejectTrade", "CancelTrade"],
};

export function isBlockingDecisionAction(
  action: LegalAction | ActionAvailability,
  kind: BlockingDecisionKind,
): boolean {
  return BLOCKING_ACTIONS[kind].includes(action.type);
}

/** A new acquisition or auction belongs in the foreground action sheet. */
export function shouldAutoOpenBlockingDecision(
  kind: BlockingDecisionKind | undefined,
  actions: readonly (LegalAction | ActionAvailability)[],
): boolean {
  return (
    (kind === "acquisition" || kind === "auction") &&
    actions.some((action) => isBlockingDecisionAction(action, kind))
  );
}

export function blockingDecisionKey(
  snapshot: Pick<
    GameSnapshotProjection,
    "phase" | "obligation" | "pendingTrade" | "seats" | "legalActions" | "actionAvailability"
  >,
): string {
  const kind = blockingDecisionKind(snapshot);
  if (kind === undefined) return "none";
  const actionSignature = [...snapshot.legalActions, ...snapshot.actionAvailability]
    .filter((action) => isBlockingDecisionAction(action, kind))
    .map(
      (action) =>
        `${action.type}:` +
        ("reasonCode" in action
          ? `blocked:${action.reasonCode}:${action.reason}`
          : JSON.stringify(action.constraints ?? {})),
    )
    .join("|");
  return `${kind}:${actionSignature}`;
}

export function actionRenderKey(
  action: LegalAction | ActionAvailability,
  group: "legal" | "blocked",
  index: number,
): string {
  const constraints = "constraints" in action ? action.constraints : undefined;
  const reasonCode = "reasonCode" in action ? action.reasonCode : undefined;
  return `${group}:${action.type}:${JSON.stringify(constraints ?? {})}:${reasonCode ?? ""}:${index}`;
}
