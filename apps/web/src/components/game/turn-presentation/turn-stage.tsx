import type { GameSnapshotProjection } from "@blockparty/contracts";
import { DicePair } from "./dice-pair";
import type { PresentationStage } from "./turn-presentation-model";

function actorName(snapshot: GameSnapshotProjection, seatId?: string): string {
  if (seatId === undefined) return "The table";
  return snapshot.seats.find((seat) => seat.seatId === seatId)?.name ?? "A player";
}

function botReasonCopy(reasonCode: unknown): string | undefined {
  const copy: Readonly<Record<string, string>> = {
    ACQUIRE_WITH_RESERVE: "bought this Property and kept a cash reserve",
    DECLINE_BELOW_RESERVE: "declined to protect its cash reserve",
    BID_BELOW_VALUATION: "raised the bid within its valuation",
    PASS_ABOVE_VALUATION: "passed because the price exceeded its valuation",
    LIQUIDATE_FOR_OBLIGATION: "sold or mortgaged an asset to cover what it owes",
    SAFE_END_OR_PASS: "had no stronger legal move and ended the turn",
  };
  return typeof reasonCode === "string" ? copy[reasonCode] : undefined;
}

function stageCopy(snapshot: GameSnapshotProjection, stage: PresentationStage): string {
  const name = actorName(snapshot, stage.actorSeatId);
  switch (stage.eventType) {
    case "TurnStarted":
      return `${name}'s turn`;
    case "BotDecisionExplained":
      return `${name} ${botReasonCopy(stage.reasonCode) ?? "made a confirmed Computer choice"}.`;
    case "DiceRolled":
      return `${name} rolled.`;
    case "TokenMoved":
      return `${name} moved to the confirmed destination.`;
    case "DeedAcquired":
      return `${name} acquired a Property.`;
    case "RentPaid":
    case "FeePaid":
    case "BankPaymentCollected":
    case "PlayerPaymentCollected":
      return `${name} completed a confirmed payment.`;
    case "CardDrawn":
      return `${name} drew a card.`;
    case "DetentionEntered":
      return `${name} entered Detention.`;
    case "DetentionReleased":
      return `${name} left Detention.`;
    case "TurnEnded":
      return `${name} ended the turn.`;
    default:
      return `${name} completed a confirmed table update.`;
  }
}

export function TurnStage({
  snapshot,
  stage,
  onSkip,
  onReplay,
  canReplay,
  queueLength,
  onSkipToLive,
}: {
  snapshot: GameSnapshotProjection;
  stage?: PresentationStage;
  onSkip: () => void;
  onReplay: () => void;
  canReplay: boolean;
  queueLength: number;
  onSkipToLive: () => void;
}) {
  const dice = stage?.dice;
  return (
    <div className="game-turn-stage" aria-label="Current turn presentation">
      <p className="text-xs font-medium uppercase tracking-wide">Turn stage</p>
      <p className="mt-1 font-serif text-lg">
        {stage === undefined
          ? `${actorName(snapshot, snapshot.activeSeatId)}'s turn`
          : stageCopy(snapshot, stage)}
      </p>
      {dice === undefined ? null : (
        <div className="mt-2">
          <p className="text-sm font-semibold">
            Server roll:{" "}
            <span className="tabular">
              {dice[0]} + {dice[1]} = {dice[0] + dice[1]}
            </span>
          </p>
          <DicePair dice={dice} animate />
        </div>
      )}
      {stage?.movement !== undefined ? (
        <p className="mt-1 text-xs">Confirmed movement · {stage.movement.path.length - 1} stops</p>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {stage === undefined ? null : (
          <button type="button" className="game-presentation-control" onClick={onSkip}>
            Skip animation
          </button>
        )}
        {queueLength > 0 ? (
          <button type="button" className="game-presentation-control" onClick={onSkipToLive}>
            Skip to live
          </button>
        ) : null}
        {canReplay ? (
          <button type="button" className="game-presentation-control" onClick={onReplay}>
            Replay last turn
          </button>
        ) : null}
      </div>
    </div>
  );
}
