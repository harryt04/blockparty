/**
 * The game shell. See UX section 2 and UX-030 through UX-033.
 *
 * Authorization comes from the game-seat cookie, NEVER from the path. The
 * game ID locates state; it grants nothing.
 *
 * TODO(UX-018): warn before leaving an unresolved decision, and make sure
 * browser Back never silently discards a submitted command.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ShellFooter } from "@/components/shell/app-shell";
import { Wordmark } from "@/components/shell/wordmark";

export default async function GameLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <Link href="/" className="flex items-center text-ink">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3">
          <nav aria-label="Game">
            <Link href={`/game/${gameId}/lobby`} className="text-sm underline underline-offset-4">
              Lobby
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <ShellFooter />
    </div>
  );
}
