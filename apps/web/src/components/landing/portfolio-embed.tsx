import { MiniBoard } from "@/components/game/lobby-preview";
import { Wordmark } from "@/components/shell/wordmark";

export function PortfolioEmbed() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-5 sm:px-6"
    >
      <section className="grid w-full max-w-4xl gap-5 rounded-(--radius-lg) border-2 border-line bg-surface p-4 shadow-lg sm:p-6 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(20rem,1.3fr)] lg:items-center">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-xs font-semibold tracking-[0.16em] text-brand uppercase">
            Private multiplayer table
          </p>
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">Own the block.</h1>
          <p className="max-w-prose text-sm text-muted-ink sm:text-base">
            A classic property game in an original magical city, built for two to six players.
          </p>
        </div>
        <div className="min-w-0 rounded-(--radius-md) border border-line bg-surface-raised p-2 sm:p-3">
          <MiniBoard />
        </div>
      </section>
    </main>
  );
}
