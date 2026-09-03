/**
 * `/game/[gameId]` - the responsive game shell. See UX-030 to UX-033.
 *
 * Mobile (375 px first): a single column of focused board viewport, active
 * space detail, a horizontally scrollable player strip, a collapsible event
 * feed, and a fixed bottom action bar.
 *
 * Tablet and desktop widen the same markup into split panels with CSS only.
 * The board never becomes an opaque canvas, and BoardList is always present
 * as the non-spatial equivalent.
 */
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { ActiveSpaceDetail } from "@/components/game/active-space-detail";
import { ActionBar } from "@/components/game/action-bar";
import { BoardList } from "@/components/game/board-list";
import { BoardView, type LayoutMap } from "@/components/game/board-view";
import { EventFeed } from "@/components/game/event-feed";
import { PlayerStrip } from "@/components/game/player-strip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { stubSnapshot } from "@/server/stub-data";

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  // TODO(ENG-003): authenticate the seat cookie and call the bootstrap path.
  // A page that cannot authenticate shows the join route, not this shell.
  const snapshot = stubSnapshot(gameId);

  const layout: LayoutMap = Object.fromEntries(
    PLACEHOLDER_BUNDLE.spaces.map((space) => [space.spaceId, space.layout]),
  );
  const currencyLabel = PLACEHOLDER_BUNDLE.economy.currencyLabel;
  const activeSpace = snapshot.board[0];

  return (
    <div className="flex min-h-full flex-col">
      {/* Bottom padding keeps content clear of the sticky action bar. */}
      <div className="flex flex-1 flex-col gap-4 px-4 pb-28 pt-4 lg:flex-row lg:px-8">
        {/* Board region. Widens on desktop; never a dashboard. UX-032. */}
        <section aria-label="Board" className="flex flex-col gap-4 lg:flex-1">
          <BoardView
            spaces={snapshot.board}
            layout={layout}
            selectedSpaceId={activeSpace?.spaceId}
            className="aspect-square max-h-[60vh] w-full max-w-2xl self-center"
          />
          <PlayerStrip
            seats={snapshot.seats}
            activeSeatId={snapshot.activeSeatId}
            currencyLabel={currencyLabel}
          />
        </section>

        {/* Contextual panel. Below on mobile, beside on tablet/desktop. */}
        <div className="flex flex-col gap-4 lg:w-96 lg:shrink-0">
          <ActiveSpaceDetail
            space={activeSpace}
            seats={snapshot.seats}
            currencyLabel={currencyLabel}
          />

          <EventFeed events={[]} />

          <section aria-label="Board list">
            <details className="rounded-(--radius-lg) border border-line bg-surface-raised">
              <summary className="min-h-11 cursor-pointer list-none px-4 py-3 font-medium">
                Board list ({snapshot.board.length} stops)
              </summary>
              <div className="max-h-96 overflow-y-auto px-4 pb-4">
                <BoardList
                  spaces={snapshot.board}
                  seats={snapshot.seats}
                  currencyLabel={currencyLabel}
                />
              </div>
            </details>
          </section>

          <Alert variant="warning">
            <AlertDescription>
              Scaffolding build. The board and players are placeholder content. No rules run and
              nothing is saved.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <ActionBar
        legalActions={snapshot.legalActions}
        actionAvailability={snapshot.actionAvailability}
        statusText="Waiting for the rules engine to be built."
      />
    </div>
  );
}
