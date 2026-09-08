"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CommandAckEnvelope,
  ErrorEnvelope,
  type Command,
  type LegalAction,
} from "@blockparty/contracts";
import { useGameSync } from "@/client/sync/use-game-sync";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { playerCountBucket } from "@/components/analytics/analytics-model";
import { useAnalytics } from "@/components/analytics/analytics-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionStatus } from "@/components/shell/connection-status";
import { formatMoney } from "@/components/display-names";
import { ActiveSpaceDetail } from "./active-space-detail";
import { AcquisitionAuctionSummary } from "./acquisition-auction-summary";
import { BankAssets } from "./bank-assets";
import { BoardList } from "./board-list";
import { BoardView } from "./board-view";
import { EventFeed } from "./event-feed";
import { LiveAnnouncements, type CommandAnnouncement } from "./live-announcements";
import { ActionBar } from "./action-bar";
import { ManagementPanel } from "./management-panel";
import { TradePanel } from "./trade-panel";
import { DetentionDebtPanel } from "./detention-debt-panel";
import { RecoveryPanel } from "./recovery-panel";
import {
  activeSpace,
  boardLayout,
  canManageInPhase,
  commandForLegalAction,
  districtNames,
  enabledVariantLabels,
  hasAuthoritativeActionResult,
  isManualSpaceInspection,
  latestDiceResult,
  managementDecisionContext,
  orderedBoard,
  selectedSpaceAfterActiveChange,
  turnLabel,
} from "./game-model";
import { PlayerStrip } from "./player-strip";
import { PropertyHand } from "./property-hand";
import { MobileGameNav, type MobileGameSection } from "./mobile-game-nav";

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

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie.split("; ").find((entry) => entry.includes("bp_csrf="));
  return cookie?.split("=").slice(1).join("=");
}

export function GameClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { track } = useAnalytics();
  const { state, retry } = useGameSync(gameId);
  const previousConnection = useRef(state.connection);
  const previousPhase = useRef(state.snapshot?.phase);
  const previousActiveSpaceId = useRef<string | undefined>(undefined);
  const authoritativeSnapshotVersion = state.snapshot?.aggregateVersion;
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>();
  const [pendingAction, setPendingAction] = useState<LegalAction>();
  const [actionStatus, setActionStatus] = useState<string>();
  const [acknowledgedActionVersion, setAcknowledgedActionVersion] = useState<number>();
  const [actionError, setActionError] = useState<string>();
  const [commandAnnouncement, setCommandAnnouncement] = useState<CommandAnnouncement>();
  const [managementOpen, setManagementOpen] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<string>();
  const [boardZoom, setBoardZoom] = useState<1 | 1.25 | 1.5>(1);
  const [mobileSection, setMobileSection] = useState<MobileGameSection>("board-section");

  const snapshot = state.snapshot;
  const spaces = useMemo(
    () => (snapshot === undefined ? [] : orderedBoard(snapshot.board)),
    [snapshot],
  );
  const selectedSpace = spaces.find((space) => space.spaceId === selectedSpaceId);
  const active = snapshot === undefined ? undefined : activeSpace(snapshot);
  const detailSpace = selectedSpace ?? active;
  const districtMap = snapshot === undefined ? {} : districtNames(snapshot);
  const variants = snapshot === undefined ? [] : enabledVariantLabels(snapshot.configuration);
  const diceResult = snapshot === undefined ? undefined : latestDiceResult(snapshot);
  const selfSeat = snapshot?.seats.find((seat) => seat.isSelf);
  const activeSpaceId = active?.spaceId;
  const manualInspection = isManualSpaceInspection(selectedSpaceId, activeSpaceId);
  const management = snapshot === undefined ? undefined : managementDecisionContext(snapshot);
  const canManageSelectedSpace =
    detailSpace?.deedId !== undefined &&
    detailSpace.ownerSeatId !== undefined &&
    snapshot?.seats.some((seat) => seat.isSelf && seat.seatId === detailSpace.ownerSeatId) ===
      true &&
    snapshot !== undefined &&
    canManageInPhase(snapshot.phase) &&
    management !== undefined;

  function announceCommand(message: string, priority: CommandAnnouncement["priority"]): void {
    setCommandAnnouncement((previous) => ({
      id: (previous?.id ?? 0) + 1,
      message,
      priority,
    }));
  }

  useEffect(() => {
    const wasReconnecting =
      previousConnection.current === "reconnecting" || previousConnection.current === "resyncing";
    if (wasReconnecting && state.connection === "live") {
      track("reconnect_result", { result_category: "success" });
    } else if (wasReconnecting && state.connection === "closed") {
      track("reconnect_result", { result_category: "unavailable" });
    }
    previousConnection.current = state.connection;
  }, [state.connection, track]);

  useEffect(() => {
    if (previousPhase.current !== "Finished" && snapshot?.phase === "Finished") {
      const finishEvent = [...(snapshot.publicEvents ?? [])]
        .reverse()
        .find((event) => event.type === "GameEndedNoContest" || event.type === "GameCompleted");
      track("game_finished", {
        player_count_bucket: playerCountBucket(snapshot.seats.length),
        finish_reason_category:
          finishEvent?.type === "GameEndedNoContest" ? "no_contest" : "winner",
      });
    }
    previousPhase.current = snapshot?.phase;
  }, [snapshot, track]);

  useEffect(() => {
    if (hasAuthoritativeActionResult(acknowledgedActionVersion, authoritativeSnapshotVersion)) {
      setAcknowledgedActionVersion(undefined);
      setActionStatus(undefined);
    }
  }, [acknowledgedActionVersion, authoritativeSnapshotVersion]);

  useEffect(() => {
    const nextSelectedSpaceId = selectedSpaceAfterActiveChange(
      previousActiveSpaceId.current,
      active?.spaceId,
      selectedSpaceId,
    );
    previousActiveSpaceId.current = active?.spaceId;
    if (nextSelectedSpaceId !== selectedSpaceId) setSelectedSpaceId(nextSelectedSpaceId);
  }, [active?.spaceId, selectedSpaceId]);

  useEffect(() => {
    if (
      snapshot !== undefined &&
      (selectedSpaceId === undefined ||
        !snapshot.board.some((space) => space.spaceId === selectedSpaceId))
    ) {
      setSelectedSpaceId(active?.spaceId ?? snapshot.board[0]?.spaceId);
    }
  }, [active?.spaceId, selectedSpaceId, snapshot]);

  useEffect(() => {
    if (snapshot?.phase === "Finished") {
      router.replace(`/game/${encodeURIComponent(gameId)}/summary`);
    }
  }, [gameId, router, snapshot?.phase]);

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

  if (snapshot.phase === "Finished") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <LiveAnnouncements
          snapshot={snapshot}
          connection={state.connection}
          command={commandAnnouncement}
        />
        <Card>
          <CardHeader>
            <CardTitle>Game complete</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="status" aria-live="polite">
              The final result is ready. Opening the read-only summary…
            </p>
            <Link
              className="mt-4 inline-block underline underline-offset-4"
              href={`/game/${encodeURIComponent(gameId)}/summary`}
            >
              Open summary
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const turnText = turnLabel(snapshot);
  const viewerDebt =
    snapshot.obligation !== undefined && snapshot.obligation.debtorSeatId === selfSeat?.seatId
      ? snapshot.obligation
      : undefined;
  const mobileConnectionLabel =
    state.connection === "live"
      ? "Connected"
      : state.connection === "closed"
        ? "Unavailable"
        : state.connection === "reconnecting"
          ? "Reconnecting"
          : state.connection === "resyncing"
            ? "Resyncing"
            : "Connecting";
  const history = [...(snapshot.publicEvents ?? [])].sort(
    (left, right) => left.sequence - right.sequence,
  );

  async function submitCommand(payload: Command): Promise<boolean> {
    if (snapshot === undefined || state.connection !== "live" || pendingAction !== undefined)
      return false;
    setPendingAction({ type: payload.type });
    setAcknowledgedActionVersion(undefined);
    setActionError(undefined);
    setActionStatus(`Submitting ${payload.type.replace(/([a-z])([A-Z])/g, "$1 $2")}…`);
    try {
      const csrf = csrfToken();
      const response = await fetch(commandUrl(gameId), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
        },
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
        const message = parsed.success
          ? parsed.data.error.message
          : "The action was not accepted. Refresh and try again.";
        setActionError(message);
        announceCommand(`Action rejected: ${message}`, "assertive");
        setActionStatus(undefined);
        setPendingAction(undefined);
        if (parsed.success && parsed.data.error.code === "STALE_VERSION") retry();
        return false;
      }
      const ack = CommandAckEnvelope.safeParse(body);
      if (!ack.success) {
        const message = "The action acknowledgement was not understood. Refresh and try again.";
        setActionError(message);
        announceCommand(`Action rejected: ${message}`, "assertive");
        setActionStatus(undefined);
        setPendingAction(undefined);
        retry();
        return false;
      }
      setAcknowledgedActionVersion(ack.data.aggregateVersion);
      setActionStatus("Action accepted. Waiting for the authoritative result.");
      announceCommand("Action accepted. Waiting for the authoritative result.", "polite");
      setPendingAction(undefined);
      retry();
      return true;
    } catch {
      const message = "The action could not be sent. Check your connection and try again.";
      setActionError(message);
      announceCommand(`Action rejected: ${message}`, "assertive");
      setActionStatus(undefined);
      setPendingAction(undefined);
      return false;
    }
  }

  async function claimHost(): Promise<void> {
    if (state.connection !== "live" || pendingAction !== undefined) return;
    setRecoveryStatus("Claiming host controls…");
    try {
      const csrf = csrfToken();
      const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/host/claim`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
        },
      });
      if (!response.ok) {
        setRecoveryStatus(
          "Host transfer is no longer available. Refresh to see the current authority.",
        );
        retry();
        return;
      }
      setRecoveryStatus("Host controls claimed. Refreshing authoritative state…");
      retry();
    } catch {
      setRecoveryStatus("Host controls could not be claimed. Check your connection and try again.");
    }
  }

  async function submitAction(action: LegalAction, amount?: number) {
    const payload = commandForLegalAction(action, amount);
    if (payload === undefined) {
      setActionError("This action needs its own decision details and is not ready here.");
      return;
    }
    await submitCommand(payload);
  }

  function navigateMobileSection(section: MobileGameSection): void {
    setMobileSection(section);
    document.getElementById(section)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function openManagementFor(spaceId: string): void {
    setSelectedSpaceId(spaceId);
    setManagementOpen(true);
  }

  function openTradeFor(spaceId: string): void {
    setSelectedSpaceId(spaceId);
    setManagementOpen(false);
    navigateMobileSection("trade-section");
  }

  return (
    <div className="game-shell mx-auto flex max-w-7xl flex-col gap-5" data-responsive-shell>
      <LiveAnnouncements
        snapshot={snapshot}
        connection={state.connection}
        command={commandAnnouncement}
      />
      <header
        className="game-shell-header game-desktop-header flex flex-wrap items-start justify-between gap-4"
        data-responsive-region="header"
      >
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

      <section
        className="game-mobile-status"
        aria-label="Current game status"
        data-responsive-region="header"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Now</p>
          <h1 className="truncate font-serif text-xl">{turnText}</h1>
          <p className="truncate text-sm text-muted-ink">
            {phaseLabel(snapshot.phase)} ·{" "}
            {selfSeat?.position === undefined
              ? "Position unknown"
              : `Position Stop ${selfSeat.position}`}
          </p>
        </div>
        <div className="game-mobile-status-facts">
          <p data-mobile-cash>
            <span className="text-muted-ink">Cash</span>{" "}
            <span className="tabular">
              {selfSeat?.balance === undefined ? "Unknown" : formatMoney(selfSeat.balance, "Tabs")}
            </span>
          </p>
          {viewerDebt !== undefined ? (
            <p data-mobile-debt>
              <span className="text-muted-ink">Debt</span>{" "}
              <span className="tabular">{formatMoney(viewerDebt.amount, "Tabs")}</span>
            </p>
          ) : null}
          {diceResult === undefined ? null : (
            <p data-mobile-roll>
              <span className="text-muted-ink">Roll</span>{" "}
              <span className="tabular">{diceResult.first + diceResult.second}</span>
            </p>
          )}
          <p
            aria-label={`Connection status: ${mobileConnectionLabel}`}
            className="rounded-(--radius-pill) border border-line bg-surface px-2 py-1 text-xs font-medium"
            data-mobile-connection
          >
            {state.connection === "live"
              ? "Online"
              : state.connection === "closed"
                ? "Unavailable"
                : "Connecting"}
          </p>
        </div>
      </section>

      <MobileGameNav currentSection={mobileSection} onNavigate={navigateMobileSection} />

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

      <div className="game-workspace" data-responsive-region="workspace">
        <aside
          className="game-player-rail min-w-0 space-y-3"
          aria-label="Players"
          data-responsive-region="player-rail"
        >
          <h2 id="players-heading" className="font-serif text-xl">
            Players
          </h2>
          <PlayerStrip
            seats={snapshot.seats}
            activeSeatId={snapshot.activeSeatId}
            className="game-player-list"
          />
        </aside>

        <section
          aria-label="Game board"
          id="board-section"
          className="game-board-column min-w-0 space-y-5"
          data-responsive-region="board"
        >
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle>Classic table</CardTitle>
                <div className="game-board-inspection-controls" aria-label="Board inspection">
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label="Zoom out on board"
                    onClick={() =>
                      setBoardZoom((value) => (value === 1 ? 1 : value === 1.5 ? 1.25 : 1))
                    }
                  >
                    −
                  </Button>
                  <span className="self-center text-xs tabular" aria-live="polite">
                    {Math.round(boardZoom * 100)}%
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label="Zoom in on board"
                    onClick={() => setBoardZoom((value) => (value === 1 ? 1.25 : 1.5))}
                  >
                    +
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Reset board view"
                    onClick={() => {
                      setBoardZoom(1);
                      setSelectedSpaceId(activeSpaceId);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <BoardView
                spaces={spaces}
                layout={boardLayout(snapshot)}
                seats={snapshot.seats}
                districtNames={districtMap}
                selectedSpaceId={selectedSpace?.spaceId}
                onSelect={setSelectedSpaceId}
                zoom={boardZoom}
                className="game-board-viewport"
              />
            </CardContent>
          </Card>

          {manualInspection ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-md) border border-selection bg-surface p-3">
              <p className="text-sm">Inspecting {detailSpace?.name ?? "a selected stop"}.</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedSpaceId(activeSpaceId)}
              >
                Follow active space
              </Button>
            </div>
          ) : null}

          <section id="properties-section" aria-label="Properties">
            <PropertyHand
              snapshot={snapshot}
              selectedSpaceId={selectedSpace?.spaceId}
              onSelect={setSelectedSpaceId}
              management={management}
              canManage={
                management !== undefined &&
                canManageInPhase(snapshot.phase) &&
                state.connection === "live" &&
                !snapshot.paused
              }
              onManage={openManagementFor}
              onTrade={openTradeFor}
            />
          </section>

          <section
            aria-labelledby="board-list-heading"
            className="game-board-list rounded-(--radius-lg) border border-line bg-surface-raised p-4"
          >
            <h2 id="board-list-heading" className="mb-3 font-serif text-xl">
              Board list ({spaces.length} stops)
            </h2>
            <BoardList
              spaces={spaces}
              seats={snapshot.seats}
              districtNames={districtMap}
              selectedSpaceId={selectedSpace?.spaceId}
              onSelect={setSelectedSpaceId}
              currencyLabel="Tabs"
            />
          </section>
        </section>

        <aside
          className="game-context min-w-0 space-y-5"
          aria-label="Game information"
          data-responsive-region="context-panel"
        >
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
            onTrade={openTradeFor}
          />

          <section id="trade-section" aria-label="Trade">
            <TradePanel
              snapshot={snapshot}
              disabled={state.connection !== "live" || snapshot.paused}
              pending={pendingAction !== undefined}
              onCommand={(command) => void submitCommand(command)}
            />
          </section>

          <DetentionDebtPanel
            snapshot={snapshot}
            disabled={state.connection !== "live" || snapshot.paused}
            pending={pendingAction !== undefined}
            onAction={(action) => void submitAction(action)}
          />

          <RecoveryPanel
            snapshot={snapshot}
            disabled={state.connection !== "live" || pendingAction !== undefined}
            pending={pendingAction !== undefined}
            onCommand={(command) => void submitCommand(command)}
            onClaimHost={() => void claimHost()}
          />
          {recoveryStatus === undefined ? null : (
            <p role="status" className="text-sm text-muted-ink">
              {recoveryStatus}
            </p>
          )}

          <AcquisitionAuctionSummary snapshot={snapshot} />

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

          <section id="history-section" aria-label="History">
            <EventFeed events={history} seats={snapshot.seats} currencyLabel="Tabs" defaultOpen />
          </section>

          <p className="text-sm text-muted-ink">
            Need the lobby?{" "}
            <Link className="underline underline-offset-4" href={`/game/${gameId}/lobby`}>
              Return to lobby
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
