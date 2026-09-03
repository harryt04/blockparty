/**
 * The application shell outside active play.
 *
 * Rules and accessibility are linked from every shell footer, per UX section 2.
 * The primary navigation uses the sidebar composition from DS-030.
 */
import { Accessibility, Home, PlusCircle, ScrollText, Settings } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sidebar, type SidebarLink } from "@/components/ui/sidebar";
import { Wordmark } from "./wordmark";

const LINKS: readonly SidebarLink[] = [
  { href: "/", label: "Home", icon: <Home /> },
  { href: "/create", label: "Create game", icon: <PlusCircle /> },
  { href: "/rules", label: "Rules", icon: <ScrollText /> },
  { href: "/accessibility", label: "Accessibility", icon: <Accessibility /> },
  { href: "/settings", label: "Settings", icon: <Settings /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
        <Link href="/" className="flex items-center text-ink">
          <Wordmark />
        </Link>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar links={LINKS} />
        <main id="main" className="flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>

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
