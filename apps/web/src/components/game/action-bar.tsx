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
import type {
  ActionAvailability,
  GameSnapshotProjection,
  LegalAction,
} from "@blockparty/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AcquisitionAuctionSummary } from "./acquisition-auction-summary";
import { MANAGEMENT_ACTION_TYPES } from "./game-model";

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

export const actionLabel = (type: LegalAction["type"]) => ACTION_LABELS[type] ?? type;

function actionKey(action: LegalAction): string {
  return `${action.type}:${JSON.stringify(action.constraints ?? {})}`;
}

function constraintText(action: LegalAction): string | undefined {
  const constraints = action.constraints;
  if (constraints === undefined) return undefined;
  const minimum = constraints.minBid;
  const maximum = constraints.maxBid;
  if (typeof minimum === "number" && typeof maximum === "number") {
    return `Server range: ${minimum.toLocaleString()}–${maximum.toLocaleString()} Tabs.`;
  }
  return undefined;
}

function ActionOptions({
  legalActions,
  actionAvailability,
  disabled,
  onAction,
}: {
  legalActions: readonly LegalAction[];
  actionAvailability: readonly ActionAvailability[];
  disabled: boolean;
  onAction: (action: LegalAction, amount?: number) => void;
}) {
  const managementActionTypes = new Set<LegalAction["type"]>(MANAGEMENT_ACTION_TYPES);
  const visibleLegalActions = legalActions.filter(
    (action) => !managementActionTypes.has(action.type),
  );
  const visibleAvailability = actionAvailability.filter(
    (action) => !managementActionTypes.has(action.type),
  );
  const [bidAmount, setBidAmount] = useState<string>();
  const [bidError, setBidError] = useState<string>();
  const bidAction = visibleLegalActions.find((action) => action.type === "PlaceAuctionBid");
  const bidMinimum = bidAction?.constraints?.minBid;
  const bidMaximum = bidAction?.constraints?.maxBid;

  useEffect(() => {
    setBidAmount(typeof bidMinimum === "number" ? String(bidMinimum) : undefined);
    setBidError(undefined);
  }, [bidMinimum, bidMaximum]);

  function submitBid() {
    if (bidAction === undefined) return;
    const amount = Number(bidAmount);
    if (
      !Number.isInteger(amount) ||
      typeof bidMinimum !== "number" ||
      typeof bidMaximum !== "number" ||
      amount < bidMinimum ||
      amount > bidMaximum
    ) {
      setBidError("Enter a whole-number bid within the server-provided range.");
      return;
    }
    setBidError(undefined);
    onAction(bidAction, amount);
  }

  return (
    <div className="flex flex-col gap-3">
      {visibleLegalActions.length === 0 && visibleAvailability.length === 0 ? (
        <p className="text-sm text-muted-ink">No action is required from you right now.</p>
      ) : null}
      {visibleLegalActions.map((action) => {
        if (action.type === "PlaceAuctionBid") {
          return (
            <div key={actionKey(action)} className="rounded-(--radius-md) border border-line p-3">
              <label htmlFor="auction-bid" className="font-medium">
                {actionLabel(action.type)}
              </label>
              <p className="mt-1 text-sm text-muted-ink">{constraintText(action)}</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  id="auction-bid"
                  className="min-h-11 w-36 rounded-(--radius-md) border border-line bg-surface px-3 tabular"
                  type="number"
                  inputMode="numeric"
                  min={typeof bidMinimum === "number" ? bidMinimum : undefined}
                  max={typeof bidMaximum === "number" ? bidMaximum : undefined}
                  step="1"
                  value={bidAmount ?? ""}
                  onChange={(event) => setBidAmount(event.target.value)}
                  disabled={disabled}
                  aria-describedby={bidError === undefined ? undefined : "auction-bid-error"}
                />
                <Button onClick={submitBid} disabled={disabled}>
                  Submit bid
                </Button>
              </div>
              {bidError === undefined ? null : (
                <p id="auction-bid-error" className="mt-2 text-sm text-danger" role="alert">
                  {bidError}
                </p>
              )}
            </div>
          );
        }
        return (
          <Button
            key={actionKey(action)}
            variant={action.type === "EndNoContest" ? "destructive" : "primary"}
            onClick={() => onAction(action)}
            disabled={disabled}
          >
            {actionLabel(action.type)}
          </Button>
        );
      })}
      {visibleAvailability.map((blocked) => (
        <div key={blocked.type} className="flex flex-col gap-1">
          <Button disabled aria-describedby={`reason-${blocked.type}`}>
            {actionLabel(blocked.type)}
          </Button>
          <span id={`reason-${blocked.type}`} className="text-sm text-muted-ink">
            {blocked.reason}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ActionBar({
  legalActions,
  actionAvailability,
  decisionSnapshot,
  statusText,
  pending = false,
  disabled = false,
  onAction,
}: {
  legalActions: readonly LegalAction[];
  actionAvailability: readonly ActionAvailability[];
  decisionSnapshot?: GameSnapshotProjection;
  statusText?: string;
  pending?: boolean;
  disabled?: boolean;
  onAction?: (action: LegalAction, amount?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const invokerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submit = onAction ?? (() => undefined);

  useEffect(() => {
    if (!open) {
      invokerRef.current?.focus();
      return undefined;
    }
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <section
      aria-label="Your actions"
      aria-busy={pending}
      className="sticky bottom-0 z-10 border-t border-line bg-surface px-4 py-3"
    >
      {statusText !== undefined ? (
        <p role="status" aria-live="polite" className="mb-2 text-sm text-muted-ink">
          {statusText}
        </p>
      ) : null}

      <Button
        ref={invokerRef}
        variant="primary"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls="game-action-sheet"
      >
        {pending ? "Submitting action…" : "Open action sheet"}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-20 flex items-end bg-ink/40 p-0 sm:items-center sm:justify-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            id="game-action-sheet"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-action-sheet-title"
            className="max-h-[min(90dvh,42rem)] w-full overflow-y-auto rounded-t-(--radius-lg) border border-line bg-surface-raised p-4 shadow-xl sm:max-w-lg sm:rounded-(--radius-lg)"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="game-action-sheet-title" className="font-serif text-2xl">
                  Your actions
                </h2>
                <p className="mt-1 text-sm text-muted-ink">
                  These controls come from the current server state.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <div className="mt-4">
              {decisionSnapshot === undefined ? null : (
                <AcquisitionAuctionSummary snapshot={decisionSnapshot} compact />
              )}
              <div className={decisionSnapshot === undefined ? undefined : "mt-4"}>
                <ActionOptions
                  legalActions={legalActions}
                  actionAvailability={actionAvailability}
                  disabled={disabled || pending}
                  onAction={(action, amount) => {
                    submit(action, amount);
                    setOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
