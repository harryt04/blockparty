# Requirements Traceability

**Status:** planning baseline  
**Evidence state:** `Planned` until linked implementation and test artifacts exist

This register maps every normative requirement family to its owning component, verification evidence, and delivery milestone. Ranges mean every ID in the inclusive range. Sparse IDs are listed explicitly. Implementation issues must replace `Planned` with links to code, tests, review records, and release evidence.

## Product and rules

| Requirement IDs | Source | Implementation owner | Required evidence | Milestone | Status |
|---|---|---|---|---|---|
| PRD-FUN-001–005 | [Entry/lobby/seats](product/prd.md#entry-lobby-and-seats) | `apps/web`, `packages/contracts` | TEST-004 join/lobby multi-context; TEST-005 capability/privacy cases | MILE-004 | Planned |
| PRD-FUN-006–010 | [Authoritative play](product/prd.md#authoritative-play) | `packages/game-engine`, `apps/web` Route Handlers, `apps/web` client | TEST-003 engine/scenarios; TEST-004 protocol/browser | MILE-004–005 | Planned |
| PRD-FUN-011 | [Bots](product/prd.md#bots-reconnect-and-lifecycle) | bot policy in `apps/web` server modules, engine legal-action contract | TEST-003 fixed-seed decisions; TEST-006 5,000-game soak | MILE-006 | Planned |
| PRD-FUN-012–015 | [Lifecycle](product/prd.md#bots-reconnect-and-lifecycle) | capabilities/presence/persistence plus UX recovery surfaces | TEST-004 reconnect/replacement/reclaim/host transfer; TEST-005 expiry | MILE-004, MILE-006 | Planned |
| PRD-FUN-016 | [Responsive experience](product/prd.md#experience-and-instrumentation) | `apps/web` | TEST-004 mobile/tablet/desktop, keyboard, assistive tech | MILE-007 | Planned |
| PRD-FUN-017 | [PWA](product/prd.md#experience-and-instrumentation) | `apps/web` manifest/service worker/update UX | TEST-005 PWA/cache/privacy matrix | MILE-008 | Planned |
| PRD-FUN-018 | [Instrumentation](product/prd.md#experience-and-instrumentation) | consent UI and PostHog adapter | TEST-005 denied/withdrawn/masking/event-schema cases | MILE-008 | Planned |
| PRD-FUN-019 | [No-contest termination](product/prd.md#experience-and-instrumentation) | host UX, Next.js command Route Handler, engine terminal state | TEST-003 no-contest state; TEST-004 host authorization/confirmation | MILE-005, MILE-007 | Planned |
| PRD-NFR-001–004 | [Platform/integrity](product/prd.md#non-functional-requirements) | workspace, Coolify services, capabilities, transactional command path | TEST-004–005; OPS-002–005 | MILE-003–004, MILE-008 | Planned |
| PRD-NFR-005–006 | [Accessibility/motion](product/prd.md#non-functional-requirements) | `apps/web`, design tokens/components | TEST-004 axe, keyboard, VoiceOver/NVDA, zoom, reduced motion | MILE-007 | Planned |
| PRD-NFR-007 | [Performance](product/prd.md#non-functional-requirements) | Next.js observability and performance budgets | TEST-006 load report plus web-vitals evidence | MILE-008–010 | Planned |
| PRD-NFR-008–010 | [Versioning/data/licenses](product/prd.md#non-functional-requirements) | contracts/content/migrations, operations, legal/brand owners | TEST-003 compatibility; TEST-005 migration; LEGAL-006–007 | MILE-002–003, MILE-008 | Planned |
| RULE-001–012 | [Canonical rules](product/rules.md#rule-requirements) | `packages/game-engine` | TEST-003 table/property/golden/scenario; TEST-004 command integration | MILE-005 | Planned |
| VAR-001–008 | [Eight toggles](product/rule-variants.md#exactly-eight-mvp-toggles) | `packages/game-content`, `packages/game-engine`, settings UI | TEST-003 each toggle alone and interactions | MILE-006 | Planned |
| VAR-009–014 | [Variant validation](product/rule-variants.md#validation-and-persistence) | contracts, content, engine, lobby/rules UI | TEST-003 schema/version/lock tests; TEST-004 lobby/reconnect | MILE-006 | Planned |
| CONTENT-001–009 | [Content bundle](product/game-content.md#versioned-content-bundle) | `packages/game-content`, validation/build tooling | TEST-003 validation and fixed-content fixtures; provenance review | MILE-002–003 | Planned |
| CONTENT-010–011 | [Balance/release](product/game-content.md#versioned-content-bundle) | product/content authors, simulation harness, counsel | TEST-006 simulation report; TEST-007 release packet; LEGAL-004 | MILE-002, MILE-009–010 | Planned |

## Experience

| Requirement IDs | Source | Implementation owner | Required evidence | Milestone | Status |
|---|---|---|---|---|---|
| UX-001–006 | [Principles](design/ux-spec.md#1-product-principles) | all `apps/web` surfaces and projections | TEST-004 cross-route accessibility/authority review | MILE-004, MILE-007 | Planned |
| UX-010–012 | [Create/join/lobby](design/ux-spec.md#3-end-to-end-flows) | Next.js routes and API Route Handlers | TEST-004 separate-context create/join/start | MILE-004 | Planned |
| UX-013–017 | [Gameplay flows](design/ux-spec.md#3-end-to-end-flows) | board/action UI plus engine/protocol commands | TEST-003 scenarios; TEST-004 browser state matrix | MILE-005, MILE-007 | Planned |
| UX-018–019 | [Recovery/completion](design/ux-spec.md#3-end-to-end-flows) | connection shell, capability flows, summary route | TEST-004 reconnect/reclaim/host transfer/completion | MILE-004, MILE-007 | Planned |
| UX-030, UX-031, UX-032, UX-033 | [Responsive shell](design/ux-spec.md#4-responsive-game-shell) | responsive board and panels | TEST-004 phone/tablet/desktop/landscape screenshots and interactions | MILE-007 | Planned |
| UX-040 | [Accessibility](design/ux-spec.md#6-accessibility-acceptance-requirements--ux-040) | semantic DOM/SVG/list, focus/live regions | TEST-004 automated and manual accessibility packet | MILE-007 | Planned |
| DS-001, DS-010, DS-020, DS-030 | [Design foundations](design/design-system.md) | Tailwind tokens, typography, shadcn compositions | visual regression, contrast, component accessibility review | MILE-007 | Planned |
| DS-040, DS-041, DS-050, DS-060, DS-070 | [Board/states/accessibility](design/design-system.md) | board components, state encodings, motion/audio settings | TEST-004 non-color, reduced-motion, assistive-tech, viewport matrix | MILE-007 | Planned |

Brand and naming requirements are intentionally not assigned here while `docs/brand/*` is owned by the separate chosen-name workstream. Add its stable IDs and release evidence when that work merges; LEGAL-005 and the release gate remain blocking meanwhile.

## Engineering, protocol, security, and analytics

| Requirement IDs | Source | Implementation owner | Required evidence | Milestone | Status |
|---|---|---|---|---|---|
| ENG-001–004 | [Architecture](engineering/architecture.md) | workspace, Next.js application, MongoDB, Coolify topology | architecture boundary tests; deployment smoke; OPS-002–005 | MILE-003–004, MILE-008 | Planned |
| ENG-005–010 | [Final architecture decisions](engineering/architecture.md#decisions-and-rejected-alternatives) | Next.js server modules, MongoDB adapter, web client, and platform owners | architecture boundary tests; protocol/recovery tests; deployment and compatibility evidence | MILE-003–008 | Planned |
| ENG-018–019 | [Acceptance and references](engineering/architecture.md#eng-018-implementation-acceptance-checklist) | engineering lead | implementation review checklist and source-version record | MILE-003, MILE-008 | Planned |
| ENG-015–017 | [Persistence/data/retention](engineering/realtime-and-data.md#eng-015-transactional-persistence) | Next.js server modules, MongoDB, cleanup/backup jobs | TEST-004 idempotency/restart; TEST-005 document compatibility/expiry; OPS-009 restore | MILE-004, MILE-008 | Planned |
| ENG-020–025 | [Engine contract/workflows](engineering/game-engine.md) | `packages/game-engine`, contracts/content | TEST-003 unit/property/golden/scenarios | MILE-003, MILE-005 | Planned |
| ENG-026 | [Bots](engineering/game-engine.md#eng-026-bots) | bot policy and engine command boundary | TEST-003 decision/explanation tests; TEST-006 soak | MILE-006 | Planned |
| ENG-027–028 | [Migration/tests](engineering/game-engine.md#eng-027-schema-and-state-migration) | engine/contracts/content maintainers | archived migration/upcaster fixtures and test matrix | MILE-003–008 | Planned |
| PROTO-001–004 | [Realtime protocol](engineering/realtime-and-data.md) | `packages/contracts`, Next.js Route Handlers/SSE, web sync client | TEST-004 schema/order/idempotency/resync/reconnect suite | MILE-004 | Planned |
| SEC-001–004 | [Security controls](engineering/security-privacy-analytics.md) | Next.js app/platform owners | TEST-005 threat cases, headers, origin/CSRF, scans, redaction | MILE-004, MILE-008 | Planned |
| SEC-005–006 | [Retention/acceptance](engineering/security-privacy-analytics.md#sec-005-retention-deletion-and-age-boundary) | platform/privacy owners | expiry/deletion/restore evidence and security checklist | MILE-008–010 | Planned |
| ANA-001–002 | [PostHog](engineering/security-privacy-analytics.md#ana-001-consent-gated-posthog) | web analytics adapter and privacy owner | denied/withdrawn network tests, event schema, replay masking review | MILE-008 | Planned |
| LEGAL-001–010 | [IP safety](legal/ip-safety.md#legal-requirements) | project owner, brand/content owners, qualified counsel | provenance register, search records, license packet, written gate approval | MILE-002, MILE-009–010 | Planned |

## Delivery controls

| IDs | Purpose | Completion evidence |
|---|---|---|
| TEST-001–007 | Test ownership, layers, CI gates, soak/load, and release evidence | CI/release links recorded against each implemented requirement above |
| OPS-001–010 | Coolify topology, deploy/rollback, observability, retention, incidents, restore, capacity, and maintenance | Runbook drill records, dashboards, image/migration records, OPS-009 restore report |
| MILE-001–011 | Dependency-ordered delivery gates and bounded `gnhf` execution | Each milestone records demo, tests, exclusions, owner, approval, and follow-up IDs |

## Scaffold status

The workspace and the application skeleton now exist. Every page and Route
Handler from [ENG-003](engineering/architecture.md#eng-003-application-modules-routes-and-data-paths)
is present, returns a shaped placeholder, and builds with no database
configured.

**No row above changes status.** A scaffold is not evidence. Every row stays
`Planned` until its implementation, tests, and approvals are linked, per the
release completion rule below.

| Requirement | Scaffolded artefact | Still required |
|---|---|---|
| ENG-002 | Workspace, three internal packages, `server-only`/`client-only` guards, ESLint dependency-direction rules | The CI boundary fixture |
| ENG-003 | All ten Route Handlers, all pages | Real behaviour behind each |
| ENG-004 | Security headers in `next.config.ts`, `.env.example` | Coolify deployment evidence, graceful shutdown |
| ENG-015 | `apps/web/src/server/commands/handle-command.ts` with the ordered steps | The transaction itself |
| ENG-016 | `apps/web/src/server/db/collections.ts` index definitions as data | The maintenance command that applies them |
| ENG-017 | `POST /api/internal/cleanup` with secret gating | The expiry transition and deletion batches |
| ENG-020-023 | `packages/game-engine` contract surface, PRNG and invariant seams | Every rule |
| PROTO-001-002 | `packages/contracts` envelopes, error codes, `.strict()` schemas | Wire-level tests |
| PROTO-003-004 | SSE route with keep-alives, subscriber registry, `/sync` route, client stream validator | Seat authentication, change stream, per-seat projections |
| SEC-002 | Capability generation, hashing, constant-time compare, `__Host-` cookie names | Issuance, storage, verification, rotation |
| SEC-003 | CSP and security headers, origin guard, payload bound | CSRF tokens, rate limits |
| CONTENT-001-009 | Bundle types, the Effect DSL, structural validation | The authored bundle; the placeholder blocks release |
| UX-030-033 | Responsive game shell, board view, board list, player strip, action bar | Live state and decisions |
| DS-010, DS-020 | Semantic tokens for light and dark, UI primitives | Self-hosted fonts with provenance |

Two deliberate omissions, each with its reason recorded in code:

- **No service worker.** [PRD-FUN-017](product/prd.md#experience-and-instrumentation)
  forbids claiming offline play before it works. See `apps/web/public/PWA-TODO.md`.
- **No font files.** [DS-010](design/design-system.md#ds-010--typography-and-tokens)
  requires self-hosted faces with a licence and provenance record. Only the
  fallback stacks are wired.

## Release completion rule

No requirement is `Verified` merely because code exists. It becomes `Verified` only when its implementation link, required automated/manual evidence, applicable migration/operations evidence, and release-gate approvals are recorded. MILE-010 cannot complete while any MVP row is `Planned`, `Blocked`, or `Failed`.
