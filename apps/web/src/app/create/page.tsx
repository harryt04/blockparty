/**
 * `/create` - Create. See UX section 2 and UX-010, UX-012.
 *
 * Game name (optional, length-limited), player count 2-6, bot seats, the
 * ruleset and variant selector, the privacy note, and Create lobby.
 * Invalid combinations explain the fix inline.
 *
 * SCAFFOLD: the form is static. Submitting it to POST /api/games with
 * validation and inline errors is the create ticket.
 */
import type { Metadata } from "next";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { AppShell } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Create a game" };

/** Plain-language impact per toggle. See VAR-013. */
const VARIANT_COPY: Record<(typeof VARIANT_KEYS)[number], { label: string; warning: string }> = {
  restSpaceJackpot: {
    label: "Jackpot on The Stoop",
    warning: "Fees build a pot that one landing collects. Expect cash spikes.",
  },
  doubleStartOnExactLanding: {
    label: "Double pay for landing exactly on Sunup",
    warning: "More money enters the game and exact rolls gain value.",
  },
  noAuctionAfterDeclinedAcquisition: {
    label: "No auction after a declined Address",
    warning: "Less early cash pressure. Games tend to run longer.",
  },
  noIncomeWhileDetained: {
    label: "No income during a Noise Complaint",
    warning: "Much harsher. Players can be knocked out sooner.",
  },
  bonusForMatchingOnes: {
    label: "Bonus for rolling double ones",
    warning: "A rare extra payment. Stacks with the exact-Sunup bonus.",
  },
  startingAssetsDealt: {
    label: "Deal Addresses at the start",
    warning: "Faster ownership. Block opportunities can be uneven.",
  },
  relaxedEvenBuilding: {
    label: "Build without the even-spread rule",
    warning: "Concentrated rent spikes. Shorter, swingier games.",
  },
  unlimitedImprovementInventory: {
    label: "Unlimited Stalls and Block Stages",
    warning: "Removes a scarcity lever and may shorten the endgame.",
  },
};

export default function CreatePage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="font-serif text-2xl">Create a game</h1>

        <Card>
          <CardHeader>
            <CardTitle>Seats</CardTitle>
            <CardDescription>
              Two to six seats. Fill any seat you do not need with a bot. At least one seat stays
              open for a person.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label htmlFor="game-name">Game name (optional)</Label>
              <Input id="game-name" name="name" maxLength={48} className="mt-1" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="seat-count">Total seats</Label>
                <Input
                  id="seat-count"
                  name="seatCount"
                  type="number"
                  min={2}
                  max={6}
                  defaultValue={4}
                  className="tabular mt-1"
                />
              </div>
              <div>
                <Label htmlFor="bot-seats">Bot seats</Label>
                <Input
                  id="bot-seats"
                  name="botSeatCount"
                  type="number"
                  min={0}
                  max={5}
                  defaultValue={0}
                  className="tabular mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
            <CardDescription>
              Start from a preset, then change any of the eight options. Rules lock when the game
              starts.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Preset</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="preset" value="standard" defaultChecked />
                <span>
                  Standard
                  <span className="block text-sm text-muted-ink">
                    All eight options off. The closest to the canonical rules.
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="preset" value="short-game" />
                <span>
                  Short game
                  <span className="block text-sm text-muted-ink">
                    Deals Addresses at the start and relaxes even building. Shorter, but higher
                    variance.
                  </span>
                </span>
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">Options</legend>
              {VARIANT_KEYS.map((key) => (
                <label key={key} className="flex min-h-11 items-start gap-3">
                  <input type="checkbox" name={key} className="mt-1" />
                  <span>
                    {VARIANT_COPY[key].label}
                    <span className="block text-sm text-muted-ink">
                      {VARIANT_COPY[key].warning}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>

        <Alert variant="info">
          <AlertDescription>
            Anyone with the invite link can join until the game starts. Names are for this game
            only; do not use a real name. The game and its links are removed 30 days after the last
            action. For players aged 13 and over.
          </AlertDescription>
        </Alert>

        <Button variant="primary" size="lg" disabled>
          Create lobby
        </Button>
        <p className="text-sm text-muted-ink">
          Creating a lobby is not wired up yet in this scaffolding build.
        </p>
      </div>
    </AppShell>
  );
}
