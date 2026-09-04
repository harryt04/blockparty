"use client";

import { SummaryResponse } from "@blockparty/contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/components/display-names";
import { EventFeed } from "./event-feed";
import { RematchForm } from "./rematch-form";
import { enabledVariantLabels } from "./game-model";

function durationLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes === 0 ? `${remaining}s` : `${minutes}m ${remaining}s`;
}

function finishLabel(reason: "WINNER" | "NO_WINNER" | "NO_CONTEST" | "EXPIRED"): string {
  switch (reason) {
    case "WINNER":
      return "Winner";
    case "NO_WINNER":
      return "No winner";
    case "NO_CONTEST":
      return "No result";
    case "EXPIRED":
      return "Expired";
  }
}

export function SummaryClient({ gameId }: { gameId: string }) {
  const [summary, setSummary] = useState<SummaryResponse["summary"]>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    void fetch(`/api/games/${encodeURIComponent(gameId)}/summary`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("This completed game is no longer available.");
        const parsed = SummaryResponse.safeParse(body);
        if (!parsed.success) throw new Error("The completion summary was not understood.");
        if (current) setSummary(parsed.data.summary);
      })
      .catch((reason: unknown) => {
        if (current)
          setError(reason instanceof Error ? reason.message : "The summary is unavailable.");
      });
    return () => {
      current = false;
    };
  }, [gameId]);

  const seatNames = useMemo(
    () => Object.fromEntries((summary?.standings ?? []).map((seat) => [seat.seatId, seat.name])),
    [summary],
  );

  async function copyResult() {
    if (summary === undefined || typeof navigator === "undefined" || !navigator.clipboard) return;
    const winner =
      summary.winnerSeatId === undefined
        ? finishLabel(summary.finishReason)
        : `Winner: ${seatNames[summary.winnerSeatId] ?? "A player"}`;
    await navigator.clipboard.writeText(
      `Blockparty · ${winner} · ${summary.standings.map((seat) => `${seat.rank}. ${seat.name ?? "Player"}`).join(", ")}`,
    );
    setCopied(true);
  }

  if (summary === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {error === undefined ? (
          <p role="status" aria-live="polite">
            Loading completion summary…
          </p>
        ) : (
          <Alert variant="danger">
            <AlertTitle>Summary unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const winner =
    summary.winnerSeatId === undefined
      ? finishLabel(summary.finishReason)
      : `Winner: ${seatNames[summary.winnerSeatId] ?? "A player"}`;
  const variants = enabledVariantLabels(summary.configuration);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <header>
        <p className="text-sm text-muted-ink">Completed game</p>
        <h1 className="mt-1 text-3xl">{winner}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{finishLabel(summary.finishReason)}</Badge>
          <Badge>Read-only</Badge>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Final standings</CardTitle>
          <CardDescription>
            The game lasted {durationLabel(summary.durationSeconds)}. This result and its history
            remain available until {new Date(summary.expiresAt).toLocaleDateString()}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2" aria-label="Final standings">
            {summary.standings.map((seat) => (
              <li
                key={seat.seatId}
                className="flex items-center justify-between rounded-(--radius-md) border border-line px-3 py-3"
              >
                <span>
                  <span className="tabular text-muted-ink">{seat.rank}.</span>{" "}
                  {seat.name ?? "Player"}
                </span>
                <span className="tabular">{formatMoney(seat.finalBalance, "Tabs")}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules played</CardTitle>
        </CardHeader>
        <CardContent>
          {variants.length === 0 ? (
            <p className="text-sm">Standard options were in effect.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {variants.map((variant) => (
                <li key={variant}>{variant}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EventFeed events={summary.publicEvents} seatNames={seatNames} defaultOpen />

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void copyResult()}>
          {copied ? "Result copied" : "Copy result"}
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-(--radius-md) border border-line px-4 py-2 underline underline-offset-4"
        >
          Return home
        </Link>
      </div>

      <RematchForm gameId={gameId} />
    </div>
  );
}
