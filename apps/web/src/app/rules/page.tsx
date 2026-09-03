/**
 * `/rules` - versioned rules, variants, and the keyboard guide.
 * Linked from every shell footer. See UX section 2.
 *
 * TODO(VAR-013): render the enabled toggles, their warnings, and the
 * interaction notes for the active game from the captured configuration.
 */
import type { Metadata } from "next";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          Content version {PLACEHOLDER_BUNDLE.contentVersion}. A game keeps the rules and content it
          started with, so an update never changes a game in progress.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Optional rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-ink">
              There are exactly eight. The host picks them before the game starts, and they lock at
              start.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {VARIANT_KEYS.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
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

        <Alert variant="warning">
          <AlertDescription>
            Scaffolding build. The full rules text is not written yet.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
