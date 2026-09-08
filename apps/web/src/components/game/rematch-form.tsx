"use client";

import {
  CreateGameResponse,
  ErrorEnvelope,
  VARIANT_KEYS,
  type PieceId,
  type VariantKey,
} from "@blockparty/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRequestFromForm } from "@/components/entry/create-form-model";
import { PiecePicker } from "@/components/entry/piece-picker";
import { SeatStepper } from "@/components/entry/seat-stepper";
import { SeatTray, setupSeatTrayEntries } from "@/components/entry/seat-tray";
import { PIECE_OPTIONS } from "@/components/entry/piece-options";
import { LOBBY_VARIANT_COPY } from "./lobby-model";

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("bp_csrf="));
  return cookie?.slice("bp_csrf=".length);
}

export function RematchForm({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [preset, setPreset] = useState<"standard" | "short-game">("standard");
  const [variants, setVariants] = useState<Record<VariantKey, boolean>>(
    () =>
      Object.fromEntries(VARIANT_KEYS.map((key) => [key, false])) as Record<VariantKey, boolean>,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [hostPieceId, setHostPieceId] = useState<PieceId>();
  const [humanSeatCount, setHumanSeatCount] = useState(2);
  const [botSeatCount, setBotSeatCount] = useState(0);

  function selectPreset(nextPreset: "standard" | "short-game") {
    setPreset(nextPreset);
    setVariants(
      Object.fromEntries(
        VARIANT_KEYS.map((key) => [
          key,
          nextPreset === "short-game" &&
            (key === "startingAssetsDealt" || key === "relaxedEvenBuilding"),
        ]),
      ) as Record<VariantKey, boolean>,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setStatus(undefined);
    const form = new FormData(event.currentTarget);
    form.set("humanSeatCount", String(humanSeatCount));
    form.set("botSeatCount", String(botSeatCount));
    const result = createRequestFromForm(form);
    if (!result.ok) {
      setError(Object.values(result.errors)[0] ?? "Review the rematch choices.");
      return;
    }

    setPending(true);
    try {
      const csrf = csrfToken();
      const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/rematch`, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "content-type": "application/json",
          ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
        },
        body: JSON.stringify(result.request),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        setError(parsed.success ? parsed.data.error.message : "The rematch could not be created.");
        return;
      }
      const parsed = CreateGameResponse.safeParse(body);
      if (!parsed.success) {
        setError("The rematch response was not understood. Nothing was changed.");
        return;
      }
      setStatus("Fresh lobby created. Opening it now…");
      router.push(`/game/${parsed.data.gameId}/lobby`);
    } catch {
      setError("The rematch could not be created. Nothing was changed. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  const hostToken = PIECE_OPTIONS.find((piece) => piece.token.pieceId === hostPieceId)?.token;
  const totalSeatError =
    humanSeatCount + botSeatCount < 2 || humanSeatCount + botSeatCount > 6
      ? "Choose between 2 and 6 total players."
      : undefined;
  const selectedPreset =
    (preset === "standard" && VARIANT_KEYS.every((key) => !variants[key])) ||
    (preset === "short-game" &&
      VARIANT_KEYS.every(
        (key) => variants[key] === (key === "startingAssetsDealt" || key === "relaxedEvenBuilding"),
      ));
  const enabledVariantCount = VARIANT_KEYS.filter((key) => variants[key]).length;
  const rulesSummary = selectedPreset
    ? preset === "standard"
      ? "Standard · all house rules off"
      : "Short game · two house rules on"
    : `Custom · ${enabledVariantCount} house rule${enabledVariantCount === 1 ? "" : "s"} on`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Start a rematch</CardTitle>
          <CardDescription>
            Choose the participants and rules for a new room. Balances, deeds, history, and host
            access from this game will not carry over.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label htmlFor="rematch-name">Game name (optional)</Label>
            <Input id="rematch-name" name="name" maxLength={48} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="rematch-host-name">Host pseudonym</Label>
            <Input id="rematch-host-name" name="hostName" maxLength={24} className="mt-1" />
          </div>
          <PiecePicker
            name="hostToken"
            legend="Host piece"
            value={hostPieceId}
            onChange={setHostPieceId}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SeatStepper
              id="rematch-human-seats"
              label="Human players"
              value={humanSeatCount}
              min={1}
              max={6}
              description="The host is included."
              onChange={setHumanSeatCount}
            />
            <SeatStepper
              id="rematch-bot-seats"
              label="Computer players"
              value={botSeatCount}
              min={0}
              max={5}
              description="Computer seats fill the table."
              error={totalSeatError}
              onChange={setBotSeatCount}
            />
          </div>
          <SeatTray seats={setupSeatTrayEntries({ humanSeatCount, botSeatCount, hostToken })} />
          <details className="rounded-(--radius-md) border border-line">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 font-medium">
              Rules: {rulesSummary}
            </summary>
            <div className="flex flex-col gap-3 border-t border-line p-3">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Preset</legend>
                {(["standard", "short-game"] as const).map((option) => (
                  <label key={option} className="flex min-h-11 items-center gap-3">
                    <input
                      type="radio"
                      name="preset"
                      value={option}
                      checked={preset === option}
                      onChange={() => selectPreset(option)}
                    />
                    <span>{option === "standard" ? "Standard" : "Short game"}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Eight rule options</legend>
                {VARIANT_KEYS.map((key: VariantKey) => (
                  <label key={key} className="flex min-h-11 items-start gap-3">
                    <input
                      type="checkbox"
                      name={key}
                      className="mt-1"
                      checked={variants[key]}
                      onChange={(event) =>
                        setVariants((current) => ({ ...current, [key]: event.target.checked }))
                      }
                    />
                    <span>{LOBBY_VARIANT_COPY[key].label}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="acknowledged13Plus" className="mt-1" />
            <span>I confirm that all players are aged 13 or over.</span>
          </label>
          {error === undefined ? null : (
            <Alert variant="danger" role="alert">
              <div>
                <AlertTitle>Rematch was not created</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </div>
            </Alert>
          )}
          <p role="status" aria-live="polite" className="min-h-6 text-sm text-muted-ink">
            {status ?? (pending ? "Creating a fresh lobby…" : "")}
          </p>
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "Creating lobby…" : "Create rematch lobby"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
