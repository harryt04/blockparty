/**
 * `/game/[gameId]/lobby` - the lobby. See UX section 2 and UX-012.
 *
 * The invite link with copy and share, participant seats, readiness, bot
 * controls, the settings summary, the host start control, and leave.
 *
 * The host alone changes settings and starts. A guest changes only personal
 * presentation preferences. See PRD-FUN-004.
 */
import type { Metadata } from "next";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { PlayerToken } from "@/components/game/player-token";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { stubLobby } from "@/server/stub-data";

export const metadata: Metadata = { title: "Lobby" };

export default async function LobbyPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  // TODO(ENG-003): authenticate the seat cookie and load the real projection.
  const lobby = stubLobby(gameId);
  const enabled = VARIANT_KEYS.filter((key) => lobby.configuration[key]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <h1 className="font-serif text-2xl">{lobby.name ?? "Lobby"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Invite</CardTitle>
          <CardDescription>
            Share this link with the people you want to play. It admits them to the lobby. It does
            not give host controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-url">Invite link</Label>
            <Input
              id="invite-url"
              readOnly
              value={lobby.invitePath ?? "Not issued in this build"}
              className="mt-1"
            />
          </div>
          {/* Copy feedback is textual and announced. See UX-010. */}
          <Button variant="secondary" disabled>
            Copy invite link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seats</CardTitle>
          <CardDescription>
            {lobby.seats.length} of {lobby.seatCount} seats filled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {lobby.seats.map((seat) => (
              <li
                key={seat.seatId}
                className="flex min-h-11 flex-wrap items-center gap-2 rounded-(--radius-md) border border-line px-3 py-2"
              >
                {seat.token !== undefined ? (
                  <PlayerToken token={seat.token} name={seat.name} />
                ) : null}
                <span className="font-medium">{seat.name ?? "Open seat"}</span>
                {seat.isHost ? <Badge variant="brand">Host</Badge> : null}
                {seat.kind === "bot" ? <Badge>Bot</Badge> : null}
                {!seat.connected ? <Badge variant="warning">Disconnected</Badge> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>
            Preset: {lobby.configuration.preset}. Content version {lobby.versions.contentVersion}.
            These lock when the game starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enabled.length === 0 ? (
            <p className="text-sm text-muted-ink">
              No optional rules are on. This is the standard game.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {enabled.map((key) => (
                <li key={key}>
                  <Badge variant="brand">{key}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="lg" disabled aria-describedby="start-reason">
          Start the game
        </Button>
        <Button variant="ghost">Leave the lobby</Button>
      </div>
      <p id="start-reason" className="text-sm text-muted-ink">
        {lobby.startBlockedReason}
      </p>

      <Alert variant="info">
        <AlertDescription>
          Anyone with the link can join until the game starts. Games are removed 30 days after the
          last action.
        </AlertDescription>
      </Alert>
    </div>
  );
}
