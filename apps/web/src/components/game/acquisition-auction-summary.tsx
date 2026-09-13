/**
 * The decision context for an acquisition or auction. The values are a
 * readable projection only; every button remains driven by server legalActions.
 * See RULE-004, RULE-009, and UX-014.
 */
import type { GameSnapshotProjection } from "@blockparty/contracts";
import { formatMoney } from "@/components/display-names";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { acquisitionDecisionContext, auctionDecisionContext } from "./game-model";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-ink">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

export function AcquisitionAuctionSummary({
  snapshot,
  compact = false,
}: {
  snapshot: GameSnapshotProjection;
  compact?: boolean;
}) {
  const acquisition = acquisitionDecisionContext(snapshot);
  const auction = auctionDecisionContext(snapshot);
  if (acquisition === undefined && auction === undefined) return null;

  if (acquisition !== undefined) {
    return (
      <Card className={compact ? "border-brand/50" : undefined}>
        <CardHeader>
          <CardTitle>Acquire an Address</CardTitle>
          <p className="text-sm text-muted-ink">
            {acquisition.spaceName} · {acquisition.categoryLabel}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Detail label="Price" value={formatMoney(acquisition.price, "Tabs")} />
            <Detail label="Your cash" value={formatMoney(acquisition.balance, "Tabs")} />
            <Detail
              label="After acquiring"
              value={
                acquisition.canAcquire
                  ? formatMoney(acquisition.projectedBalance, "Tabs")
                  : "Not affordable"
              }
            />
            {acquisition.baseRent === undefined ? null : (
              <Detail
                label="Base income"
                value={`${formatMoney(acquisition.baseRent, "Tabs")} rent`}
              />
            )}
          </dl>
          <p className="mt-3 text-sm text-muted-ink">
            Acquire keeps this Address in your assets. Decline sends it to an untimed auction.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (auction === undefined) return null;
  const paused = snapshot.paused && !auction.priorityConnected;
  return (
    <Card className={compact ? "border-brand/50" : undefined}>
      <CardHeader>
        <CardTitle>Untimed Address auction</CardTitle>
        <p className="text-sm text-muted-ink">
          {auction.spaceName} · {auction.categoryLabel}
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Detail
            label="Current bid"
            value={auction.highBid === 0 ? "No bids yet" : formatMoney(auction.highBid, "Tabs")}
          />
          <Detail label="Minimum next bid" value={formatMoney(auction.minimumNextBid, "Tabs")} />
          <Detail label="Your cash" value={formatMoney(auction.balance, "Tabs")} />
          <Detail label="Priority" value={auction.priorityName} />
          <Detail
            label="Bid range"
            value={`${formatMoney(auction.minimumNextBid, "Tabs")}–${formatMoney(auction.maximumBid, "Tabs")}`}
          />
          <Detail label="Leader" value={auction.leaderName ?? "No leader yet"} />
          <Detail
            label="Passed"
            value={auction.passedNames.length === 0 ? "Nobody" : auction.passedNames.join(", ")}
          />
        </dl>
        <p className="mt-3 text-sm text-muted-ink" role={paused ? "status" : undefined}>
          {paused
            ? `Auction paused while ${auction.priorityName} reconnects. No bid or pass will be submitted.`
            : "Each bid is authoritative. Passing removes that seat from this auction permanently."}
        </p>
      </CardContent>
    </Card>
  );
}
