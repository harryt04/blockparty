"use client";

/**
 * Sidebar shell. See DS-030 and DS-009.
 *
 * A simplified composition of the shadcn Sidebar pattern, written in-repo so
 * the app has no shadcn CLI dependency. It behaves like the reference: a
 * collapsible rail on desktop and an off-canvas panel on mobile.
 *
 * TODO(DS-030): reconcile against the shadcn Sidebar reference before design
 * lock, and add the keyboard shortcut and persisted collapse state.
 */
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface SidebarLink {
  readonly href: string;
  readonly label: string;
  readonly icon?: ReactNode;
}

export function Sidebar({
  links,
  footer,
  ariaLabel = "Main",
}: {
  links: readonly SidebarLink[];
  footer?: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile trigger. Hidden from the desktop rail. */}
      <div className="border-b border-line bg-surface px-4 py-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </div>

      <nav
        id="app-sidebar"
        aria-label={ariaLabel}
        className={cn(
          "border-line bg-surface md:block md:w-60 md:shrink-0 md:border-r",
          open ? "block border-b" : "hidden",
        )}
      >
        <div className="flex flex-col gap-1 p-3">
          {links.map((link) => {
            const current = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-(--radius-md) px-3 py-2 text-sm",
                  "hover:bg-selection",
                  // Current page carries a border and a label, not color alone.
                  current
                    ? "border border-brand bg-brand/10 font-medium text-brand"
                    : "border border-transparent text-ink",
                )}
              >
                <span aria-hidden="true" className="[&_svg]:size-5">
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
        {footer ? <div className="border-t border-line p-3">{footer}</div> : null}
      </nav>
    </>
  );
}
