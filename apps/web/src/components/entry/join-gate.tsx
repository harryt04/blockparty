"use client";

import {
  ErrorEnvelope,
  InviteId,
  InviteStatusResponse,
  JoinGameResponse,
} from "@blockparty/contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinRequestFromForm, JOIN_TOKENS, type JoinField } from "./join-form-model";

type GateState =
  | { readonly kind: "checking" }
  | { readonly kind: "open"; readonly invite: InviteStatusResponse }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

function fieldErrorId(field: JoinField): string {
  return `join-${field}-error`;
}

function Unavailable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This invite is not available</CardTitle>
        <CardDescription>
          The invite may be full, expired, ended, or invalid. Nothing was changed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-medium underline">
          Back to home
        </Link>
      </CardContent>
    </Card>
  );
}

function JoinForm({ inviteId, gameName }: { inviteId: string; gameName?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<JoinField, string>>>({});
  const [apiError, setApiError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(undefined);
    const result = joinRequestFromForm(new FormData(event.currentTarget));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(inviteId)}/join`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(result.request),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          setApiError("This invite is no longer available. Nothing was changed.");
        } else {
          const parsed = ErrorEnvelope.safeParse(body);
          setApiError(
            parsed.success
              ? parsed.data.error.message
              : "The join request was not completed. Nothing was changed. Try again shortly.",
          );
        }
        return;
      }
      const parsed = JoinGameResponse.safeParse(body);
      if (!parsed.success) {
        setApiError("The join response was not understood. Nothing was changed. Try again.");
        return;
      }
      // The response contains no capability. The server places it only in a
      // secure cookie; the browser retains no credential or game state.
      router.push(`/game/${parsed.data.gameId}/lobby`);
    } catch {
      setApiError("The join request could not be completed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const describedBy = (field: JoinField) =>
    errors[field] === undefined ? undefined : fieldErrorId(field);

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{gameName === undefined ? "Join this game" : `Join ${gameName}`}</CardTitle>
          <CardDescription>
            Choose an open seat, a name for this game only, and a token. This is not an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label htmlFor="player-name">Name for this game</Label>
            <Input
              id="player-name"
              name="name"
              maxLength={24}
              autoComplete="off"
              aria-invalid={errors.name === undefined ? undefined : true}
              aria-describedby={describedBy("name") ?? "player-name-help"}
              className="mt-1"
            />
            <p id="player-name-help" className="mt-1 text-sm text-muted-ink">
              Use a pseudonym, not your real name. Up to 24 Unicode characters.
            </p>
            {errors.name === undefined ? null : (
              <p id={fieldErrorId("name")} className="mt-1 text-sm text-danger">
                {errors.name}
              </p>
            )}
          </div>

          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={errors.token === undefined ? undefined : true}
            aria-describedby={describedBy("token")}
          >
            <legend className="text-sm font-medium">Open seat token</legend>
            <p className="text-sm text-muted-ink">
              A token already claimed by someone else cannot be used.
            </p>
            <div className="flex flex-wrap gap-2">
              {JOIN_TOKENS.map((token) => (
                <label
                  key={token.token.shape}
                  className="flex min-h-11 items-center gap-2 rounded-(--radius-md) border border-line px-3"
                >
                  <input type="radio" name="token" value={token.token.shape} />
                  {token.label}
                </label>
              ))}
            </div>
            {errors.token === undefined ? null : (
              <p id={fieldErrorId("token")} className="text-sm text-danger">
                {errors.token}
              </p>
            )}
          </fieldset>

          <div>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="acknowledged13Plus"
                className="mt-1"
                aria-invalid={errors.acknowledged13Plus === undefined ? undefined : true}
                aria-describedby={describedBy("acknowledged13Plus")}
              />
              <span>I confirm that all players are aged 13 or over.</span>
            </label>
            {errors.acknowledged13Plus === undefined ? null : (
              <p id={fieldErrorId("acknowledged13Plus")} className="mt-1 text-sm text-danger">
                {errors.acknowledged13Plus}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {apiError === undefined ? null : (
        <Alert variant="danger" role="alert">
          <div>
            <AlertTitle>Could not join</AlertTitle>
            <AlertDescription>{apiError}</AlertDescription>
          </div>
        </Alert>
      )}
      <p aria-live="polite" className="min-h-6 text-sm text-muted-ink">
        {pending ? "Joining the lobby…" : ""}
      </p>
      <Button variant="primary" size="lg" type="submit" disabled={pending}>
        {pending ? "Joining lobby…" : "Join the lobby"}
      </Button>
    </form>
  );
}

export function JoinGate({ inviteId }: { inviteId: string }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  const checkInvite = useCallback(async () => {
    if (!InviteId.safeParse(inviteId).success) {
      setState({ kind: "unavailable" });
      return;
    }
    setState({ kind: "checking" });
    try {
      const response = await fetch(`/api/invites/${encodeURIComponent(inviteId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const body: unknown = await response.json();
      const parsed = InviteStatusResponse.safeParse(body);
      if (!response.ok || !parsed.success) {
        setState({ kind: "error" });
        return;
      }
      setState(
        parsed.data.status === "OPEN"
          ? { kind: "open", invite: parsed.data }
          : { kind: "unavailable" },
      );
    } catch {
      setState({ kind: "error" });
    }
  }, [inviteId]);

  useEffect(() => {
    void checkInvite();
  }, [checkInvite, attempt]);

  if (state.kind === "checking") {
    return <p role="status">Checking whether this invite is available…</p>;
  }
  if (state.kind === "unavailable") return <Unavailable />;
  if (state.kind === "error") {
    return (
      <Alert variant="danger" role="alert">
        <div>
          <AlertTitle>Could not check this invite</AlertTitle>
          <AlertDescription>
            Nothing was changed. Check your connection and try again.
          </AlertDescription>
          <Button className="mt-3" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        </div>
      </Alert>
    );
  }
  return <JoinForm inviteId={inviteId} gameName={state.invite.gameName} />;
}
