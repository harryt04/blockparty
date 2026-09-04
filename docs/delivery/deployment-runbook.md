# Coolify deployment runbook

This runbook is the operational evidence packet for F3. It describes the one
immutable `web` revision, the private MongoDB replica set, and the two
maintenance invocations that use that same application image. It does not
replace the required staging and release-owner approvals. See ENG-004 and
OPS-001–005, OPS-007.

## Service and environment

Create one Coolify Node service named `web` from the repository revision being
released. Pin Node 22 and pnpm 10.17.0, enable frozen-lockfile installs, and
use the following commands:

```text
Install: pnpm install --frozen-lockfile
Build:   pnpm build
Start:   pnpm start
Port:    PORT (default 3000)
```

Record the git revision or image digest, public HTTPS URL, content version,
private MongoDB replica-set URI/database, backup target, alert destinations,
and rollback owner in the deployment record. Never use a `latest` tag. MongoDB
is a separate private service with persistent storage; it is not exposed by
Coolify's public proxy and there is no Redis service.

Set the exact variables listed in [OPS-003](operations.md#ops-003--environment-and-secrets-inventory)
from Coolify's secret store. In particular, `COOKIE_SECRET` and
`INTERNAL_CLEANUP_SECRET` are server-only secrets, and production must use an
HTTPS `NEXT_PUBLIC_APP_URL` and matching `ALLOWED_ORIGINS`.

## Pre-traffic sequence

1. Run `pnpm run ci` and `pnpm build` against the immutable revision.
2. Run the same revision's one-shot `pnpm db:maintain` command against the
   private replica set. It applies the complete named index plan and exits;
   `createIndexes` is safe to repeat.
3. Check `/api/health/live` and `/api/health/ready`. Traffic is admitted only
   when liveness is `ok` and readiness is `ready`, including a writable
   replica-set primary and valid content.
4. In staging, smoke create, join, start, one authoritative command, SSE
   reconnect, and cleanup before shifting production traffic.

## Scheduled cleanup

Configure a Coolify scheduled job using the same web revision to `POST` the
internal cleanup endpoint once per day:

```text
POST https://<public-host>/api/internal/cleanup
x-internal-secret: <INTERNAL_CLEANUP_SECRET>
Origin: https://<public-host>
```

The secret is supplied by the scheduler, never embedded in a URL or logged.
The endpoint first journals due active games as `EXPIRED`, revokes related
capability hashes, and then deletes retained data in bounded idempotent batches.
Record only its aggregate counts (`expiredGames`, `deletedGames`,
`revokedCapabilities`) and duration.

## Shutdown and rollback

On replacement or stop, Coolify sends SIGTERM. The Node lifecycle boundary
stops new commands, sends `game.closed` with `SERVER_SHUTDOWN` to authenticated
SSE streams, waits for admitted command transactions and post-commit delivery,
closes the change stream and MongoDB client, and then exits. Clients reconnect
through the normal sync path; no command, pass, or gameplay timeout is
fabricated.

Rollback the web service to the prior immutable revision without rolling back
MongoDB events. First verify that the prior reader understands every document,
event, and captured version written by the newer revision. If it does not,
keep the newer reader online and use the forward-compatible repair procedure;
never blindly down-migrate durable game data.

## Evidence record

Copy this section into the release record and fill it with observed values:

```text
Revision/image digest:
Environment and URL:
MongoDB replica-set readiness:
Index maintenance first run / repeat run:
Live and ready probe results:
Create/join/command/SSE reconnect smoke:
Cleanup run counts and duration:
SIGTERM drain result:
Rollback revision and reader-compatibility check:
Operator:
Date:
Open issues / links:
```
