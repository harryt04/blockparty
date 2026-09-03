/**
 * The action surface. See UX-013 and UX-030.
 *
 * A disabled control stays VISIBLE with its reason ("Waiting for Maya",
 * "Need 40 more credits", "Reconnect to act"). It is never hidden.
 * `legalActions` renders enabled; `actionAvailability` renders disabled with
 * the reason. A client-side check is never authority. See PRD-FUN-009.
 *
 * On mobile this is a fixed bottom bar that opens a modal bottom sheet for the
 * decision itself. The sheet must not cover its invoker without a way to close.
 */
import type { ActionAvailability, LegalAction } from "@blockparty/contracts";
import { Button } from "@/components/ui/button";

/** Verb + object labels. Never a vague "Confirm". DS-030. */
const ACTION_LABELS: Partial<Record<LegalAction["type"], string>> = {
  RollDice: "Roll and advance",
  AcquireDeed: "Acquire this Address",
  DeclineAcquisition: "Decline and open the auction",
  EndTurn: "End turn",
  PlaceAuctionBid: "Place bid",
  PassAuction: "Pass on this auction",
  PayObligation: "Pay what is Owed",
  MortgageDeed: "Mortgage this Address",
  RedeemMortgage: "Buy Back this Address",
  BuyImprovement: "Buy a Stall",
  SellImprovement: "Sell a Stall",
  ProposeTrade: "Propose a trade",
  DeclareBankruptcy: "Declare Packed Up",
  StartGame: "Start the game",
  EndNoContest: "End game without a result",
};

const label = (type: LegalAction["type"]) => ACTION_LABELS[type] ?? type;

export function ActionBar({
  legalActions,
  actionAvailability,
  statusText,
}: {
  legalActions: readonly LegalAction[];
  actionAvailability: readonly ActionAvailability[];
  statusText?: string;
}) {
  return (
    <section
      aria-label="Your actions"
      className="sticky bottom-0 border-t border-line bg-surface px-4 py-3"
    >
      {statusText !== undefined ? (
        <p role="status" aria-live="polite" className="mb-2 text-sm text-muted-ink">
          {statusText}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {legalActions.map((action) => (
          <Button key={action.type} variant="primary">
            {label(action.type)}
          </Button>
        ))}

        {actionAvailability.map((blocked) => (
          <span key={blocked.type} className="inline-flex flex-col gap-1">
            <Button disabled aria-describedby={`reason-${blocked.type}`}>
              {label(blocked.type)}
            </Button>
            <span id={`reason-${blocked.type}`} className="text-xs text-muted-ink">
              {blocked.reason}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
