# `npm run dev` playable-game investigation — 2026-09-06

## Symptom

With a MongoDB connection string present in the repository root `.env`,
`POST /api/games` returned HTTP 503 from `npm run dev`. A live bot game also
failed when the proposer tried to cancel a trade with a production-generated
trade ID.

## Root causes

1. The root script launched Next.js from `apps/web`, so Next.js did not load the
   root `.env`. After loading it, the configured remote MongoDB endpoint was
   unreachable, so the required game-creation transaction still could not run.
2. `TradeId` accepted at most 64 characters, while the engine generates IDs
   containing the UUID game ID and two UUID seat IDs. The pending-trade
   projection already allowed 128 characters, so exact advertised cancel,
   reject, and accept commands were rejected before authorization.

## Fixes

- Added a root Node launcher that loads `.env` and `.env.local`, prefers a
  healthy configured replica set, and otherwise starts an isolated loopback-only
  development replica set before spawning the web server. It never fabricates
  game state and does not change production or direct Next.js startup behavior.
- Normalized blank optional environment values to unset so `.env.example`
  remains valid for page-only boot.
- Increased the command trade-ID bound to 128 characters.
- Added `npm run agent:smoke`, a cookie-safe protocol harness that creates a
  bot game, starts it, submits legal projection-derived commands, observes bot
  decisions, and exercises a trade lifecycle.

## Evidence

- `npm run dev` detected the unreachable configured endpoint, started the local
  MongoDB replica set, and readiness returned `ready` with both checks `ok`.
- A live Playwright run created and started a host-plus-bot game and a two-human
  game using separate browser contexts. Both reached the real board with the
  expected player spots and zero browser console/page errors.
- `npm run agent:smoke` returned `ok: true`, 65 accepted commands,
  `botDecisionObserved: true`, and `tradeCycleObserved: true`.
- `pnpm run ci` passed 72 files and 292 tests (2 skipped); `pnpm build` passed.

## Regression test

- `apps/web/test/env.test.ts` covers blank optional values and configured URIs.
- `packages/contracts/test/common.test.ts` covers production-shaped trade IDs
  for cancel, accept, and reject commands.
- `tools/run-dev.test.ts` covers configured, unreachable, and absent database
  selection.

## Status

DONE — `npm run dev` supplies a healthy transactional database, and live bot and
human-only browser flows reach the game board.
