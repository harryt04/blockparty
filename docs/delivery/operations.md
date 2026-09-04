# Operations

**Status:** normative deployment and runbook contract

Blockparty deploys as one Coolify-managed Node service built from this repository.
MongoDB is deployed and operated separately as a private replica set; the web
service reaches it only through `MONGODB_URI`. There is no application Docker
Compose topology and no Redis service. Maintenance and cleanup run from the same
web image as the application.

## OPS-001 — Ownership and environments

The operator owns development, staging, and production configuration; the
project owner owns release approval. Each environment records its public URL,
web image/build revision, content version, MongoDB cluster, backup target, alert
destinations, and rollback owner. Production is HTTPS-only behind Coolify's
proxy, and MongoDB is never public.

## OPS-002 — Coolify and MongoDB topology

Coolify runs one Node 22 web service using `pnpm install --frozen-lockfile`,
`pnpm build`, and `pnpm start`. Health probes use `/api/health/live` for process
liveness and `/api/health/ready` for dependency readiness. The separately
deployed MongoDB URI names a replica set and supports transactions and change
streams. Scale beyond one web instance requires measured evidence that
process-local SSE coordination is sufficient or a documented coordination
change.

## OPS-003 — Environment and secrets inventory

[`.env.example`](../../.env.example) is the exact configuration inventory:

- runtime: `NEXT_PUBLIC_APP_URL`, `NODE_ENV`, `PORT`;
- MongoDB: `MONGODB_URI`, `MONGODB_DB`;
- capability cookies: `COOKIE_SECRET`;
- request trust: `ALLOWED_ORIGINS`;
- compatibility: `PROTOCOL_VERSION`, `APP_VERSION`, `CONTENT_VERSION`,
  `PWA_CACHE_VERSION`;
- maintenance: `INTERNAL_CLEANUP_SECRET`;
- limits: `RATE_LIMIT_CREATE_PER_MINUTE`, `RATE_LIMIT_JOIN_PER_MINUTE`,
  `RATE_LIMIT_COMMANDS_PER_MINUTE`, `RATE_LIMIT_SYNC_PER_MINUTE`,
  `RATE_LIMIT_SSE_CONNECTIONS`;
- consent-gated analytics: `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST`.

Secrets live in the deployment secret store, rotate through a recorded procedure,
and never use `NEXT_PUBLIC_*`. An unset `MONGODB_URI` is valid for local build and
page rendering but makes readiness degraded and cannot serve real games.

## OPS-004 — Deploy and migration

Deploy an immutable revision only after `pnpm run ci` and `pnpm build` pass.
Before traffic shifts, apply idempotent indexes and compatible migrations from
the same image, verify readiness, then smoke create/join/play/reconnect in staging.
Schema and content readers for every unexpired game ship before writers produce
the new version.

## OPS-005 — Rollback and graceful shutdown

Rollback restores the prior web revision without rolling back durable events.
Deploys first stop admitting commands, finish in-flight command transactions,
close SSE streams with `SERVER_SHUTDOWN`, and then exit. Rollback is safe only
while the prior revision reads every version written by the newer revision;
otherwise use the forward repair documented with the migration.

## OPS-006 — Logs, metrics, and alerts

Structured logs contain request/correlation IDs, safe codes, latency, versions,
and aggregate operational counts. They exclude capabilities, invite values,
cookies, seeds, future deck order, pseudonyms, command payloads, private
projections, and analytics identifiers. Metrics cover request/error/latency,
transaction conflicts, SSE connections and lag, change-stream recovery,
readiness, cleanup, expiry, and MongoDB pool health. Alerts name an owner,
threshold, [runbook link](observability-runbook.md), and recovery condition.
The logger and telemetry allowlists are the implementation boundary; staging
must complete the fire-and-recover drill before release.

## OPS-007 — Retention and scheduled cleanup

Coolify schedules the authenticated cleanup command from the web image. It first
transitions overdue active games to `EXPIRED` with an authoritative event, then
deletes expired game data and all related capability hashes in bounded,
idempotent batches. Presence, reads, and rejected commands do not extend expiry.
The job reports examined, transitioned, deleted, failed, and duration counts
without player data.

## OPS-008 — Incident response

Incidents preserve evidence while containing exposure: stop affected writes,
rotate exposed secrets, record versions and correlation IDs, and communicate
without copying sensitive payloads. Runbooks cover transaction failure,
change-stream interruption, readiness loss, capacity exhaustion, capability
exposure, analytics leakage, and cleanup failure. The owner records timeline,
impact, recovery, follow-up requirement IDs, and notification decisions.

## OPS-009 — Backup and restore

Back up the MongoDB replica set with encrypted, access-controlled, monitored
snapshots on a documented schedule. A restore drill at least quarterly restores
into an isolated environment, verifies snapshot/event/receipt consistency,
indexes, capability-hash handling, captured versions, expiry timestamps, and a
read-only completed game. Record recovery point, recovery time, tool versions,
result, and remediation; an untested backup is not release evidence.

## OPS-010 — Capacity and maintenance

Capacity evidence records the deployed web/MongoDB topology and tests the PRD
latency budgets under expected concurrent games, commands, syncs, and SSE
connections. Define warning and hard limits for the MongoDB pool, transaction
retries, memory, event lag, and open streams. Index maintenance, dependency and
Node updates, certificate renewal, secret rotation, content/version retirement,
and restore drills have named schedules and owners.
