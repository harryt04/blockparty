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
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { PiecePicker } from "./piece-picker";
import { SeatStepper } from "./seat-stepper";
import { SeatTray, setupSeatTrayEntries } from "./seat-tray";
import {
  createRequestFromForm,
  DEFAULT_CREATE_PIECE_ID,
  type CreateField,
} from "./create-form-model";
import { PIECE_OPTIONS } from "./piece-options";
import type { PieceId } from "@blockparty/contracts";

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
    label: "Unlimited Houses and Hotels",
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
  const submissionInFlight = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CreateField, string>>>({});
  const [apiError, setApiError] = useState<string>();
  const [hostPieceId, setHostPieceId] = useState<PieceId>(DEFAULT_CREATE_PIECE_ID);
  const [humanSeatCount, setHumanSeatCount] = useState(2);
  const [botSeatCount, setBotSeatCount] = useState(0);
  const [preset, setPreset] = useState<"standard" | "short-game">("standard");
  const [variants, setVariants] = useState<Record<VariantKey, boolean>>(
    () =>
      Object.fromEntries(VARIANT_KEYS.map((key) => [key, STANDARD_CONFIGURATION[key]])) as Record<
        VariantKey,
        boolean
      >,
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

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
    if (submissionInFlight.current) return;
    setApiError(undefined);
    const form = new FormData(event.currentTarget);
    form.set("humanSeatCount", String(humanSeatCount));
    form.set("botSeatCount", String(botSeatCount));
    const result = createRequestFromForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    submissionInFlight.current = true;
    track("game_create_started", {
      player_count_bucket: playerCountBucket(
        result.request.humanSeatCount + result.request.botSeatCount,
      ),
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
      submissionInFlight.current = false;
      setPending(false);
    }
  }

  const hostToken = PIECE_OPTIONS.find((piece) => piece.token.pieceId === hostPieceId)?.token;
  const totalSeatError =
    humanSeatCount + botSeatCount < 2 || humanSeatCount + botSeatCount > 6
      ? "Choose between 2 and 6 total players."
      : undefined;
  const selectedConfiguration = VARIANT_KEYS.every(
    (key) =>
      variants[key] ===
      (preset === "standard" ? STANDARD_CONFIGURATION[key] : SHORT_GAME_CONFIGURATION[key]),
  );
  const enabledVariantCount = VARIANT_KEYS.filter((key) => variants[key]).length;
  const rulesSummary = selectedConfiguration
    ? preset === "standard"
      ? "Standard · all house rules off"
      : "Short game · two house rules on"
    : `Custom · ${enabledVariantCount} house rule${enabledVariantCount === 1 ? "" : "s"} on`;

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Seats</CardTitle>
          <CardDescription>
            Two to six seats. Human players include you; computer players fill the remaining seats.
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
          <div>
            <Label htmlFor="host-name">Display name</Label>
            <Input
              id="host-name"
              name="hostName"
              maxLength={24}
              autoComplete="off"
              className="mt-1"
              {...fieldProps("hostName", errors)}
            />
            <FieldError field="hostName" errors={errors} />
          </div>
          <div>
            <PiecePicker
              name="hostToken"
              legend="Your piece"
              value={hostPieceId ?? null}
              onChange={setHostPieceId}
              errorId={errors.hostToken === undefined ? undefined : errorId("hostToken")}
              aria-invalid={errors.hostToken !== undefined}
            />
            <FieldError field="hostToken" errors={errors} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SeatStepper
              id="human-seats"
              label="Human players"
              value={humanSeatCount}
              min={1}
              max={6}
              description="You are included in this count."
              error={errors.humanSeatCount}
              onChange={setHumanSeatCount}
            />
            <SeatStepper
              id="bot-seats"
              label="Computer players"
              value={botSeatCount}
              min={0}
              max={5}
              description="Computer seats fill the table."
              error={errors.botSeatCount ?? totalSeatError}
              onChange={setBotSeatCount}
            />
          </div>
          <SeatTray
            seats={setupSeatTrayEntries({
              humanSeatCount,
              botSeatCount,
              hostToken,
            })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>Rules lock when the game starts.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <details className="group rounded-(--radius-md) border border-line">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
              <span>{rulesSummary}</span>
              <span aria-hidden="true" className="text-lg text-muted-ink group-open:rotate-180">
                ↓
              </span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-line p-3">
              <p className="text-sm text-muted-ink">
                Start from a preset, then change any of the eight options.
              </p>
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
                      <span className="block text-sm text-muted-ink">
                        {VARIANT_COPY[key].warning}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
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
      <Button variant="primary" size="lg" type="submit" disabled={pending || !hydrated}>
        {pending ? "Creating lobby…" : "Create lobby"}
      </Button>
    </form>
  );
}
