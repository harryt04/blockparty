"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CommandAckEnvelope, ErrorEnvelope, type LegalAction } from "@blockparty/contracts";
import { useGameSync } from "@/client/sync/use-game-sync";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionStatus } from "@/components/shell/connection-status";
import { ActiveSpaceDetail } from "./active-space-detail";
import { AcquisitionAuctionSummary } from "./acquisition-auction-summary";
import { BankAssets } from "./bank-assets";
import { BoardList } from "./board-list";
import { BoardView } from "./board-view";
import { EventFeed } from "./event-feed";
import { ActionBar } from "./action-bar";
import { ManagementPanel } from "./management-panel";
import {
  activeSpace,
  boardLayout,
  commandForLegalAction,
  districtNames,
  enabledVariantLabels,
  latestDiceResult,
  managementDecisionContext,
  orderedBoard,
} from "./game-model";
import { PlayerStrip } from "./player-strip";

function GameLoading() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6" aria-busy="true">
      <Skeleton className="h-12 w-2/3" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="h-[28rem]" />
      </div>
    </div>
  );
}

function phaseLabel(phase: string): string {
  return phase.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

function commandUrl(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/commands`;
}

export function GameClient({ gameId }: { gameId: string }) {
  const { state, retry } = useGameSync(gameId);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<LegalAction>();
  const [actionStatus, setActionStatus] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [managementOpen, setManagementOpen] = useState(false);

  const snapshot = state.snapshot;
  const spaces = useMemo(
    () => (snapshot === undefined ? [] : orderedBoard(snapshot.board)),
    [snapshot],
  );
  const selectedSpace = spaces.find((space) => space.spaceId === selectedSpaceId);
  const active = snapshot === undefined ? undefined : activeSpace(snapshot);
  const detailSpace = selectedSpace ?? active;
  const activeSeat = snapshot?.seats.find((seat) => seat.seatId === snapshot.activeSeatId);
  const districtMap = snapshot === undefined ? {} : districtNames(snapshot);
  const variants = snapshot === undefined ? [] : enabledVariantLabels(snapshot.configuration);
  const diceResult = snapshot === undefined ? undefined : latestDiceResult(snapshot);
  const management = snapshot === undefined ? undefined : managementDecisionContext(snapshot);
  const canManageSelectedSpace =
    detailSpace?.deedId !== undefined &&
    detailSpace.ownerSeatId !== undefined &&
    snapshot?.seats.some((seat) => seat.isSelf && seat.seatId === detailSpace.ownerSeatId) ===
      true &&
    management !== undefined;

  useEffect(() => {
    if (
      snapshot !== undefined &&
      (selectedSpaceId === undefined ||
        !snapshot.board.some((space) => space.spaceId === selectedSpaceId))
    ) {
      setSelectedSpaceId(active?.spaceId ?? snapshot.board[0]?.spaceId);
    }
  }, [active?.spaceId, selectedSpaceId, snapshot]);

  if (snapshot === undefined) {
    if (state.connection === "closed") {
      return (
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Alert variant="danger">
            <AlertTitle>Game unavailable</AlertTitle>
            <AlertDescription>
              {state.error ?? "This game could not be loaded. Your seat was not changed."}
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    return <GameLoading />;
  }

  const waitingFor = activeSeat?.name ?? "another player";
  const turnText = activeSeat?.isSelf ? "Your turn" : `Waiting for ${waitingFor}`;
  const history = [...(snapshot.publicEvents ?? [])].sort(
    (left, right) => left.sequence - right.sequence,
  );

  async function submitAction(action: LegalAction, amount?: number) {
    if (snapshot === undefined || state.connection !== "live" || pendingAction !== undefined)
      return;
    const payload = commandForLegalAction(action, amount);
    if (payload === undefined) {
      setActionError("This action needs its own decision details and is not ready here.");
      return;
    }
    setPendingAction(action);
    setActionError(undefined);
    setActionStatus(`Submitting ${action.type.replace(/([a-z])([A-Z])/g, "$1 $2")}…`);
    try {
      const response = await fetch(commandUrl(gameId), {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          protocolVersion: 1,
          type: "game.command",
          requestId: crypto.randomUUID(),
          gameId,
          commandId: crypto.randomUUID(),
          expectedVersion: snapshot.aggregateVersion,
          payload,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        setActionError(
          parsed.success
            ? parsed.data.error.message
            : "The action was not accepted. Refresh and try again.",
        );
        setActionStatus(undefined);
        setPendingAction(undefined);
        if (parsed.success && parsed.data.error.code === "STALE_VERSION") retry();
        return;
      }
      const ack = CommandAckEnvelope.safeParse(body);
      if (!ack.success) {
        setActionError("The action acknowledgement was not understood. Refresh and try again.");
        setActionStatus(undefined);
        setPendingAction(undefined);
        retry();
        return;
      }
      setActionStatus("Action accepted. Waiting for the authoritative result.");
      setPendingAction(undefined);
      retry();
    } catch {
      setActionError("The action could not be sent. Check your connection and try again.");
      setActionStatus(undefined);
      setPendingAction(undefined);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-ink">Live game</p>
          <h1 className="mt-1 text-3xl">{turnText}</h1>
          <p className="mt-2 text-sm text-muted-ink">
            {phaseLabel(snapshot.phase)} · {snapshot.seats.length} players · sequence{" "}
            {snapshot.sequence}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {snapshot.paused ? <Badge variant="warning">Paused</Badge> : null}
          <ConnectionStatus state={state.connection} />
        </div>
      </header>

      {state.connection === "closed" ? (
        <Alert variant="warning">
          <AlertTitle>Showing the last confirmed state</AlertTitle>
          <AlertDescription>
            Live updates are unavailable. Nothing has been submitted from this screen.
          </AlertDescription>
          <Button variant="secondary" className="self-start" onClick={retry}>
            Try again
          </Button>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Game board" className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Neighborhood route</CardTitle>
            </CardHeader>
            <CardContent>
              <BoardView
                spaces={spaces}
                layout={boardLayout(snapshot)}
                selectedSpaceId={selectedSpace?.spaceId}
                className="h-[22rem] sm:h-[30rem]"
              />
            </CardContent>
          </Card>

          <details className="rounded-(--radius-lg) border border-line bg-surface-raised">
            <summary className="min-h-11 cursor-pointer px-4 py-3 font-medium">
              Board list ({spaces.length} stops)
            </summary>
            <div className="p-4 pt-0">
              <BoardList
                spaces={spaces}
                seats={snapshot.seats}
                districtNames={districtMap}
                selectedSpaceId={selectedSpace?.spaceId}
                onSelect={setSelectedSpaceId}
                currencyLabel="Tabs"
              />
            </div>
          </details>
        </section>

        <aside className="min-w-0 space-y-5" aria-label="Game information">
          <section
            aria-labelledby="turn-heading"
            className="rounded-(--radius-lg) border-2 border-brand bg-surface-raised p-4"
          >
            <h2 id="turn-heading" className="font-serif text-xl">
              {turnText}
            </h2>
            <p className="mt-1 text-sm text-muted-ink">
              {active === undefined ? "No stop is selected yet." : `Current stop: ${active.name}.`}
            </p>
            {diceResult === undefined ? null : (
              <p className="mt-3 rounded-(--radius-md) border border-brand bg-brand/10 p-3 text-lg font-medium">
                Latest roll:{" "}
                <span className="tabular">
                  {diceResult.first} + {diceResult.second} = {diceResult.first + diceResult.second}
                </span>
              </p>
            )}
          </section>

          <ActiveSpaceDetail
            space={detailSpace}
            seats={snapshot.seats}
            districtName={
              detailSpace === undefined ? undefined : districtMap[detailSpace.districtId ?? ""]
            }
            currencyLabel="Tabs"
            canManage={canManageSelectedSpace}
            onManage={() => setManagementOpen(true)}
          />

          <ManagementPanel
            snapshot={snapshot}
            open={managementOpen}
            disabled={state.connection !== "live" || snapshot.paused || pendingAction !== undefined}
            pending={pendingAction !== undefined}
            onAction={(action) => void submitAction(action)}
            onClose={() => setManagementOpen(false)}
          />

          <AcquisitionAuctionSummary snapshot={snapshot} />

          <section aria-labelledby="players-heading">
            <h2 id="players-heading" className="mb-2 font-serif text-xl">
              Players
            </h2>
            <PlayerStrip seats={snapshot.seats} activeSeatId={snapshot.activeSeatId} />
          </section>

          <BankAssets bank={snapshot.bank} board={snapshot.board} currencyLabel="Tabs" />

          <Card>
            <CardHeader>
              <CardTitle>Active rules</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{snapshot.configuration.preset.replace("-", " ")} preset</p>
              {variants.length === 0 ? (
                <p className="mt-2 text-sm text-muted-ink">Standard options are in effect.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {variants.map((variant) => (
                    <li key={variant}>{variant}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <EventFeed events={history} seats={snapshot.seats} currencyLabel="Tabs" defaultOpen />

          <p className="text-sm text-muted-ink">
            Need the lobby?{" "}
            <Link className="underline underline-offset-4" href={`/game/${gameId}/lobby`}>
              Return to lobby
            </Link>
          </p>
        </aside>
      </div>
      <ActionBar
        legalActions={snapshot.legalActions}
        actionAvailability={snapshot.actionAvailability}
        decisionSnapshot={snapshot}
        statusText={
          actionError ??
          actionStatus ??
          (snapshot.paused ? "Play is paused until the required player reconnects." : undefined)
        }
        pending={pendingAction !== undefined}
        disabled={state.connection !== "live" || snapshot.paused || pendingAction !== undefined}
        onAction={(action, amount) => void submitAction(action, amount)}
      />
    </div>
  );
}
