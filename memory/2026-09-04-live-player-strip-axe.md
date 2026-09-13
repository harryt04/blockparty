# Live player strip accessibility fix

## DEBUG REPORT

- Symptom: A fresh real `npm run dev` game had serious axe findings at 320 CSS pixels: `scrollable-region-focusable` on the horizontally scrollable player list and then on the bounded event history. The player component also created a duplicate `Players` landmark.
- Root cause: `PlayerStrip` wrapped its list in a second `section aria-label="Players"`, while the `ul.overflow-x-auto` and `div.overflow-y-auto` had no keyboard focus targets.
- Fix: `apps/web/src/components/game/player-strip.tsx` now renders one `Player list` with `tabIndex={0}`, and `apps/web/src/components/game/event-feed.tsx` makes the bounded history container focusable. The surrounding game section remains the single Players landmark.
- Evidence: Live axe reproduction found both scroll-region violations before the fixes. The regression contracts are in `apps/web/test/responsive-layout.test.ts`; fresh live axe verification and full repository gates are required after the patch.
- Related browser stability: WebKit entry tests also needed `serviceWorkers: "block"` so API route mocks cannot be bypassed by a previously registered shell worker.
- Evidence: Full CI passed with 278 tests (276 passed, 2 skipped); production build passed; the complete 57-test Chromium/Firefox/WebKit matrix passed, including the new 320px axe assertion.
- Status: DONE.
