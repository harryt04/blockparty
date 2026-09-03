/**
 * `/settings` - personal settings. See UX section 2.
 *
 * Theme, contrast, reduced sound and haptics, animation preference, board
 * labels, text scale guidance, install status, and data and session controls.
 *
 * NONE of these change game rules. Rule settings live in the lobby and lock at
 * start.
 */
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

const PREFERENCES = [
  { id: "theme", label: "Match my system light or dark setting", defaultOn: true },
  { id: "contrast", label: "Use higher contrast borders and text", defaultOn: false },
  { id: "motion", label: "Reduce animation", defaultOn: false },
  { id: "sound", label: "Play sounds", defaultOn: false },
  { id: "haptics", label: "Use haptics", defaultOn: false },
  { id: "board-labels", label: "Always show board stop names", defaultOn: true },
];

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Settings</h1>
        <p className="text-muted-ink">
          These are your preferences on this device. They do not change the
          rules of any game.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Display and feedback</CardTitle>
            <CardDescription>
              Sound and haptics are off unless you turn them on, and they are
              switched separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {PREFERENCES.map((preference) => (
                <li key={preference.id}>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      name={preference.id}
                      defaultChecked={preference.defaultOn}
                    />
                    {preference.label}
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Text size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-ink">
              Use your browser or system text size. The app reflows down to a
              320 pixel width and up to 400 percent zoom. Nothing here blocks
              browser zoom.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data and analytics</CardTitle>
            <CardDescription>
              Analytics are off until you turn them on, and you can withdraw at
              any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-ink">
              We keep the minimum: a name you chose for one game, an opaque seat
              credential, the game events, and service telemetry. Games are
              removed 30 days after the last action.
            </p>
          </CardContent>
        </Card>

        <Alert variant="warning">
          <AlertDescription>
            Scaffolding build. These controls do not save yet, and the analytics
            consent flow is not built.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
