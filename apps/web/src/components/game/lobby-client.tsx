"use client";

import {
  ErrorEnvelope,
  LobbyProjection,
  type RulesConfiguration,
  type VariantKey,
} from "@blockparty/contracts";
import { Check, Clipboard, Share2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  enabledVariantCountBucket,
  playerCountBucket,
} from "@/components/analytics/analytics-model";
import { useAnalytics } from "@/components/analytics/analytics-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerToken } from "@/components/game/player-token";
import { useGameSync } from "@/client/sync/use-game-sync";
import {
  configurationValues,
  inviteUrl,
  LOBBY_VARIANT_COPY,
  lobbyIsReady,
  presetConfiguration,
} from "./lobby-model";

function lobbyUrl(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/lobby`;
}

function commandUrl(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}/commands`;
}

function LobbyLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8" aria-busy="true">
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

export function LobbyClient({ gameId }: { gameId: string }) {
  const { track } = useAnalytics();
  const [lobby, setLobby] = useState<LobbyProjection>();
  const [error, setError] = useState<string>();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "shared">("idle");
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<string>();
  const [draftConfiguration, setDraftConfiguration] = useState<RulesConfiguration>();

  const loadLobby = useCallback(async () => {
    try {
      const response = await fetch(lobbyUrl(gameId), {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        throw new Error(parsed.success ? parsed.data.error.message : "The lobby is unavailable.");
      }
      const parsed = LobbyProjection.safeParse(body);
      if (!parsed.success) throw new Error("The lobby response was not understood.");
      setLobby(parsed.data);
      setDraftConfiguration((current) => current ?? parsed.data.configuration);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The lobby is unavailable.");
    }
  }, [gameId]);

  const { state, retry } = useGameSync(gameId, { onPresence: loadLobby });

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  // Presence is deliberately ephemeral. Re-read the authorized lobby after a
  // presence frame so seat occupancy and connection labels stay current.
  useEffect(() => {
    if (state.snapshot !== undefined) void loadLobby();
  }, [loadLobby, state.snapshot]);

  const ready = lobby !== undefined && lobbyIsReady(lobby);
  const invite = useMemo(
    () =>
      lobby?.invitePath === undefined
        ? undefined
        : inviteUrl(lobby.invitePath, typeof window === "undefined" ? "" : window.location.origin),
    [lobby?.invitePath],
  );

  async function copyInvite() {
    if (invite === undefined || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopyState("copied");
    } catch {
      setCopyState("idle");
    }
  }

  async function shareInvite() {
    if (invite === undefined || !navigator.share) return;
    try {
      await navigator.share({ title: lobby?.name ?? "Blockparty lobby", url: invite });
      setCopyState("shared");
    } catch {
      setCopyState("idle");
    }
  }

  async function startGame() {
    if (lobby === undefined || state.snapshot === undefined || !lobby.viewerIsHost || !ready)
      return;
    setCommandPending(true);
    setCommandError(undefined);
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
          expectedVersion: state.snapshot.aggregateVersion,
          payload: { type: "StartGame" },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        setCommandError(parsed.success ? parsed.data.error.message : "The game could not start.");
        return;
      }
      track("game_started", {
        player_count_bucket: playerCountBucket(lobby.seatCount),
      });
      setCommandPending(false);
      retry();
    } catch {
      setCommandError("The game could not start. Check your connection and try again.");
    } finally {
      setCommandPending(false);
    }
  }

  async function saveConfiguration() {
    if (
      lobby === undefined ||
      state.snapshot === undefined ||
      !lobby.viewerIsHost ||
      draftConfiguration === undefined
    )
      return;
    setCommandPending(true);
    setCommandError(undefined);
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
          expectedVersion: state.snapshot.aggregateVersion,
          payload: { type: "ConfigureRules", configuration: draftConfiguration },
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        setCommandError(
          parsed.success ? parsed.data.error.message : "The rules could not be saved.",
        );
        return;
      }
      track("rule_configuration_saved", {
        preset: draftConfiguration.preset,
        enabled_variant_count_bucket: enabledVariantCountBucket(
          Object.values(configurationValues(draftConfiguration)).filter(Boolean).length,
        ),
      });
      await loadLobby();
      retry();
    } catch {
      setCommandError("The rules could not be saved. Check your connection and try again.");
    } finally {
      setCommandPending(false);
    }
  }

  if (state.connection === "closed" && lobby === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Alert variant="danger">
          <AlertTitle>Lobby unavailable</AlertTitle>
          <AlertDescription>
            {state.error ?? error ?? "This game is no longer available."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (lobby === undefined && error === undefined) return <LobbyLoading />;
  if (lobby === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Alert variant="danger">
          <AlertTitle>Lobby unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button className="mt-4" onClick={() => void loadLobby()}>
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  const configuration = draftConfiguration ?? lobby.configuration;
  const values = configurationValues(configuration);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-ink">Private lobby</p>
          <h1 className="mt-1 text-3xl">{lobby.name ?? "Blockparty game"}</h1>
          <p className="mt-2 text-muted-ink">
            {lobby.seats.filter((seat) => seat.kind !== "open").length} of {lobby.seatCount} seats
            filled · anyone with the invite can join until the game starts.
          </p>
        </div>
        <Badge variant={state.connection === "live" ? "success" : "warning"}>
          {state.connection === "live" ? "Live lobby" : "Updating lobby"}
        </Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users aria-hidden="true" /> Seats
            </CardTitle>
            <CardDescription>
              Each seat keeps its token and presence as players join.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {lobby.seats.map((seat) => (
                <li key={seat.seatId} className="rounded-(--radius-md) border border-line p-3">
                  <div className="flex items-center gap-2">
                    {seat.token === undefined ? null : (
                      <PlayerToken token={seat.token} name={seat.name} />
                    )}
                    <span className="font-medium">{seat.name ?? "Open seat"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge>
                      {seat.kind === "open" ? "Open" : seat.kind === "bot" ? "Bot" : "Guest"}
                    </Badge>
                    {seat.isHost ? <Badge variant="brand">Host</Badge> : null}
                    {seat.connected ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Badge variant="warning">Waiting</Badge>
                    )}
                    {seat.isSelf ? <Badge variant="info">You</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invite players</CardTitle>
            <CardDescription>
              Share admission to this lobby. It does not grant host controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <output
              className="break-all rounded-(--radius-md) border border-line bg-surface p-3 text-sm"
              aria-label="Invite link"
            >
              {invite ?? "Invite link unavailable"}
            </output>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void copyInvite()} disabled={invite === undefined}>
                {copyState === "copied" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Clipboard aria-hidden="true" />
                )}
                {copyState === "copied" ? "Invite copied" : "Copy invite"}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button variant="secondary" onClick={() => void shareInvite()}>
                  <Share2 aria-hidden="true" /> Share
                </Button>
              ) : null}
            </div>
            <p className="text-sm text-muted-ink" aria-live="polite">
              {copyState === "shared"
                ? "Invite shared."
                : "The link expires with this private game."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Game settings</CardTitle>
          <CardDescription>
            {lobby.viewerIsHost
              ? "The host selects the rules before starting. Rules become read-only once play begins."
              : "Only the host can change rules. You can review the selected options here."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!lobby.viewerIsHost || commandPending}>
            <legend className="text-sm font-medium">Preset</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {(["standard", "short-game"] as const).map((preset) => (
                <label key={preset} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="lobby-preset"
                    checked={configuration.preset === preset}
                    onChange={() => setDraftConfiguration(presetConfiguration(preset))}
                  />
                  {preset === "short-game" ? "Short game" : "Standard"}
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium">
              {configuration.preset === "short-game"
                ? "Short game"
                : configuration.preset === "custom"
                  ? "Custom rules"
                  : "Standard rules"}
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {(Object.keys(LOBBY_VARIANT_COPY) as VariantKey[]).map((key) => (
                <li key={key} className="rounded-(--radius-md) border border-line p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={values[key]}
                      onChange={(event) =>
                        setDraftConfiguration({
                          ...configuration,
                          preset: "custom",
                          [key]: event.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="font-medium">{LOBBY_VARIANT_COPY[key].label}</span>
                      <span className="block text-sm text-muted-ink">
                        {values[key] ? LOBBY_VARIANT_COPY[key].warning : "Off for this game."}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {lobby.viewerIsHost ? (
            <Button
              className="mt-4"
              onClick={() => void saveConfiguration()}
              disabled={commandPending}
            >
              {commandPending ? "Saving rules…" : "Save rules"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section
        aria-labelledby="start-heading"
        className="rounded-(--radius-lg) border border-brand bg-surface-raised p-4"
      >
        <h2 id="start-heading" className="font-serif text-xl">
          Ready to start?
        </h2>
        <p className="mt-1 text-sm text-muted-ink">
          {ready
            ? "Every seat is filled. Starting locks the rules for this game."
            : lobby.startBlockedReason}
        </p>
        {commandError === undefined ? null : (
          <p className="mt-2 text-sm text-danger" role="alert">
            {commandError}
          </p>
        )}
        <Button
          className="mt-4"
          variant="primary"
          onClick={() => void startGame()}
          disabled={!lobby.viewerIsHost || !ready || commandPending || state.connection !== "live"}
        >
          {commandPending
            ? "Starting game…"
            : lobby.viewerIsHost
              ? "Start game"
              : "Waiting for host"}
        </Button>
        {!lobby.viewerIsHost ? (
          <p className="mt-2 text-sm text-muted-ink">
            Guests can review the lobby but cannot start it.
          </p>
        ) : null}
      </section>
    </div>
  );
}
