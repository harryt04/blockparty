# `npm run dev` runtime investigation — 2026-09-04

## Symptom

`npm run dev` failed during Next.js instrumentation compilation because the
shared instrumentation entry imported the MongoDB driver. The resulting
server dependency graph attempted to bundle Node’s `net` module. After that
was fixed, a live MongoDB command returned HTTP 503 even though its transaction
had committed, and the first live bootstrap also returned HTTP 503.

## Root causes

1. `src/instrumentation.ts` imported the server database client directly. The
   instrumentation entry must remain runtime-neutral until the Node runtime is
   selected.
2. MongoDB mutates inserted document objects by adding `_id`. The command path
   reused those event objects to construct the ACK/publication result, so the
   strict domain-event parser rejected the storage-only field after commit.
3. Optional engine fields written as JavaScript `undefined` could be returned as
   BSON `null`, while projection and engine code use `undefined` to represent
   absence.

## Fixes

- Added a Node-only instrumentation module and moved shutdown registration
  behind the runtime guard.
- Added lifecycle shutdown-handler registration so the database adapter can
  register its close operation without being imported by instrumentation.
- Persist copies of domain events and remove any storage `_id` at the public
  event boundary.
- Set MongoDB `ignoreUndefined: true` and normalize legacy BSON nulls at the
  server state boundary before projection or engine resolution.

## Evidence

- `npm run dev` with no MongoDB configuration: starts, serves `/` with HTTP
  200, and reports `/api/health/ready` as degraded with
  `database: not_configured`.
- `npm run dev` with a temporary local MongoDB replica set: readiness returned
  ready; the live flow created a game, started it, loaded bootstrap, rolled
  dice, and declined an acquisition. Every command ACK and bootstrap returned
  successfully.
- `pnpm run ci`: formatting, typecheck, lint, 61 test files, 263 passing tests,
  and 2 intentional skips.
- `pnpm build`: passed without MongoDB configuration.

## Concerns

The shared browser skill could not run because its one-time browser binary was
not installed in this environment. The live journey was therefore exercised
through the same HTTP API contracts and authenticated cookie flow; a browser
journey remains follow-up evidence.

## Iteration 5 follow-up

The dev server also exposed a cold-hydration race: an enabled server-rendered
create or join button could submit its native form before the React handler
mounted. Both mutation buttons now remain disabled until hydration, with a
Playwright regression covering the server-rendered boundary.

A real two-context journey using a temporary MongoDB replica set now reaches
create, invite join, lobby start, and RollDice. The lobby client also stops
refreshing after the authoritative state becomes ACTIVE, avoiding a repeated
409 loop while the route changes to the game. A single in-flight 409 can still
occur during the intentional SSE handoff, but it does not block navigation or
gameplay.

## Iteration 6 follow-up

The real browser flow reached the active game and exposed a React duplicate-key
warning after a fee landing. The engine advertises repeated blocked
`RequestScarceImprovement` actions without constraints in `ActionAvailability`,
so the action sheet must namespace its legal and blocked render keys and include
an occurrence index. The pure key helper now has a regression test in
`apps/web/test/action-bar.test.ts`; a corrected live smoke run reaches `Your turn`
after a persisted roll with no duplicate-key warning. The same run showed that
the authoritative `DiceRolled` event uses its canonical `dice` array, so
`latestDiceResult` now reads that payload while retaining legacy fixture support.
The lobby client also aborts an in-flight lobby request when the game becomes
ACTIVE, eliminating the transient 409 console error during the SSE handoff.
Final live smoke evidence: both isolated player contexts created/joined/started
a game and rolled through the UI; the active player saw `Your turn` and the
latest roll, and no browser console errors were recorded.
