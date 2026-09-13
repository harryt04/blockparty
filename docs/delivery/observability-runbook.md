# Observability runbook

This runbook is the safe operational contract for F4. The application emits
JSON logs through `apps/web/src/server/http/redaction.ts` and process-local
allowlisted metric series through
`apps/web/src/server/observability/telemetry.ts`. A collector may export these
series, but it must preserve the label allowlist and never ingest request
bodies, cookies, capabilities, invite values, pseudonyms, seeds, private
projections, deck order, command payloads, or analytics identifiers.

## Telemetry contract

Requests record route, status, bounded latency, and deployed app/protocol/
content versions. Transactions record outcome, bounded latency, and safe error
codes; conflicts are counted separately. SSE records open connections, change
stream recovery attempts, and delivery lag. Readiness records the coarse
database status. Cleanup records only aggregate run, expiry, deletion, and
failure counts. MongoDB records active session count and pool utilization.

The `version_info` series records only the configured app, protocol, content,
and PWA cache versions. No metric label may be a game, seat, invite, command,
request payload, capability, cookie, name, or URL value.

## Alerts

| Alert                 |            Threshold | Owner          | Recovery condition            | Runbook action                                                                                       |
| --------------------- | -------------------: | -------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| readiness-unavailable | status `unreachable` | web-operations | Three consecutive `ok` probes | Check MongoDB replica-set primary and deployment readiness; do not admit gameplay while unavailable. |
| transaction-conflicts |  10 conflicts/window | web-operations | Next window below threshold   | Inspect deployment revision and contention; preserve event order and investigate stale clients.      |
| sse-lag               |            5 seconds | web-operations | Lag below 5 seconds           | Check change-stream cursor and MongoDB health; clients use `/sync` for recovery.                     |
| mongo-pool-saturation |      90% utilization | web-operations | Below 80%                     | Check transaction duration and MongoDB health; apply capacity limits before scaling.                 |
| cleanup-failure       |       one failed run | web-operations | Next bounded run succeeds     | Retry the authenticated scheduled job and verify aggregate counts without logging game data.         |

Alert notifications must include the alert ID, owner, threshold, safe metric
values, deployment revision, and this runbook link. They must not include raw
log lines containing request data. Operators record the fire time, recovery
time, revision, action, and follow-up requirement IDs.

## Fire-and-recover drill record

The automated telemetry test proves threshold fire/recovery and the logger
redaction canaries. Before release, staging must additionally record:

```text
Environment and revision:
Collector/destination:
Readiness alert fire/recovery:
Transaction conflict alert fire/recovery:
SSE lag alert fire/recovery:
Pool saturation alert fire/recovery:
Cleanup failure alert fire/recovery:
Forbidden-field redaction canary:
Operator / date:
Open issues / links:
```
