/**
 * Server-driven management inventory for owned deeds. Previews are derived
 * from the captured content version; only the submitted LegalAction is
 * authoritative. See RULE-005, RULE-008, and UX-016.
 */
import type { GameSnapshotProjection, LegalAction } from "@blockparty/contracts";
import { useState } from "react";
import { formatMoney } from "@/components/display-names";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  managementDecisionContext,
  type ManagementActionContext,
  type ManagementDeedContext,
} from "./game-model";

function actionLabel(type: LegalAction["type"]): string {
  switch (type) {
    case "BuyImprovement":
      return "Buy a Stall";
    case "SellImprovement":
      return "Sell a Stall";
    case "MortgageDeed":
      return "Mortgage this Address";
    case "RedeemMortgage":
      return "Buy Back this Address";
    default:
      return type;
  }
}

function actionPreview(
  action: ManagementActionContext["type"],
  deed: ManagementDeedContext,
  balance: number,
): string {
  switch (action) {
    case "BuyImprovement":
      return deed.nextImprovementCost === undefined
        ? "No next level is defined."
        : `Pay ${formatMoney(deed.nextImprovementCost, "Tabs")}; balance becomes ${formatMoney(balance - deed.nextImprovementCost, "Tabs")}.`;
    case "SellImprovement":
      return deed.improvementResaleValue === undefined
        ? "No improvement is available to sell."
        : `Receive ${formatMoney(deed.improvementResaleValue, "Tabs")}; balance becomes ${formatMoney(balance + deed.improvementResaleValue, "Tabs")}.`;
    case "MortgageDeed":
      return `Receive ${formatMoney(deed.mortgageValue, "Tabs")}; balance becomes ${formatMoney(balance + deed.mortgageValue, "Tabs")}.`;
    case "RedeemMortgage":
      return `Pay ${formatMoney(deed.redemptionAmount, "Tabs")} including the redemption charge; balance becomes ${formatMoney(balance - deed.redemptionAmount, "Tabs")}.`;
  }
}

function deedHeading(deed: ManagementDeedContext): string {
  return `${deed.spaceName} management`;
}

function improvementKindLabel(kind: string): string {
  return kind === "stage" ? "Block Stage" : "Stall";
}

export function ManagementPanel({
  snapshot,
  open,
  disabled = false,
  pending = false,
  onAction,
  onClose,
}: {
  snapshot: GameSnapshotProjection;
  open: boolean;
  disabled?: boolean;
  pending?: boolean;
  onAction: (action: LegalAction) => void;
  onClose: () => void;
}) {
  const context = managementDecisionContext(snapshot);
  const [confirmation, setConfirmation] = useState<
    { readonly action: ManagementActionContext; readonly deed: ManagementDeedContext } | undefined
  >();

  if (!open || context === undefined) return null;

  const selectedConfirmation = confirmation;
  return (
    <Card aria-labelledby="manage-heading">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle id="manage-heading">Manage your Addresses</CardTitle>
            <p className="mt-1 text-sm text-muted-ink">
              Executable actions come from the current server state. Review the preview, then
              confirm each change.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Close
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-(--radius-md) border border-line bg-surface p-3">
          <p className="font-medium">Improvement inventory</p>
          <p className="mt-1 text-sm text-muted-ink">
            {context.inventoryUnlimited
              ? "Unlimited improvement inventory is enabled."
              : context.inventoryAvailable === undefined || context.inventoryKind === undefined
                ? "Inventory is not available in this projection."
                : `${context.inventoryAvailable} ${improvementKindLabel(context.inventoryKind)} pieces remain in the bank.`}
          </p>
        </div>

        {context.deeds.map((deed) => (
          <section
            key={deed.deedId}
            aria-labelledby={`manage-${deed.deedId}`}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`manage-${deed.deedId}`} className="font-medium">
                {deedHeading(deed)}
              </h3>
              <Badge>{deed.categoryLabel}</Badge>
              {deed.districtName === undefined ? null : (
                <Badge variant="info">{deed.districtName}</Badge>
              )}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-ink">Improvement level</dt>
              <dd className="tabular">
                {deed.improvementLevel} / {deed.maximumImprovementLevel}
              </dd>
              {deed.districtComplete === undefined ? null : (
                <>
                  <dt className="text-muted-ink">Complete district</dt>
                  <dd>{deed.districtComplete ? "Yes" : "No"}</dd>
                </>
              )}
              {deed.nextImprovementCost === undefined ? null : (
                <>
                  <dt className="text-muted-ink">Next improvement price</dt>
                  <dd>{formatMoney(deed.nextImprovementCost, "Tabs")}</dd>
                </>
              )}
              {deed.improvementResaleValue === undefined ? null : (
                <>
                  <dt className="text-muted-ink">Next resale proceeds</dt>
                  <dd>{formatMoney(deed.improvementResaleValue, "Tabs")}</dd>
                </>
              )}
              <dt className="text-muted-ink">Mortgage value</dt>
              <dd>{formatMoney(deed.mortgageValue, "Tabs")}</dd>
              <dt className="text-muted-ink">Buy-back total</dt>
              <dd>{formatMoney(deed.redemptionAmount, "Tabs")}</dd>
            </dl>

            {deed.actions.length === 0 ? (
              <p className="rounded-(--radius-md) border border-line p-3 text-sm text-muted-ink">
                No executable management action for this Address right now. See blocked actions
                below for the server&apos;s reason.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {deed.actions.map((action) => (
                  <div key={`${deed.deedId}:${action.type}`} className="space-y-1">
                    <Button
                      className="w-full"
                      onClick={() => setConfirmation({ action, deed })}
                      disabled={disabled || pending}
                    >
                      {actionLabel(action.type)}
                    </Button>
                    <p className="text-xs text-muted-ink">
                      {actionPreview(action.type, deed, context.balance)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {selectedConfirmation?.deed.deedId === deed.deedId ? (
              <div
                className="rounded-(--radius-md) border-2 border-brand bg-brand/5 p-3"
                aria-labelledby={`confirm-${deed.deedId}`}
              >
                <h4 id={`confirm-${deed.deedId}`} className="font-medium">
                  Confirm {actionLabel(selectedConfirmation.action.type).toLowerCase()}
                </h4>
                <p className="mt-1 text-sm">
                  {actionPreview(selectedConfirmation.action.type, deed, context.balance)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      onAction(selectedConfirmation.action.action);
                      setConfirmation(undefined);
                    }}
                    disabled={disabled || pending}
                  >
                    Confirm {actionLabel(selectedConfirmation.action.type)}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmation(undefined)}
                    disabled={pending}
                  >
                    Keep reviewing
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ))}

        {context.blocked.length === 0 ? null : (
          <section aria-labelledby="blocked-management-heading" className="space-y-2">
            <h3 id="blocked-management-heading" className="font-medium">
              Blocked management actions
            </h3>
            <ul className="space-y-2">
              {context.blocked.map((blocked) => (
                <li
                  key={`${blocked.type}:${blocked.reasonCode}`}
                  className="rounded-(--radius-md) border border-line p-3"
                >
                  <Button
                    disabled
                    aria-describedby={`blocked-${blocked.type}`}
                    className="w-full sm:w-auto"
                  >
                    {actionLabel(blocked.type)}
                  </Button>
                  <span
                    id={`blocked-${blocked.type}`}
                    className="mt-1 block text-sm text-muted-ink"
                  >
                    {blocked.reason}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
