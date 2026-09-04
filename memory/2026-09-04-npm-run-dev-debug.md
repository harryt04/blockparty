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
