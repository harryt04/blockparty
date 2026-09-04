import type { BankProjection, BoardSpaceProjection } from "@blockparty/contracts";
import { formatMoney } from "@/components/display-names";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BankAssets({
  bank,
  board,
  currencyLabel = "Tabs",
}: {
  bank?: BankProjection;
  board: readonly BoardSpaceProjection[];
  currencyLabel?: string;
}) {
  if (bank === undefined) return null;
  const availableNames = board
    .filter((space) => space.deedId !== undefined && bank.deedIds.includes(space.deedId))
    .map((space) => space.name);
  const inventory = Object.entries(bank.improvementInventory)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(" · ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>The Committee</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-ink">Cash</dt>
          <dd className="tabular">{formatMoney(bank.cash, currencyLabel)}</dd>
          <dt className="text-muted-ink">Unclaimed Addresses</dt>
          <dd>{bank.deedIds.length}</dd>
          <dt className="text-muted-ink">Stalls and stages</dt>
          <dd>{inventory || "None"}</dd>
        </dl>
        {availableNames.length > 0 ? (
          <p className="mt-3 text-xs text-muted-ink">Available: {availableNames.join(", ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
