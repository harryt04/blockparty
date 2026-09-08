/**
 * `/` - Landing. See UX section 2 and UX-010.
 *
 * Name and mark, the private-game promise, a Create game primary CTA, a
 * Join with link field, how it works, the 13+ notice, accessibility and
 * settings links, and install education. There is no account wall.
 */
import Link from "next/link";
import { JoinLinkForm } from "@/components/entry/join-link-form";
import { MiniBoard } from "@/components/game/lobby-preview";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HOW_IT_WORKS = [
  "Create a private game and pick two to six seats.",
  "Share the one invite link with the people you want to play.",
  "Each person picks a seat and a name for this game only.",
  "Play on any device. Come back to the same link within 30 days.",
];

export default function LandingPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(24rem,1.15fr)]">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm font-semibold tracking-[0.18em] text-brand uppercase">
              A classic property game in a magical city
            </p>
            <h1 className="max-w-xl font-serif text-4xl leading-tight md:text-6xl">
              Own the block. Build your fortune.
            </h1>
            <p className="max-w-prose text-lg text-muted-ink">
              Gather two to six players around a private table, claim Addresses, complete Blocks,
              build Houses and Hotels, and be the last player standing.
            </p>
            <Link href="/create" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Set up the table
            </Link>
            <p className="text-sm text-muted-ink">No account. One private invite link.</p>
          </div>
          <div className="rounded-(--radius-lg) border border-line bg-surface-raised p-3 shadow-lg md:p-5">
            <MiniBoard />
          </div>
        </section>

        <Card className="mx-auto w-full max-w-3xl">
          <CardHeader>
            <CardTitle>Join with a link</CardTitle>
            <CardDescription>
              Paste the invite someone sent you. The link admits you to the lobby; it never takes
              over a seat someone is already using.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JoinLinkForm />
          </CardContent>
        </Card>

        <section aria-labelledby="how-it-works" className="mx-auto w-full max-w-3xl">
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

        <Alert variant="info" className="mx-auto w-full max-w-3xl">
          <AlertDescription>
            For players aged 13 and over. Anyone with the invite link can join until the game
            starts. Games are removed 30 days after the last action.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
