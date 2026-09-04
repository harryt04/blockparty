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

describe("responsive game shell contract", () => {
  it("defines the documented phone, tablet, desktop, and landscape modes", () => {
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(stylesheet).toContain("@media (min-width: 48rem)");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr) minmax(20rem, 25rem);");
    expect(stylesheet).toContain("@media (min-width: 64rem)");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr) minmax(20rem, 22rem);");
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
    expect(gameClient.indexOf('data-responsive-region="player-strip"')).toBeGreaterThan(
      gameClient.indexOf("<ActiveSpaceDetail"),
    );
  });

  it("keeps the action surface reachable on phones and in landscape", () => {
    expect(actionBar).toContain('className="game-action-bar z-10 border-t border-line bg-surface"');
    expect(stylesheet).toContain(".game-action-bar {\n    position: fixed;");
    expect(stylesheet).toContain(".game-action-bar {\n      position: sticky;");
  });
});
