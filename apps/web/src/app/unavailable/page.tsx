/**
 * A neutral unavailable page for an expired, ended, or invalid game.
 * See UX-018.
 *
 * It reveals nothing about whether a private room existed.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Game unavailable" };

export default function UnavailablePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="font-serif text-2xl">This game is not available</h1>
        <p className="text-muted-ink">
          The link may have expired, or the game may have ended. Games are
          removed 30 days after the last action.
        </p>
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}
