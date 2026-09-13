# Load and performance evidence

This is the F6 execution contract for PRD-NFR-007, OPS-010, and TEST-006. The
versioned harness at [`tools/load-harness.ts`](../../tools/load-harness.ts)
keeps cookies and response bodies in memory only. Reports contain aggregate
durations, status codes, release versions, topology labels, and no game IDs,
invite paths, pseudonyms, capabilities, cookies, or payloads.

## Run against a deployed topology

Use a production-like HTTPS origin with an isolated dataset and an operator
approved topology. The target must have a replica-set MongoDB and valid
capability configuration; a local build without MongoDB cannot produce F6
evidence.

```sh
pnpm perf:load -- \
  --base-url https://staging.example.test \
  --topology 'web=1,mongodb=3,pool=50' \
  --games 24 \
  --concurrency 6 \
  --web-vitals \
  --saturation \
  --output docs/delivery/load-report.json
```

The target phase is the expected capacity sample. `--saturation` adds a phase
at twice the requested concurrency and then a recovery phase at the target
concurrency. The command exits non-zero when any scenario fails, or when a
phase reaches either hard budget:

| Measure                       |  Hard budget |
| ----------------------------- | -----------: |
| Usable lobby p75              | `< 3,000 ms` |
| Authoritative command ACK p95 | `< 1,500 ms` |

The browser probe records navigation TTFB, FCP, LCP, DOM interactive, and full
load for `/create`. Lobby and ACK budgets come from the real create, join,
start-command, roll-command, sync, and SSE scenario, so browser and protocol
evidence remain distinguishable in the report.

## Capacity limits and alerts

The load record must include the deployed web/MongoDB topology and the values
of the existing operational alerts. Treat these as escalation boundaries while
running the harness:

- MongoDB pool utilization: warning at 80%, hard alert at 90%.
- Transaction conflicts: alert at 10 conflicts per window.
- SSE lag: alert at 5 seconds.
- Readiness: any `unreachable` result blocks the run.
- Cleanup: one failed scheduled run alerts the web-operations owner.

Operators attach the generated JSON as the raw report and record the build,
content version, dataset, topology, start/end times, threshold result,
saturation observations, recovery result, and remediation links. Do not paste
request logs or response bodies into the report.

The automated percentile and privacy contract is covered by
`tools/load-harness.test.ts`. A staging load run and web-vitals report
are operational evidence and must be executed and signed off by the operator
before release.
