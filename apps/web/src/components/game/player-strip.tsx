/**
 * The player strip. Horizontally scrollable with a visible clipping
 * affordance; each entry carries name, token shape and pattern, balance,
 * status, and the turn marker. See UX-030 and DS-030.
 */
import type { SeatProjection } from "@blockparty/contracts";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/components/display-names";
import { PlayerToken } from "./player-token";
import { cn } from "@/lib/utils";

export function PlayerStrip({
  seats,
  activeSeatId,
  currencyLabel = "Tabs",
  className,
}: {
  seats: readonly SeatProjection[];
  activeSeatId?: string;
  currencyLabel?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label="Player list"
      className={cn("flex gap-3 overflow-x-auto pb-2", className)}
      tabIndex={0}
    >
      {seats.map((seat) => {
        const isActive = seat.seatId === activeSeatId;
        return (
          <li
            key={seat.seatId}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "min-w-40 shrink-0 rounded-(--radius-md) border bg-surface-raised p-3",
              // The current turn takes a border and a label, not color alone.
              isActive ? "border-2 border-brand" : "border-line",
            )}
          >
            <div className="flex items-center gap-2">
              {seat.token !== undefined ? (
                <PlayerToken token={seat.token} name={seat.name} />
              ) : null}
              <span className="truncate font-medium">{seat.name ?? "Open seat"}</span>
            </div>

            <p className="tabular mt-1 text-sm">
              {seat.balance === undefined
                ? "No balance yet"
                : formatMoney(seat.balance, currencyLabel)}
            </p>
            {seat.position === undefined ? null : (
              <p className="text-xs text-muted-ink">
                Stop {seat.position} · {seat.deedIds?.length ?? 0} Addresses
              </p>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              {isActive ? <Badge variant="brand">Their turn</Badge> : null}
              {seat.kind === "bot" ? <Badge>Bot</Badge> : null}
              {seat.isHost ? <Badge>Host</Badge> : null}
              {!seat.connected ? <Badge variant="warning">Disconnected</Badge> : null}
              {seat.detained === true ? <Badge variant="warning">Noise Complaint</Badge> : null}
              {seat.status === "eliminated" ? <Badge variant="danger">Packed Up</Badge> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
