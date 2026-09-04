"use client";

import {
  ErrorEnvelope,
  CreateGameResponse,
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type VariantKey,
} from "@blockparty/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  enabledVariantCountBucket,
  playerCountBucket,
} from "@/components/analytics/analytics-model";
import { useAnalytics } from "@/components/analytics/analytics-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRequestFromForm, type CreateField } from "./create-form-model";

const VARIANT_COPY: Record<(typeof VARIANT_KEYS)[number], { label: string; warning: string }> = {
  restSpaceJackpot: {
    label: "Jackpot on The Stoop",
    warning: "Fees build a pot that one landing collects. Expect cash spikes.",
  },
  doubleStartOnExactLanding: {
    label: "Double pay for landing exactly on Sunup",
    warning: "More money enters the game and exact rolls gain value.",
  },
  noAuctionAfterDeclinedAcquisition: {
    label: "No auction after a declined Address",
    warning: "Less early cash pressure. Games tend to run longer.",
  },
  noIncomeWhileDetained: {
    label: "No income during a Noise Complaint",
    warning: "Much harsher. Players can be knocked out sooner.",
  },
  bonusForMatchingOnes: {
    label: "Bonus for rolling double ones",
    warning: "A rare extra payment. Stacks with the exact-Sunup bonus.",
  },
  startingAssetsDealt: {
    label: "Deal Addresses at the start",
    warning: "Faster ownership. Block opportunities can be uneven.",
  },
  relaxedEvenBuilding: {
    label: "Build without the even-spread rule",
    warning: "Concentrated rent spikes. Shorter, swingier games.",
  },
  unlimitedImprovementInventory: {
    label: "Unlimited Stalls and Block Stages",
    warning: "Removes a scarcity lever and may shorten the endgame.",
  },
};

function errorId(field: CreateField): string {
  return `${field}-error`;
}

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("bp_csrf="));
  return cookie?.slice("bp_csrf=".length);
}

function ApiError({ message }: { message: string }) {
  return (
    <Alert variant="danger" role="alert">
      <div>
        <AlertTitle>Lobby was not created</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </div>
    </Alert>
  );
}

function fieldProps(field: CreateField, errors: Partial<Record<CreateField, string>>) {
  const message = errors[field];
  return {
    "aria-invalid": message === undefined ? undefined : true,
    "aria-describedby": message === undefined ? undefined : errorId(field),
  };
}

function FieldError({
  field,
  errors,
}: {
  field: CreateField;
  errors: Partial<Record<CreateField, string>>;
}) {
  const message = errors[field];
  return message === undefined ? null : (
    <p id={errorId(field)} className="mt-1 text-sm text-danger">
      {message}
    </p>
  );
}

export function CreateGameForm() {
  const router = useRouter();
  const { track } = useAnalytics();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CreateField, string>>>({});
  const [apiError, setApiError] = useState<string>();
  const [preset, setPreset] = useState<"standard" | "short-game">("standard");
  const [variants, setVariants] = useState<Record<VariantKey, boolean>>(
    () =>
      Object.fromEntries(VARIANT_KEYS.map((key) => [key, STANDARD_CONFIGURATION[key]])) as Record<
        VariantKey,
        boolean
      >,
  );

  function selectPreset(nextPreset: "standard" | "short-game") {
    const configuration =
      nextPreset === "standard" ? STANDARD_CONFIGURATION : SHORT_GAME_CONFIGURATION;
    setPreset(nextPreset);
    setVariants(
      Object.fromEntries(VARIANT_KEYS.map((key) => [key, configuration[key]])) as Record<
        VariantKey,
        boolean
      >,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(undefined);
    const result = createRequestFromForm(new FormData(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    track("game_create_started", {
      player_count_bucket: playerCountBucket(result.request.seatCount),
    });
    track("rule_configuration_saved", {
      preset: result.request.configuration.preset,
      enabled_variant_count_bucket: enabledVariantCountBucket(
        VARIANT_KEYS.filter((key) => result.request.configuration[key]).length,
      ),
    });
    setPending(true);
    try {
      const csrf = csrfToken();
      const response = await fetch("/api/games", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf === undefined ? {} : { "x-csrf-token": csrf }),
        },
        body: JSON.stringify(result.request),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ErrorEnvelope.safeParse(body);
        setApiError(
          parsed.success
            ? parsed.data.error.message
            : "The lobby could not be created. Nothing was changed. Try again shortly.",
        );
        return;
      }
      const parsed = CreateGameResponse.safeParse(body);
      if (!parsed.success) {
        setApiError("The lobby response was not understood. Nothing was changed. Try again.");
        return;
      }
      track("game_created", {
        player_count_bucket: playerCountBucket(parsed.data.lobby.seatCount),
      });
      // Capabilities arrive only as HttpOnly Set-Cookie headers. Keep no
      // credential or game state in JavaScript storage. SEC-002, UX-010.
      router.push(`/game/${parsed.data.gameId}/lobby`);
    } catch {
      setApiError("The lobby could not be created. Nothing was changed. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Seats</CardTitle>
          <CardDescription>
            Two to six seats. Fill any seat you do not need with a bot. At least one seat stays open
            for a person.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label htmlFor="game-name">Game name (optional)</Label>
            <Input
              id="game-name"
              name="name"
              maxLength={48}
              className="mt-1"
              {...fieldProps("name", errors)}
            />
            <FieldError field="name" errors={errors} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="seat-count">Total seats</Label>
              <Input
                id="seat-count"
                name="seatCount"
                type="number"
                min={2}
                max={6}
                defaultValue={4}
                className="tabular mt-1"
                {...fieldProps("seatCount", errors)}
              />
              <FieldError field="seatCount" errors={errors} />
            </div>
            <div>
              <Label htmlFor="bot-seats">Bot seats</Label>
              <Input
                id="bot-seats"
                name="botSeatCount"
                type="number"
                min={0}
                max={5}
                defaultValue={0}
                className="tabular mt-1"
                {...fieldProps("botSeatCount", errors)}
              />
              <FieldError field="botSeatCount" errors={errors} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>
            Start from a preset, then change any of the eight options. Rules lock when the game
            starts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" {...fieldProps("preset", errors)}>
            <legend className="text-sm font-medium">Preset</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="preset"
                value="standard"
                checked={preset === "standard"}
                onChange={() => selectPreset("standard")}
              />
              <span>
                Standard
                <span className="block text-sm text-muted-ink">
                  All eight options off. The closest to the canonical rules.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="preset"
                value="short-game"
                checked={preset === "short-game"}
                onChange={() => selectPreset("short-game")}
              />
              <span>
                Short game
                <span className="block text-sm text-muted-ink">
                  Deals Addresses at the start and relaxes even building. Shorter, but higher
                  variance.
                </span>
              </span>
            </label>
            <FieldError field="preset" errors={errors} />
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Options</legend>
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
                <span>
                  {VARIANT_COPY[key].label}
                  <span className="block text-sm text-muted-ink">{VARIANT_COPY[key].warning}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Alert variant="info">
        <AlertDescription>
          Anyone with the invite link can join until the game starts. Names are for this game only;
          do not use a real name. The game and its links are removed 30 days after the last action.
        </AlertDescription>
      </Alert>

      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="acknowledged13Plus"
          className="mt-1"
          {...fieldProps("acknowledged13Plus", errors)}
        />
        <span>I confirm that all players are aged 13 or over.</span>
      </label>
      <FieldError field="acknowledged13Plus" errors={errors} />

      {apiError === undefined ? null : <ApiError message={apiError} />}
      {!pending && Object.keys(errors).length > 0 ? (
        <p role="alert" className="text-sm text-danger">
          Review the highlighted fields before creating the lobby.
        </p>
      ) : null}
      <p aria-live="polite" className="min-h-6 text-sm text-muted-ink">
        {pending ? "Creating your private lobby…" : ""}
      </p>
      <Button variant="primary" size="lg" type="submit" disabled={pending}>
        {pending ? "Creating lobby…" : "Create lobby"}
      </Button>
    </form>
  );
}
