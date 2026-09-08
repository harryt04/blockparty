import { PlayerToken } from "../game/player-token";
import type { SeatTrayEntry } from "./seat-tray-model";

function kindLabel(kind: SeatTrayEntry["kind"]): string {
  if (kind === "host") return "Host";
  if (kind === "bot") return "Computer";
  return "Human";
}

export function SeatTray({ seats }: { readonly seats: readonly SeatTrayEntry[] }) {
  return (
    <section aria-labelledby="seat-tray-heading" className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 id="seat-tray-heading" className="font-serif text-lg">
          Seat preview
        </h3>
        <p className="text-sm text-muted-ink">
          Preview only. The server confirms seats when the lobby is created.
        </p>
      </div>
      <ol className="grid min-w-0 gap-2 sm:grid-cols-2">
        {seats.map((seat) => (
          <li
            key={seat.id}
            className="flex min-h-16 min-w-0 items-center gap-3 rounded-(--radius-md) border border-line bg-surface px-3 py-2"
          >
            {seat.token === undefined ? (
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted-ink"
              >
                ?
              </span>
            ) : (
              <PlayerToken token={seat.token} name={seat.label} className="shrink-0" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{seat.label}</span>
              <span className="block text-sm text-muted-ink">{kindLabel(seat.kind)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export { setupSeatTrayEntries } from "./seat-tray-model";
export type { SeatTrayEntry, SetupSeatTrayProps } from "./seat-tray-model";
