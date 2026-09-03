/**
 * `/accessibility` - the accessibility statement. See UX section 2 and UX-040.
 * Linked from every shell footer.
 */
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Accessibility" };

const COMMITMENTS = [
  "Every decision has a keyboard and screen-reader path. Nothing needs a mouse.",
  "The board is real page content plus a plain list of stops. It is never a picture you cannot read.",
  "Colour is never the only signal. Ownership, turn, and urgency also use shape, pattern, and text.",
  "Every control is at least 44 by 44 pixels, and focus is always visible.",
  "The layout reflows at 320 pixels wide and at 400 percent zoom. Browser zoom is never blocked.",
  "Animation respects your reduced-motion setting, and no outcome depends on movement you cannot see.",
  "Sound and haptics are off unless you turn them on, and no information is sound-only.",
  "Announcements are restrained: turns, results, required decisions, and connection changes only.",
];

export default function AccessibilityPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Accessibility</h1>
        <p className="text-muted-ink">
          The target is WCAG 2.2 AA for everything this app renders.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>What we commit to</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              {COMMITMENTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Alert variant="warning">
          <AlertDescription>
            Scaffolding build. The accessibility test record is not complete,
            so this is a statement of intent rather than a verified claim.
          </AlertDescription>
        </Alert>
      </div>
    </AppShell>
  );
}
