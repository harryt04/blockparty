/**
 * `/` - Landing. See UX section 2 and UX-010.
 *
 * Name and mark, the private-game promise, a Create game primary CTA, a
 * Join with link field, how it works, the 13+ notice, accessibility and
 * settings links, and install education. There is no account wall.
 */
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HOW_IT_WORKS = [
  "Create a private game and pick two to six seats.",
  "Share the one invite link with the people you want to play.",
  "Each person picks a seat and a name for this game only.",
  "Play on any device. Come back to the same link within 30 days.",
];

export default function LandingPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-3xl">A private game, one link away.</h1>
          <p className="max-w-prose text-muted-ink">
            Start a property board game for two to six players. No account, no sign-up, no
            matchmaking. Share one link and play.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/create" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Create a game
            </Link>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Join with a link</CardTitle>
            <CardDescription>
              Paste the invite someone sent you. The link admits you to the lobby; it never takes
              over a seat someone is already using.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="invite-link">Invite link</Label>
              <Input
                id="invite-link"
                name="invite-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://example.com/join/..."
                className="mt-1"
              />
            </div>
            <Button variant="secondary">Open invite</Button>
          </CardContent>
        </Card>

        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="font-serif text-xl">
            How it works
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="tabular text-muted-ink">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <Alert variant="info">
          <AlertDescription>
            For players aged 13 and over. Anyone with the invite link can join until the game
            starts. Games are removed 30 days after the last action.
          </AlertDescription>
        </Alert>

        <Alert variant="warning">
          <AlertDescription>
            Scaffolding build. Pages and routes exist, but no game rules, saving, or realtime
            updates run yet.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
