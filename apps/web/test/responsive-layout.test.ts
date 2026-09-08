import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const gameClient = readFileSync(
  new URL("../src/components/game/game-client.tsx", import.meta.url),
  "utf8",
);
const actionBar = readFileSync(
  new URL("../src/components/game/action-bar.tsx", import.meta.url),
  "utf8",
);
const playerStrip = readFileSync(
  new URL("../src/components/game/player-strip.tsx", import.meta.url),
  "utf8",
);
const eventFeed = readFileSync(
  new URL("../src/components/game/event-feed.tsx", import.meta.url),
  "utf8",
);
const boardView = readFileSync(
  new URL("../src/components/game/board-view.tsx", import.meta.url),
  "utf8",
);
const propertyHand = readFileSync(
  new URL("../src/components/game/property-hand.tsx", import.meta.url),
  "utf8",
);
const mobileNav = readFileSync(
  new URL("../src/components/game/mobile-game-nav.tsx", import.meta.url),
  "utf8",
);

describe("responsive game shell contract", () => {
  it("defines the documented phone, tablet, desktop, and landscape modes", () => {
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(stylesheet).toContain("@media (min-width: 48rem)");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr) minmax(20rem, 25rem);");
    expect(stylesheet).toContain("@media (min-width: 64rem)");
    expect(stylesheet).toContain(
      "grid-template-columns: minmax(15rem, 15rem) minmax(0, 1fr) minmax(18rem, 18rem);",
    );
    expect(stylesheet).toContain("@media (orientation: landscape) and (max-height: 40rem)");
    expect(stylesheet).toContain("minmax(17rem, 43%)");
  });

  it("protects 320px core play from safe-area and page overflow failures", () => {
    expect(stylesheet).toContain("overflow-x: clip");
    expect(stylesheet).toContain("env(safe-area-inset-left)");
    expect(stylesheet).toContain("env(safe-area-inset-right)");
    expect(stylesheet).toContain("env(safe-area-inset-bottom)");
    expect(stylesheet).toContain("height: clamp(16rem, 75vw, 22rem)");
    expect(gameClient).toContain('data-responsive-region="board"');
    expect(gameClient).toContain('data-responsive-region="context-panel"');
    expect(gameClient).toContain('data-responsive-region="player-rail"');
    expect(stylesheet).toContain(".game-player-rail {\n    order: 2;");
    expect(stylesheet).toContain(".game-context {\n    order: 3;");
  });

  it("provides a compact mobile status, in-board zoom, and section navigation", () => {
    expect(gameClient).toContain('aria-label="Current game status"');
    expect(gameClient).toContain("data-mobile-cash");
    expect(gameClient).toContain("data-mobile-debt");
    expect(gameClient).toContain("data-mobile-roll");
    expect(gameClient).toContain("Follow active space");
    expect(gameClient).toContain("zoom={boardZoom}");
    expect(mobileNav).toContain('label: "Board"');
    expect(mobileNav).toContain('label: "Properties"');
    expect(mobileNav).toContain('label: "Trade"');
    expect(mobileNav).toContain('label: "History"');
    expect(stylesheet).toContain(".game-board-pan-viewport");
    expect(stylesheet).toContain("touch-action: pan-x pan-y");
    expect(stylesheet).toContain("@media (max-width: 47.99rem)");
    expect(stylesheet).not.toContain("user-scalable=no");
  });

  it("keeps the visual board semantic and equivalent to the ordered list", () => {
    expect(stylesheet).toContain("grid-template-columns: repeat(11, minmax(0, 1fr));");
    expect(stylesheet).toContain("grid-template-rows: repeat(11, minmax(0, 1fr));");
    expect(boardView).toContain('data-board-topology="perimeter-40"');
    expect(boardView).toContain('aria-controls="active-space-detail"');
    expect(boardView).toContain("onSelect(space.spaceId)");
    expect(gameClient).toContain("districtNames={districtMap}");
  });

  it("keeps the action surface reachable on phones and in landscape", () => {
    expect(actionBar).toContain('className="game-action-bar z-10 border-t border-line bg-surface"');
    expect(stylesheet).toContain(".game-action-bar {\n    position: fixed;");
    expect(stylesheet).toContain(".game-action-bar {\n      position: sticky;");
  });

  it("keeps the narrow player strip keyboard-scrollable without a duplicate landmark", () => {
    expect(playerStrip).toContain('aria-label="Player list"');
    expect(playerStrip).toContain("tabIndex={0}");
    expect(playerStrip).not.toContain('<section aria-label="Players"');
  });

  it("uses the desktop three-region workspace and keeps the local hand below the board", () => {
    expect(stylesheet).toContain(
      "grid-template-columns: minmax(15rem, 15rem) minmax(0, 1fr) minmax(18rem, 18rem);",
    );
    expect(stylesheet).toContain("flex-direction: column;");
    expect(gameClient).toContain('data-responsive-region="player-rail"');
    expect(gameClient).toContain("<PropertyHand");
    expect(gameClient.indexOf("<PropertyHand")).toBeGreaterThan(gameClient.indexOf("<BoardView"));
    expect(gameClient.indexOf("<PropertyHand")).toBeLessThan(
      gameClient.indexOf('data-responsive-region="context-panel"'),
    );
    expect(propertyHand).toContain('data-property-hand="local"');
    expect(propertyHand).toContain("data-property-group={group.groupId}");
    expect(propertyHand).toContain("data-deed-id={deed.deedId}");
  });

  it("keeps the bounded event history keyboard-scrollable", () => {
    expect(eventFeed).toContain('className="max-h-80 overflow-y-auto px-4 pb-4" tabIndex={0}');
  });
});
