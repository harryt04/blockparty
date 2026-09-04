/**
 * Recovery is explicit and server-driven: reconnecting disables gameplay,
 * reclaim needs the separate claim, host actions need host authority, and no-
 * contest is irreversible. See PRD-FUN-012/014/019 and UX-018.
 */
import type { Command, GameSnapshotProjection } from "@blockparty/contracts";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recoveryDecisionContext } from "./game-model";

export function RecoveryPanel({
  snapshot,
  disabled = false,
  pending = false,
  onCommand,
  onClaimHost,
}: {
  snapshot: GameSnapshotProjection;
  disabled?: boolean;
  pending?: boolean;
  onCommand: (command: Command) => void;
  onClaimHost: () => void;
}) {
  const context = recoveryDecisionContext(snapshot);
  const [confirmation, setConfirmation] = useState<
    { type: "replace"; seatId: string } | { type: "no-contest" }
  >();
  const hasRecoveryContent =
    snapshot.paused ||
    context.viewerCanRequestReclaim ||
    context.viewerCanClaimHost ||
    context.replacementSeats.length > 0 ||
    context.pendingReclaimName !== undefined ||
    context.canEndNoContest;
  if (!hasRecoveryContent) return null;

  const disconnectedNames = snapshot.seats
    .filter((seat) => !seat.connected && seat.kind === "human")
    .map((seat) => seat.name ?? "A player");

  return (
    <Card aria-labelledby="recovery-heading" className="border-warning/70">
      <CardHeader>
        <CardTitle id="recovery-heading">Recovery and host controls</CardTitle>
        {snapshot.paused ? (
          <Alert variant="warning">
            <AlertTitle>Play is paused</AlertTitle>
            <AlertDescription>
              {disconnectedNames.length > 0
                ? `${disconnectedNames.join(", ")} must reconnect before the required action can continue.`
                : "The required player must reconnect before play can continue."}{" "}
              No action will be submitted automatically.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {context.viewerCanClaimHost ? (
          <section className="space-y-2" aria-label="Host transfer">
            <p className="text-sm">
              Host authority is ready for this connected seat. Claim it to access host controls.
            </p>
            <Button onClick={onClaimHost} disabled={disabled || pending}>
              Claim host controls
            </Button>
          </section>
        ) : null}

        {context.viewerCanRequestReclaim ? (
          <section className="space-y-2" aria-label="Seat reclaim">
            <p className="text-sm">
              Your seat is currently represented by the bot. Request reclaim; the host must approve
              before control returns at a safe command boundary.
            </p>
            <Button
              onClick={() => onCommand({ type: "RequestSeatReclaim" })}
              disabled={disabled || pending}
            >
              Request seat reclaim
            </Button>
          </section>
        ) : null}

        {context.pendingReclaimName !== undefined ? (
          <section className="space-y-2" aria-label="Pending seat reclaim">
            <p className="text-sm">
              {context.pendingReclaimName} requested reclaim. Approval waits for a safe command
              boundary and then issues a new seat credential.
            </p>
            {context.viewerIsHost ? (
              <Button
                onClick={() =>
                  onCommand({
                    type: "ApproveSeatReclaim",
                    seatId: snapshot.recovery.pendingSeatReclaimId!,
                  })
                }
                disabled={disabled || pending || !context.safeBoundary}
              >
                Approve {context.pendingReclaimName}&apos;s reclaim
              </Button>
            ) : null}
          </section>
        ) : null}

        {context.viewerIsHost && context.replacementSeats.length > 0 ? (
          <section className="space-y-2" aria-label="Replace disconnected seat">
            <p className="text-sm">
              A disconnected human keeps their seat and assets. Replacement is available only at a
              safe command boundary and leaves a separate reclaim claim.
            </p>
            {context.replacementSeats.map((seat) => (
              <Button
                key={seat.seatId}
                variant="secondary"
                onClick={() => setConfirmation({ type: "replace", seatId: seat.seatId })}
                disabled={disabled || pending || !context.safeBoundary}
              >
                Replace {seat.name} with the bot
              </Button>
            ))}
          </section>
        ) : null}

        {confirmation?.type === "replace" ? (
          <div
            className="rounded-(--radius-md) border-2 border-danger bg-danger/5 p-3"
            role="alert"
          >
            <p className="font-medium">Replace this disconnected seat?</p>
            <p className="mt-1 text-sm">
              The old seat command credential will be revoked. The player keeps their assets and a
              separate reclaim claim; this change cannot happen during an unresolved action.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onCommand({ type: "ReplaceSeatWithBot", seatId: confirmation.seatId });
                  setConfirmation(undefined);
                }}
                disabled={disabled || pending}
              >
                Confirm bot replacement
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmation(undefined)}
                disabled={pending}
              >
                Keep the seat
              </Button>
            </div>
          </div>
        ) : null}

        {context.canEndNoContest ? (
          <section className="space-y-2 border-t border-line pt-4" aria-label="End game">
            <p className="text-sm">
              The host can end this private game without recording a winner. Every connected player
              sees the confirmation and the result cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={() => setConfirmation({ type: "no-contest" })}
              disabled={disabled || pending || !context.safeBoundary}
            >
              End game without a result
            </Button>
          </section>
        ) : null}

        {confirmation?.type === "no-contest" ? (
          <div
            className="rounded-(--radius-md) border-2 border-danger bg-danger/5 p-3"
            role="alert"
          >
            <p className="font-medium">End the game with no winner?</p>
            <p className="mt-1 text-sm">
              This is permanent. The game will become read-only, no winner will be recorded, and its
              final event history will remain available until normal expiry.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  onCommand({ type: "EndNoContest" });
                  setConfirmation(undefined);
                }}
                disabled={disabled || pending}
              >
                Confirm no-contest ending
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmation(undefined)}
                disabled={pending}
              >
                Keep playing
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
