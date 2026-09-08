/**
 * The application shell outside active play.
 *
 * Rules and accessibility are linked from every shell footer, per UX section 2.
 * The primary navigation stays compact so entry tasks retain the visual focus.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/create", label: "Create game" },
  { href: "/rules", label: "Rules" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <Link href="/" className="flex items-center text-ink">
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="underline-offset-4 hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1 px-4 py-6 md:px-8 md:py-10">
        {children}
      </main>

      <ShellFooter />
    </div>
  );
}

export function ShellFooter() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-4 text-sm text-muted-ink">
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/rules" className="underline underline-offset-4">
          Rules
        </Link>
        <Link href="/accessibility" className="underline underline-offset-4">
          Accessibility
        </Link>
        <Link href="/settings" className="underline underline-offset-4">
          Settings
        </Link>
        <span>For players aged 13 and over.</span>
      </nav>
    </footer>
  );
}
