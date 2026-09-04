/**
 * Explicit blocking decisions for Noise Complaint and Owed states. The
 * server projection supplies the choices; this panel only explains and
 * submits advertised commands. See RULE-009, RULE-011, UX-015, and UX-017.
 */
import type { GameSnapshotProjection, LegalAction } from "@blockparty/contracts";
import { useState } from "react";
import { formatMoney } from "@/components/display-names";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { actionLabel } from "./action-bar";
import { detentionDecisionContext, obligationDecisionContext } from "./game-model";

function commandTarget(action: LegalAction): string {
  const deedId = action.constraints?.deedId;
  return typeof deedId === "string" ? deedId : action.type;
}

export function DetentionDebtPanel({
  snapshot,
  disabled = false,
  pending = false,
  onAction,
}: {
  snapshot: GameSnapshotProjection;
  disabled?: boolean;
  pending?: boolean;
  onAction: (action: LegalAction) => void;
}) {
  const detention = detentionDecisionContext(snapshot);
  const obligation = obligationDecisionContext(snapshot);
  const [confirmBankruptcy, setConfirmBankruptcy] = useState(false);
  if (detention === undefined && obligation === undefined) return null;

  const bankruptcyAction = snapshot.legalActions.find(
    (action) => action.type === "DeclareBankruptcy",
  );
  const payAction = snapshot.legalActions.find((action) => action.type === "PayObligation");
  const blockedBankruptcy = snapshot.actionAvailability.find(
    (action) => action.type === "DeclareBankruptcy",
  );

  return (
    <div className="space-y-4">
      {detention === undefined ? null : (
        <Card aria-labelledby="detention-decision-heading" className="border-brand/60">
          <CardHeader>
            <CardTitle id="detention-decision-heading">Noise Complaint: choose your exit</CardTitle>
            <p className="text-sm text-muted-ink">
              {detention.attempts} of {detention.maxAttempts} failed matching attempts used. There
              is no timer; choose an available route when your turn starts.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              After {detention.maxAttempts} failed attempts, the{" "}
              {formatMoney(detention.releaseFee, "Tabs")} release fee is required before the roll.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {detention.routes.map((route) => (
                <div
                  key={commandTarget(route.action)}
                  className="rounded-(--radius-md) border border-line p-3"
                >
                  <Button
                    className="w-full"
                    onClick={() => onAction(route.action)}
                    disabled={disabled || pending}
                  >
                    {route.label}
                  </Button>
                  <p className="mt-2 text-sm text-muted-ink">{route.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {obligation === undefined ? null : (
        <Card aria-labelledby="obligation-decision-heading" className="border-warning/70">
          <CardHeader>
            <CardTitle id="obligation-decision-heading">Owed: payment required</CardTitle>
            <p className="text-sm text-muted-ink">
              {obligation.viewerIsDebtor
                ? obligation.reason
                : `${obligation.debtorName} is resolving an Owed payment. Play waits for that seat.`}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-ink">Creditor</dt>
              <dd>{obligation.creditorName}</dd>
              <dt className="text-muted-ink">Amount due</dt>
              <dd>{formatMoney(obligation.amount, "Tabs")}</dd>
              <dt className="text-muted-ink">Your cash</dt>
              <dd>{formatMoney(obligation.balance, "Tabs")}</dd>
              <dt className="text-muted-ink">Still needed</dt>
              <dd>{formatMoney(obligation.shortfall, "Tabs")}</dd>
            </dl>
            {obligation.viewerIsDebtor ? (
              <p className="rounded-(--radius-md) border border-line bg-surface p-3 text-sm">
                Only legal liquidation can improve payment ability: sell improvements, mortgage
                eligible Addresses, or use an immediate present-value trade. There is no debt timer.
              </p>
            ) : null}
            {obligation.viewerIsDebtor && obligation.liquidation.length > 0 ? (
              <section aria-labelledby="liquidation-heading" className="space-y-2">
                <h3 id="liquidation-heading" className="font-medium">
                  Ways to raise the payment
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {obligation.liquidation.map((action) => (
                    <Button
                      key={`${action.type}:${commandTarget(action)}`}
                      variant="secondary"
                      onClick={() => onAction(action)}
                      disabled={disabled || pending}
                    >
                      {action.type === "MortgageDeed"
                        ? "Mortgage an Address"
                        : action.type === "SellImprovement"
                          ? "Sell a Stall"
                          : "Propose a trade"}
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}
            {obligation.viewerIsDebtor && obligation.blocked.length > 0 ? (
              <section aria-labelledby="blocked-debt-heading" className="space-y-2">
                <h3 id="blocked-debt-heading" className="font-medium">
                  Unavailable remedies
                </h3>
                <ul className="space-y-2">
                  {obligation.blocked.map((action) => (
                    <li key={`${action.type}:${action.reasonCode}`}>
                      <Button disabled className="w-full sm:w-auto">
                        {actionLabel(action.type)}
                      </Button>
                      <p className="mt-1 text-sm text-muted-ink">{action.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {obligation.viewerIsDebtor ? (
              <div className="flex flex-wrap gap-2">
                {payAction === undefined ? null : (
                  <Button onClick={() => onAction(payAction)} disabled={disabled || pending}>
                    Pay what is Owed
                  </Button>
                )}
                {bankruptcyAction === undefined ? null : (
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmBankruptcy(true)}
                    disabled={disabled || pending}
                  >
                    Declare bankruptcy
                  </Button>
                )}
              </div>
            ) : null}
            {obligation.viewerIsDebtor &&
            bankruptcyAction === undefined &&
            blockedBankruptcy !== undefined ? (
              <p className="text-sm text-muted-ink">{blockedBankruptcy.reason}</p>
            ) : null}
            {confirmBankruptcy && bankruptcyAction !== undefined ? (
              <div
                className="rounded-(--radius-md) border-2 border-danger bg-danger/5 p-3"
                role="alert"
              >
                <h3 className="font-medium">This cannot be undone</h3>
                <p className="mt-1 text-sm">
                  {obligation.creditorIsBank
                    ? "Your Addresses return to The Committee for auction and held Neighborly Words return to their decks."
                    : `Your Addresses and held Neighborly Words transfer to ${obligation.creditorName}; mortgaged-Address charges may create a new Owed state.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onAction(bankruptcyAction);
                      setConfirmBankruptcy(false);
                    }}
                    disabled={disabled || pending}
                  >
                    Confirm bankruptcy
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmBankruptcy(false)}
                    disabled={pending}
                  >
                    Keep paying
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
      {snapshot.paused ? (
        <p
          role="status"
          className="rounded-(--radius-md) border border-warning bg-warning/10 p-3 text-sm"
        >
          Play is paused while the required player reconnects. No pass, payment, trade response, or
          bankruptcy will happen automatically.
        </p>
      ) : null}
    </div>
  );
}
