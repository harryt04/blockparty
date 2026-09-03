/**
 * `/game/[gameId]/summary` - completion. See UX-019 and PRD-FUN-015.
 *
 * A winner, a rules-defined no-winner, or a host-ended no-contest outcome;
 * standings, key events, rematch, copy result, and return home.
 *
 * A rematch creates a FRESH room and invite link. It never carries balances,
 * assets, or host authority silently.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { PlayerToken } from "@/components/game/player-token";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/components/display-names";
import { stubSummary } from "@/server/stub-data";

export const metadata: Metadata = { title: "Result" };

const OUTCOME_COPY = {
  WINNER: "The game finished with a winner.",
  NO_WINNER: "The game finished with no winner under these rules.",
  NO_CONTEST: "The host ended the game without a result. No winner is recorded.",
  EXPIRED: "The game expired before it finished.",
} as const;

export default async function SummaryPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const summary = stubSummary(gameId);
  const winner = summary.standings.find((seat) => seat.seatId === summary.winnerSeatId);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 md:px-8">
      <h1 className="font-serif text-2xl">
        {winner !== undefined ? `${winner.name ?? winner.seatId} wins` : "Game over"}
      </h1>
      <p className="text-muted-ink">{OUTCOME_COPY[summary.finishReason]}</p>

      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2">
            {summary.standings.map((seat) => (
              <li
                key={seat.seatId}
                className="flex min-h-11 items-center gap-3 rounded-(--radius-md) border border-line px-3 py-2"
              >
                <span className="tabular text-muted-ink">{seat.rank}.</span>
                {seat.token !== undefined ? (
                  <PlayerToken token={seat.token} name={seat.name} />
                ) : null}
                <span className="flex-1 font-medium">{seat.name ?? seat.seatId}</span>
                <span className="tabular text-sm">{formatMoney(seat.finalBalance)}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/create" className={buttonVariants({ variant: "primary" })}>
          Start a rematch
        </Link>
        <Button variant="secondary" disabled>
          Copy the result
        </Button>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Back to home
        </Link>
      </div>

      <Alert variant="info">
        <AlertDescription>
          The event history stays readable until this game is removed, 30 days after it finished. A
          rematch is a new room with a new link; it carries nothing over.
        </AlertDescription>
      </Alert>
    </div>
  );
}
