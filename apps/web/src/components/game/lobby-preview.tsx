"use client";

import type { LobbyProjection, SeatProjection } from "@blockparty/contracts";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerToken } from "./player-token";
import {
  CLASSIC_LOBBY_SPACES,
  seatKindLabel,
  seatStatusLabel,
  startCondition,
} from "./lobby-model";

const DISTRICT_CLASSES: Record<string, string> = {
  "district-ash": "border-t-4 border-t-asset-district-north",
  "district-moonfen": "border-t-4 border-t-asset-district-east",
  "district-rosecoil": "border-t-4 border-t-asset-district-west",
  "district-copperwake": "border-t-4 border-t-player-4",
  "district-starling": "border-t-4 border-t-player-2",
  "district-thornlight": "border-t-4 border-t-player-5",
  "district-nightjar": "border-t-4 border-t-player-3",
  "district-crown": "border-t-4 border-t-player-6",
};

const spaceByRouteIndex = new Map(CLASSIC_LOBBY_SPACES.map((space) => [space.routeIndex, space]));
const deedById = new Map(CLASSIC_BUNDLE.deeds.map((deed) => [deed.deedId, deed]));

function spaceLabel(type: (typeof CLASSIC_LOBBY_SPACES)[number]["type"]): string {
  if (type === "deed") return "Property";
  if (type === "eventDraw") return "Event deck";
  if (type === "fee") return "Fee";
  if (type === "detention") return "Detention";
  if (type === "sendToDetention") return "Send to Detention";
  if (type === "rest") return "Rest";
  return "Start";
}

function MiniBoard() {
  return (
    <div
      aria-label="Classic 40-space board preview"
      className="grid aspect-square min-w-0 grid-cols-11 grid-rows-11 gap-px rounded-(--radius-md) border-2 border-brand bg-line p-1"
      role="img"
    >
      <div className="col-span-9 row-span-9 col-start-2 row-start-2 flex items-center justify-center bg-canvas p-2 text-center text-xs text-muted-ink">
        <span>Classic table preview</span>
      </div>
      {Array.from({ length: 40 }, (_, routeIndex) => {
        const space = spaceByRouteIndex.get(routeIndex);
        if (space === undefined) return null;
        const deed = space.deedId === undefined ? undefined : deedById.get(space.deedId);
        const group = deed?.districtId;
        return (
          <div
            key={space.spaceId}
            className={`min-w-0 overflow-hidden bg-surface-raised p-0.5 text-[8px] leading-tight text-ink ${
              group === undefined ? "" : (DISTRICT_CLASSES[group] ?? "")
            }`}
            style={{
              gridColumn: space.layout.x + 1,
              gridRow: space.layout.y + 1,
            }}
            title={`${space.routeIndex + 1}. ${space.name} — ${spaceLabel(space.type)}`}
          >
            <span className="block truncate font-semibold">{space.name}</span>
            <span className="block truncate text-muted-ink">{spaceLabel(space.type)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeatCard({
  seat,
  viewerIsHost,
  commandPending,
  onRemoveComputer,
}: {
  seat: SeatProjection;
  viewerIsHost: boolean;
  commandPending: boolean;
  onRemoveComputer: (seatId: string) => void;
}) {
  const isOpen = seat.kind === "open";
  return (
    <li
      className={`min-w-0 rounded-(--radius-md) border p-3 ${
        isOpen ? "border-dashed border-line bg-canvas" : "border-line bg-surface-raised"
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {seat.token === undefined ? null : <PlayerToken token={seat.token} name={seat.name} />}
          <div className="min-w-0">
            <p className="truncate font-medium">{seat.name ?? "Open Human seat"}</p>
            <p className="text-sm text-muted-ink">{seatKindLabel(seat.kind)}</p>
          </div>
        </div>
        {seat.kind === "bot" && viewerIsHost ? (
          <Button
            aria-label={`Remove ${seat.name ?? "Computer"}`}
            disabled={commandPending}
            onClick={() => onRemoveComputer(seat.seatId)}
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge>{seatKindLabel(seat.kind)}</Badge>
        {seat.isHost ? <Badge variant="brand">Host</Badge> : null}
        {seat.isSelf ? <Badge variant="info">You</Badge> : null}
        <Badge variant={isOpen ? "warning" : seat.connected ? "success" : "warning"}>
          {seatStatusLabel(seat.kind, seat.connected)}
        </Badge>
      </div>
    </li>
  );
}

export function LobbyPreview({
  lobby,
  commandPending,
  onAddComputer,
  onRemoveComputer,
}: {
  lobby: LobbyProjection;
  commandPending: boolean;
  onAddComputer: () => void;
  onRemoveComputer: (seatId: string) => void;
}) {
  const openSeats = lobby.seats.filter((seat) => seat.kind === "open").length;
  return (
    <CardShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Table preview</h2>
          <p className="mt-1 text-sm text-muted-ink">
            Choose the remaining Human seats or fill them with Computers. The table stays open until
            the host starts it.
          </p>
        </div>
        {lobby.viewerIsHost && openSeats > 0 ? (
          <Button disabled={commandPending} onClick={onAddComputer} size="sm">
            Add a Computer
          </Button>
        ) : null}
      </div>
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.75fr)] lg:items-start">
        <MiniBoard />
        <div className="min-w-0">
          <p className="text-sm font-medium" id="seat-tray-heading">
            Seat tray · {lobby.seats.filter((seat) => seat.kind !== "open").length} of{" "}
            {lobby.seatCount} filled
          </p>
          <ul
            aria-labelledby="seat-tray-heading"
            className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1"
          >
            {lobby.seats.map((seat) => (
              <SeatCard
                commandPending={commandPending}
                key={seat.seatId}
                onRemoveComputer={onRemoveComputer}
                seat={seat}
                viewerIsHost={lobby.viewerIsHost}
              />
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-sm" role="status">
        {startCondition(lobby)}
      </p>
    </CardShell>
  );
}

function CardShell({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-line bg-surface p-4">
      {children}
    </section>
  );
}
