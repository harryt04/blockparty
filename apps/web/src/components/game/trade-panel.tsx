/**
 * Trade compose/review surface. Offers are present-value and escrow-free:
 * assets stay with their owners until the named recipient accepts. See
 * RULE-012 and UX-015.
 */
import type { Command, GameSnapshotProjection } from "@blockparty/contracts";
import { useEffect, useState } from "react";
import { formatMoney } from "@/components/display-names";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  latestTradeOutcome,
  tradeComposerContext,
  tradeDecisionContext,
  type TradeAssetContext,
} from "./game-model";

type TradeCommandHandler = (command: Command) => void | Promise<boolean>;

function assetSummary(asset: TradeAssetContext): string {
  return asset.mortgaged ? `${asset.label} (mortgaged)` : asset.label;
}

function AssetList({
  title,
  cash,
  deeds,
  cards,
  charge,
  balanceAfter,
}: {
  title: string;
  cash: number;
  deeds: readonly TradeAssetContext[];
  cards: readonly TradeAssetContext[];
  charge: number;
  balanceAfter: number;
}) {
  return (
    <section aria-labelledby={`${title.replaceAll(" ", "-")}-heading`} className="space-y-2">
      <h4 id={`${title.replaceAll(" ", "-")}-heading`} className="font-medium">
        {title}
      </h4>
      <ul className="space-y-1 text-sm">
        {cash > 0 ? <li>{formatMoney(cash, "Tabs")}</li> : null}
        {deeds.map((deed) => (
          <li key={deed.assetId}>{assetSummary(deed)}</li>
        ))}
        {cards.map((card) => (
          <li key={card.assetId}>{card.label}</li>
        ))}
        {cash === 0 && deeds.length === 0 && cards.length === 0 ? (
          <li className="text-muted-ink">Nothing</li>
        ) : null}
      </ul>
      {charge > 0 ? (
        <p className="text-sm text-muted-ink">
          Mortgage charges paid by recipient: {formatMoney(charge, "Tabs")}.
        </p>
      ) : null}
      <p className="text-sm tabular text-muted-ink">
        Recipient balance after acceptance: {formatMoney(balanceAfter, "Tabs")}.
      </p>
    </section>
  );
}

function TradeComposer({
  snapshot,
  disabled,
  onCommand,
  onClose,
}: {
  snapshot: GameSnapshotProjection;
  disabled: boolean;
  onCommand: TradeCommandHandler;
  onClose: () => void;
}) {
  const context = tradeComposerContext(snapshot);
  const self = snapshot.seats.find((seat) => seat.isSelf);
  const [counterpartySeatId, setCounterpartySeatId] = useState("");
  const [offeredCash, setOfferedCash] = useState("0");
  const [requestedCash, setRequestedCash] = useState("0");
  const [offeredDeedIds, setOfferedDeedIds] = useState<string[]>([]);
  const [requestedDeedIds, setRequestedDeedIds] = useState<string[]>([]);
  const [offeredCardIds, setOfferedCardIds] = useState<string[]>([]);
  const requestedCardIds: string[] = [];
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (counterpartySeatId === "" && context?.counterparties[0] !== undefined) {
      setCounterpartySeatId(context.counterparties[0].seatId);
    }
  }, [context, counterpartySeatId]);

  const counterparty = context?.counterparties.find(
    (seat) => seat.seatId === counterpartySeatId,
  ) ?? {
    seatId: "",
    name: "Counterpart",
    balance: 0,
    deeds: [],
  };
  const offeredDeeds =
    context?.offeredDeeds.filter((asset) => offeredDeedIds.includes(asset.assetId)) ?? [];
  const requestedDeeds =
    counterparty?.deeds.filter((asset) => requestedDeedIds.includes(asset.assetId)) ?? [];
  const offeredCards =
    context?.offeredDetentionReleaseCards.filter((asset) =>
      offeredCardIds.includes(asset.assetId),
    ) ?? [];
  const requestedCards: TradeAssetContext[] = [];
  const numeric = (value: string): number | undefined => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
  };

  function toggle(setter: (value: string[]) => void, current: readonly string[], id: string) {
    setter(
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );
  }

  function reviewOffer() {
    const give = numeric(offeredCash);
    const ask = numeric(requestedCash);
    if (
      context === undefined ||
      counterpartySeatId === "" ||
      give === undefined ||
      ask === undefined
    ) {
      setError("Choose a counterpart and enter whole-number Tabs amounts.");
      return;
    }
    if (give > (self?.balance ?? 0) || ask > counterparty.balance) {
      setError("Cash must be available to its current owner.");
      return;
    }
    if (
      give === 0 &&
      ask === 0 &&
      offeredDeedIds.length === 0 &&
      requestedDeedIds.length === 0 &&
      offeredCardIds.length === 0 &&
      requestedCardIds.length === 0
    ) {
      setError("Add at least one current asset to the offer.");
      return;
    }
    setError(undefined);
    setReview(true);
  }

  function submit() {
    if (context === undefined || counterpartySeatId === "") return;
    const give = numeric(offeredCash);
    const ask = numeric(requestedCash);
    if (give === undefined || ask === undefined) return;
    onCommand({
      type: "ProposeTrade",
      counterpartySeatId,
      offered: { cash: give, deedIds: offeredDeedIds, detentionReleaseCardIds: offeredCardIds },
      requested: {
        cash: ask,
        deedIds: requestedDeedIds,
        detentionReleaseCardIds: requestedCardIds,
      },
    });
    onClose();
  }

  if (context === undefined || self === undefined) {
    return (
      <p className="text-sm text-muted-ink">
        Trade is not available from the current server state.
      </p>
    );
  }

  if (review) {
    const give = numeric(offeredCash) ?? 0;
    const ask = numeric(requestedCash) ?? 0;
    const incomingCharge = offeredDeeds.reduce((sum, deed) => sum + deed.transferCharge, 0);
    const outgoingCharge = requestedDeeds.reduce((sum, deed) => sum + deed.transferCharge, 0);
    return (
      <div className="space-y-4" aria-label="Review trade">
        <div className="grid gap-4 sm:grid-cols-2">
          <AssetList
            title="You give"
            cash={give}
            deeds={offeredDeeds}
            cards={offeredCards}
            charge={incomingCharge}
            balanceAfter={counterparty.balance - ask + give - incomingCharge}
          />
          <AssetList
            title={`You receive from ${counterparty.name}`}
            cash={ask}
            deeds={requestedDeeds}
            cards={requestedCards}
            charge={outgoingCharge}
            balanceAfter={(self.balance ?? 0) - give + ask - outgoingCharge}
          />
        </div>
        <p className="rounded-(--radius-md) border border-line bg-surface p-3 text-sm">
          No escrow: each asset stays with its current owner until {counterparty.name} accepts.
          Acceptance rechecks ownership, balances, and mortgage charges.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={submit} disabled={disabled}>
            Propose this trade
          </Button>
          <Button variant="secondary" onClick={() => setReview(false)} disabled={disabled}>
            Edit offer
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={disabled}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-label="Compose trade">
      <div>
        <label htmlFor="trade-counterparty" className="font-medium">
          Counterpart
        </label>
        <select
          id="trade-counterparty"
          className="mt-1 min-h-11 w-full rounded-(--radius-md) border border-line bg-surface-raised px-3"
          value={counterpartySeatId}
          onChange={(event) => {
            setCounterpartySeatId(event.target.value);
            setRequestedDeedIds([]);
          }}
          disabled={disabled}
        >
          {context.counterparties.map((seat) => (
            <option key={seat.seatId} value={seat.seatId}>
              {seat.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium">Cash</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            You give (Tabs)
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={offeredCash}
              onChange={(event) => setOfferedCash(event.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="text-sm">
            You request (Tabs)
            <Input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={requestedCash}
              onChange={(event) => setRequestedCash(event.target.value)}
              disabled={disabled}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-medium">Your current assets to offer</legend>
        {context.offeredDeeds.map((asset) => (
          <label key={asset.assetId} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offeredDeedIds.includes(asset.assetId)}
              onChange={() => toggle(setOfferedDeedIds, offeredDeedIds, asset.assetId)}
              disabled={disabled}
            />
            {assetSummary(asset)}
          </label>
        ))}
        {context.offeredDetentionReleaseCards.map((asset) => (
          <label key={asset.assetId} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={offeredCardIds.includes(asset.assetId)}
              onChange={() => toggle(setOfferedCardIds, offeredCardIds, asset.assetId)}
              disabled={disabled}
            />
            {asset.label}
          </label>
        ))}
        {context.offeredDeeds.length === 0 && context.offeredDetentionReleaseCards.length === 0 ? (
          <p className="text-sm text-muted-ink">
            You have no deeds or held release cards available.
          </p>
        ) : null}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="font-medium">Current assets to request</legend>
        {requestedDeeds.length === 0 && counterparty.deeds.length === 0 ? (
          <p className="text-sm text-muted-ink">This counterpart has no deeds available.</p>
        ) : null}
        {counterparty.deeds.map((asset) => (
          <label key={asset.assetId} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requestedDeedIds.includes(asset.assetId)}
              onChange={() => toggle(setRequestedDeedIds, requestedDeedIds, asset.assetId)}
              disabled={disabled}
            />
            {assetSummary(asset)}
          </label>
        ))}
        <p className="text-xs text-muted-ink">
          Held release-card identities remain private until their owner includes one in an offer.
        </p>
      </fieldset>
      {error === undefined ? null : (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reviewOffer} disabled={disabled || counterparty === undefined}>
          Review what you give and receive
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={disabled}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function TradePanel({
  snapshot,
  disabled = false,
  pending = false,
  onCommand,
}: {
  snapshot: GameSnapshotProjection;
  disabled?: boolean;
  pending?: boolean;
  onCommand: TradeCommandHandler;
}) {
  const pendingTrade = tradeDecisionContext(snapshot);
  const composer = tradeComposerContext(snapshot);
  const [composeOpen, setComposeOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const outcome = latestTradeOutcome(snapshot);
  if (pendingTrade !== undefined) {
    const acceptAction = snapshot.legalActions.find((action) => action.type === "AcceptTrade");
    const rejectAction = snapshot.legalActions.find((action) => action.type === "RejectTrade");
    const cancelAction = snapshot.legalActions.find((action) => action.type === "CancelTrade");
    const giveSide = pendingTrade.viewerIsProposer ? pendingTrade.offered : pendingTrade.requested;
    const receiveSide = pendingTrade.viewerIsProposer
      ? pendingTrade.requested
      : pendingTrade.offered;
    const giveBalanceAfter = pendingTrade.viewerIsProposer
      ? pendingTrade.counterpartyBalance -
        giveSide.cash +
        receiveSide.cash -
        giveSide.incomingMortgageCharge
      : pendingTrade.proposerBalance -
        giveSide.cash +
        receiveSide.cash -
        giveSide.incomingMortgageCharge;
    const receiveBalanceAfter = pendingTrade.viewerIsProposer
      ? pendingTrade.proposerBalance -
        giveSide.cash +
        receiveSide.cash -
        receiveSide.incomingMortgageCharge
      : pendingTrade.counterpartyBalance -
        giveSide.cash +
        receiveSide.cash -
        receiveSide.incomingMortgageCharge;
    return (
      <Card aria-labelledby="trade-heading">
        <CardHeader>
          <CardTitle id="trade-heading">Pending trade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            {pendingTrade.viewerIsProposer
              ? `Your offer to ${pendingTrade.counterpartyName} is waiting for a response.`
              : `${pendingTrade.proposerName} sent you an offer.`}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AssetList
              title="You give"
              cash={giveSide.cash}
              deeds={giveSide.deeds}
              cards={giveSide.detentionReleaseCards}
              charge={0}
              balanceAfter={giveBalanceAfter}
            />
            <AssetList
              title="You receive"
              cash={receiveSide.cash}
              deeds={receiveSide.deeds}
              cards={receiveSide.detentionReleaseCards}
              charge={receiveSide.incomingMortgageCharge}
              balanceAfter={receiveBalanceAfter}
            />
          </div>
          <p className="rounded-(--radius-md) border border-line bg-surface p-3 text-sm">
            Assets remain with their owners until acceptance. Mortgage charges are paid immediately
            by the receiving owner; there is no escrow or deferred promise.
          </p>
          <div className="flex flex-wrap gap-2">
            {acceptAction ? (
              <Button
                onClick={() => onCommand({ type: "AcceptTrade", tradeId: pendingTrade.tradeId })}
                disabled={disabled || pending}
              >
                {"Accept this trade"}
              </Button>
            ) : null}
            {rejectAction ? (
              <Button
                variant="secondary"
                onClick={() => onCommand({ type: "RejectTrade", tradeId: pendingTrade.tradeId })}
                disabled={disabled || pending}
              >
                Reject this trade
              </Button>
            ) : null}
            {cancelAction ? (
              <Button
                variant="secondary"
                onClick={() => onCommand({ type: "CancelTrade", tradeId: pendingTrade.tradeId })}
                disabled={disabled || pending}
              >
                Cancel this trade
              </Button>
            ) : null}
            {pendingTrade.canReject ? (
              <Button
                variant="ghost"
                onClick={() => setCounterOpen(true)}
                disabled={disabled || pending}
              >
                Counter this trade
              </Button>
            ) : null}
          </div>
          {counterOpen ? (
            <div className="rounded-(--radius-md) border border-brand bg-brand/5 p-3">
              <p className="mb-3 text-sm">
                A counter is a new present-value offer. Reject this offer first, then the server
                will show Propose a trade when it is legal for your seat. No assets move while this
                offer is pending.
              </p>
              {rejectAction ? (
                <Button
                  variant="secondary"
                  onClick={() => onCommand({ type: "RejectTrade", tradeId: pendingTrade.tradeId })}
                  disabled={disabled || pending}
                >
                  Reject and clear for a counter
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!composeOpen && composer === undefined && !(outcome === "stale" && !staleDismissed))
    return null;
  return (
    <Card aria-labelledby="trade-heading">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle id="trade-heading">Trade</CardTitle>
            <p className="mt-1 text-sm text-muted-ink">
              Use only current cash and owned assets. The server rechecks every offer.
            </p>
          </div>
          {outcome === "stale" && !staleDismissed ? (
            <Badge variant="warning">Offer changed</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome === "stale" && !staleDismissed ? (
          <p
            role="status"
            className="rounded-(--radius-md) border border-warning bg-warning/10 p-3 text-sm"
          >
            That offer became stale because an included asset or balance changed. Review the current
            assets and compose a new offer.
          </p>
        ) : null}
        {!composeOpen ? (
          <Button
            onClick={() => {
              setStaleDismissed(true);
              setComposeOpen(true);
            }}
            disabled={disabled || pending || composer === undefined}
          >
            Propose a trade
          </Button>
        ) : null}
        {composeOpen ? (
          <TradeComposer
            snapshot={snapshot}
            disabled={disabled || pending}
            onCommand={onCommand}
            onClose={() => setComposeOpen(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
