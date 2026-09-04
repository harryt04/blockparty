/**
 * `/rules` - versioned rules, variants, and the keyboard guide.
 * Linked from every shell footer. See UX section 2.
 *
 * This page is an explanation surface only. A live game's captured
 * configuration remains authoritative in its projection and is never changed
 * by this page. See VAR-013.
 */
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DISPLAY_TERM_GUIDE,
  INTERACTION_GUIDE,
  VARIANT_COPY,
  VARIANT_KEYS,
  VARIANT_SCHEMA_VERSION,
} from "./rules-content";

export const metadata: Metadata = { title: "Rules" };

const KEYBOARD = [
  ["Tab and Shift+Tab", "Move through landmarks and controls"],
  ["Enter or Space", "Activate the focused control"],
  ["Escape", "Close a dialog or sheet that can be dismissed"],
  ["Arrow keys", "Pan the board, or move between board stops"],
  ["Home and End", "Jump to the first or last board stop"],
] as const;

export default function RulesPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Rules</h1>
        <p className="text-muted-ink">
          Rules reference version {VARIANT_SCHEMA_VERSION}. A game keeps the configuration and
          content it started with, so an update never changes a game in progress.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>How play works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {INTERACTION_GUIDE.map((item) => (
                <li key={item.heading}>
                  <h3 className="font-medium">{item.heading}</h3>
                  <p className="text-sm text-muted-ink">{item.text}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Optional rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-ink">
              There are exactly eight. The host picks them before the game starts, and they lock at
              start. A live game shows its enabled options in the game view; this page cannot change
              them.
            </p>
            <ul className="flex flex-col gap-4">
              {VARIANT_KEYS.map((key) => {
                const variant = VARIANT_COPY[key];
                return (
                  <li key={key} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <h3 className="font-medium">{variant.label}</h3>
                    <p className="text-sm">{variant.effect}</p>
                    <p className="mt-1 text-sm text-muted-ink">
                      <span className="font-medium text-ink">Watch for:</span> {variant.warning}
                    </p>
                    <p className="mt-1 text-sm text-muted-ink">{variant.interaction}</p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Words on the board</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {DISPLAY_TERM_GUIDE.map((term) => (
                <div key={term.label}>
                  <dt className="font-medium">{term.label}</dt>
                  <dd className="text-sm text-muted-ink">{term.explanation}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keyboard guide</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {KEYBOARD.map(([keys, action]) => (
                <div key={keys} className="contents">
                  <dt className="font-medium">{keys}</dt>
                  <dd className="text-muted-ink">{action}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
