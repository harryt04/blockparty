import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <h1 className="font-serif text-2xl">That page does not exist</h1>
        <p className="text-muted-ink">Check the link, or go back home and start again.</p>
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}
