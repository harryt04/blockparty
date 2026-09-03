# Operations Runbook

**ID:** OPS-001  
**Status:** pre-production operating baseline  
**Inputs:** [Architecture](../engineering/architecture.md), [Roadmap](roadmap.md), and [Test Strategy](test-strategy.md)

## OPS-002 — Coolify topology and services

Deploy through Coolify in a local-region production environment. Start with one Next.js `web` service, one Fastify/Socket.IO `game-server` service, and managed/compose PostgreSQL on a private Docker network. Terminate TLS at Coolify's proxy; expose HTTPS to web and HTTPS/WSS to game-server. PostgreSQL is never public. Use a persistent database volume and separate backup destination. Pin all image versions/digests; no `latest` tags.

Initial services are `web`, `game-server`, `postgres`, a one-shot `migrate` job using the game-server image, and a scheduled `cleanup` job using that image. Optional observability exporters remain private. Redis is absent initially; add it only after `TEST-006` shows a shared pub/sub, presence, rate-limit, or connection boundary. When added, Redis is private/authenticated and replicas use the tested Socket.IO adapter.

## OPS-003 — Environment and secrets inventory

Store values only in Coolify secret management (and the backup provider); never in Git, client bundles, logs, screenshots, or analytics. Inventory, without values:

| Category | Required configuration |
| --- | --- |
| Application | environment, public canonical URL, port, log level, build/version identifier |
| Database | connection URL, TLS/CA settings, pool limits, migration lock/timeout |
| Sessions/auth | signing/encryption keys, cookie domain/security policy, token TTLs |
| Realtime | allowed origins, connection/message/rate limits, protocol version |
| Analytics | provider host/project key, consent mode, replay masking/redaction configuration |
| PWA | cache/version identifier and update policy |
| Backups | destination credentials, encryption key/reference, retention, restore authorization |
| Observability | error-reporting/metrics endpoint credentials, alert webhook/recipient |

Rotate application/session, database, backup, analytics, and alert credentials on suspected exposure and at the organization’s defined cadence. Record owner, rotation date, and dependent service for each secret; do not record secret values.

## OPS-004 — Deployment and rollback

1. Confirm a clean release candidate has `TEST-007` evidence, migration review, current backup, and named release/rollback owner.
2. Build and pin immutable web and game-server image digests; never migrate implicitly at application startup.
3. Run the migration job once with an advisory/lease lock; verify its version and logs. Migrations must be forward-compatible with prior web/game-server versions during rollout and include a rollback/roll-forward decision.
4. Start game-server, then web; wait for readiness and run authenticated smoke: create/join, deterministic action/broadcast, reconnect, and basic read/write.
5. Observe error rate, realtime latency, database pool, CPU/memory, and logs for the defined bake window before declaring success.

Rollback code by redeploying the prior compatible web and game-server image pair and confirming health/smokes. Never blindly down-migrate production data. For an incompatible migration, use the rehearsed restore/forward-fix plan; communicate degraded availability rather than risk corruption. Record both images, migration versions, operator, timestamps, and result.

## OPS-005 — Health, readiness, logs, metrics, and alerts

Both application services expose `/health/live` as cheap process liveness. `/health/ready` verifies required configuration; game-server also checks database connectivity and migration compatibility. Endpoints return no secrets, game data, or verbose errors. Coolify restarts only on liveness failure and removes a service from traffic on readiness failure.

Emit structured JSON logs with UTC timestamp, level, release/image, request/correlation ID, hashed/pseudonymous game/player identifiers where needed, route/protocol event, latency, and error class. Never log invite URLs/tokens, credentials, session cookies, full payloads, or private game state. Retain logs according to the 30-day policy below unless an incident/legal hold requires otherwise.

Minimum metrics: HTTP/WebSocket connection counts; active games/clients; commands accepted/rejected; action-to-broadcast p50/p95/p99; reconnects; protocol/order/idempotency failures; error rate; event lag; Postgres connections/latency/locks/storage; app CPU/memory/restarts; backup age/success; and migration status. Alert on readiness failures, sustained 5xx/realtime error rates, p95 broadcast SLO breach, database connection/storage pressure, restart loops, failed/missing backup, failed migration, and anomalous authorization/rate-limit rejections. Alerts require an owner, severity, runbook link, and test notification.

## OPS-006 — Backup, restore drill, retention, and cleanup

Take encrypted PostgreSQL backups at least daily and retain point-in-time/WAL coverage if supported. Active games and capabilities expire 30 days after the last authoritative gameplay action; completed games expire 30 days after completion. Cleanup transitions due active games to `EXPIRED`, revokes capabilities, and deletes in bounded batches. Logs, traces, replay artifacts, and temporary exports default to no more than 30 days. Backups require a shortest-practical approved retention and published deletion lag; application cleanup does not erase backups immediately.

## OPS-009 — Restore drill

Before beta and at least quarterly, select a known backup and restore it into an isolated database with no production outbound integrations. Verify checksum/restore completion, migration compatibility, sampled game/event replay, authorized read/write smoke, and deletion after validation. Record recovery time, recovery point age, operator, backup identifier, failures, and corrective action. A restore is not complete until the test services start and a persisted game replays.

## OPS-007 — Incident playbooks

**Realtime outage:** acknowledge, check `/health/ready`, deploy/version changes, connection/error metrics, PostgreSQL availability and logs; stop unsafe traffic, roll back the compatible service pair if correlated, preserve correlation IDs, and update status. Verify reconnect/replay after mitigation.

**Data corruption or bad migration:** declare a write freeze, preserve evidence, identify affected migration/event range, do not run destructive repair ad hoc, notify the incident owner, restore into isolation, validate replay, then choose documented forward repair or restore under `OPS-004`.

**Security/secret exposure:** revoke/rotate affected credentials, invalidate impacted sessions/invites where applicable, isolate exposed service, preserve audit logs, assess user/data impact, patch and verify scans, then follow notification obligations approved by security/legal.

**Capacity saturation:** protect the database first: apply admission/rate limits, pause new games if necessary, shed nonessential analytics/replay work, scale game-server only when the realtime topology supports it, and use `TEST-006` evidence before introducing Redis or changing connection pools.

For every incident: assign commander and communications owner, timestamp decisions, preserve evidence without secrets, open corrective actions with owners/dates, and run a blameless review for sev-1/sev-2 events.

## OPS-008 — Capacity, scaling, SLOs, and disaster recovery

Initial capacity acceptance is `TEST-006`: 100 concurrent games/600 clients and local-region action broadcast p95 below 300 ms for at least 30 minutes. Maintain 30% resource headroom before increasing beta access. Scale vertically first; scale game-server replicas only after shared realtime delivery, presence, rate limits, and session behavior are verified. Redis is the later coordination layer, not a substitute for durable PostgreSQL events.

Proposed beta SLOs (review after alpha): 99.5% monthly successful ready availability; 99% of accepted local-region actions broadcast in under 300 ms; 99.9% durable event-write success; daily backup success with backup age under 26 hours. Track error budgets monthly; halt feature rollout when an SLO is materially breached until mitigation is agreed.

Disaster recovery is restore-to-new-infrastructure, not an untested promise of zero downtime. Target initial objectives: RPO 24 hours without point-in-time recovery, RTO 4 hours; improve only after drill evidence. Keep infrastructure configuration, image digests, migration history, domain/TLS procedure, secret-rotation access, and restore instructions available to at least two authorized operators. Run the `OPS-009` drill after topology/database major-version changes.

## OPS-010 — Security maintenance

Review dependency, base-image, and runtime security updates weekly; triage critical actively exploitable issues immediately and apply/mitigate within 24 hours where operationally feasible. Apply normal security patches in the next scheduled release after `TEST-007`; document exceptions, compensating controls, owner, and expiry. Re-run vulnerability, secret, authorization, and PWA cache/privacy checks after material upgrades. Maintain least-privilege Coolify/database/backup access, MFA where supported, periodic access review, TLS renewal monitoring, and a documented responsible-disclosure contact before public beta.
