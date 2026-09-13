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
import { AnalyticsPreferencePanel } from "@/components/analytics/analytics-provider";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PresentationPreferencesPanel } from "@/components/settings/presentation-preferences";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Settings</h1>
        <p className="text-muted-ink">
          These are your preferences on this device. They do not change the rules of any game.
        </p>

        <PresentationPreferencesPanel />

        <Card>
          <CardHeader>
            <CardTitle>Text size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-ink">
              Use your browser or system text size. The app reflows down to a 320 pixel width and up
              to 400 percent zoom. Nothing here blocks browser zoom.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data and analytics</CardTitle>
            <CardDescription>
              Presentation preferences above never leave this device. Analytics consent is a
              separate choice and is not inferred from these settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-ink">
              We keep the minimum: a name you chose for one game, an opaque seat credential, the
              game events, and service telemetry. Games are removed 30 days after the last action.
            </p>
          </CardContent>
        </Card>

        <AnalyticsPreferencePanel />
      </div>
    </AppShell>
  );
}
