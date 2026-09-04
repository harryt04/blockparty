"use client";

import {
  CreateGameResponse,
  ErrorEnvelope,
  VARIANT_KEYS,
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
    const result = createRequestFromForm(new FormData(event.currentTarget));
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rematch-seat-count">Total seats</Label>
              <Input
                id="rematch-seat-count"
                name="seatCount"
                type="number"
                min={2}
                max={6}
                defaultValue={4}
                className="tabular mt-1"
              />
            </div>
            <div>
              <Label htmlFor="rematch-bot-seats">Bot seats</Label>
              <Input
                id="rematch-bot-seats"
                name="botSeatCount"
                type="number"
                min={0}
                max={5}
                defaultValue={0}
                className="tabular mt-1"
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Rules preset</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="preset"
                value="standard"
                checked={preset === "standard"}
                onChange={() => selectPreset("standard")}
              />
              <span>Standard</span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="preset"
                value="short-game"
                checked={preset === "short-game"}
                onChange={() => selectPreset("short-game")}
              />
              <span>Short game</span>
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Eight rule options</legend>
            {VARIANT_KEYS.map((key) => (
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
