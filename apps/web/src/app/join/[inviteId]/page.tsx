/**
 * `/join/[inviteId]` - the join gate. See UX section 2 and UX-011.
 *
 * Validates the invitation, then lets the joiner choose a game-scoped
 * pseudonym and a token, and acknowledge the 13+ notice.
 *
 * Expired, invalid, full, and ended states give a safe exit and reveal nothing
 * about the private room. Never request a real name. See PRD-FUN-003.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Join a game" };

const TOKENS = [
  { shape: "barricade", label: "Barricade" },
  { shape: "cooler", label: "Cooler" },
  { shape: "boombox", label: "Boombox" },
  { shape: "hydrant", label: "Hydrant" },
  { shape: "flyer", label: "Flyer" },
  { shape: "stoop", label: "Stoop" },
] as const;

export default async function JoinPage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;

  // TODO(UX-011): call GET /api/invites/[inviteId] and branch on the status
  // before showing the form. An invalid, full, started, or ended invite shows
  // a safe exit instead, and never names the room.

  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <h1 className="font-serif text-2xl">Join this game</h1>

        <Card>
          <CardHeader>
            <CardTitle>Pick a seat</CardTitle>
            <CardDescription>
              Choose a name and a token for this game. The name is not an account and does not
              follow you to another game.
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
                aria-describedby="player-name-help"
                className="mt-1"
              />
              <p id="player-name-help" className="mt-1 text-sm text-muted-ink">
                Up to 24 characters. Do not use your real name.
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Token</legend>
              <div className="flex flex-wrap gap-2">
                {TOKENS.map((token) => (
                  <label
                    key={token.shape}
                    className="flex min-h-11 items-center gap-2 rounded-(--radius-md) border border-line px-3"
                  >
                    <input type="radio" name="token" value={token.shape} />
                    {token.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" name="acknowledged13Plus" className="mt-1" />
              <span className="text-sm">
                I am 13 or older and I understand anyone with this link can join until the game
                starts.
              </span>
            </label>
          </CardContent>
        </Card>

        <Button variant="primary" size="lg" disabled>
          Join the lobby
        </Button>

        <Alert variant="warning">
          <AlertDescription>
            Scaffolding build. Invite <code>{inviteId}</code> is not checked against a database yet,
            so joining does nothing.
          </AlertDescription>
        </Alert>

        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}
