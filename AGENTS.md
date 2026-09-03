## Repository state

This repository contains **planning documents only**. There is no source code, no `package.json`, and no build, lint, or test commands yet. The single commit is the docs baseline.

`docs/` is the implementation authority. Read the relevant spec before you write code. Do not invent behavior that a document already defines.

Implementation is unblocked. The project owner settled the name — **Blockparty** — and recorded that [MILE-002](docs/delivery/roadmap.md) no longer gates development. The brand documents supersede the earlier "provisional, uncleared" language, and ticket 0.0 in the backlog carries that correction through the remaining documents.

The work queue is [build-backlog.md](docs/delivery/build-backlog.md): 62 dependency-ordered tickets covering MILE-003 through MILE-008. Take one ticket per session. Do not add a ticket to it.

## Normative precedence

When two documents disagree, the higher level wins. Correct the lower-level document; do not implement the conflict.

1. [PRD](docs/product/prd.md)
2. [Rules](docs/product/rules.md), [variants](docs/product/rule-variants.md), [game content](docs/product/game-content.md), [glossary](docs/product/glossary.md)
3. [Architecture](docs/engineering/architecture.md), [game engine](docs/engineering/game-engine.md), [realtime and data](docs/engineering/realtime-and-data.md), [security/privacy/analytics](docs/engineering/security-privacy-analytics.md)
4. [UX spec](docs/design/ux-spec.md), [design system](docs/design/design-system.md)
5. [Test strategy](docs/delivery/test-strategy.md), [roadmap](docs/delivery/roadmap.md), [operations](docs/delivery/operations.md)

`docs/mvp-prd-prompt.md` is superseded historical input. It is never authority.

## Final architecture

A pnpm workspace with one deployable Next.js App Router application and three internal packages. Dependency direction is enforced, not advisory:

| Package                                                          | May depend on                                       | Must not depend on                                 |
| ---------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `apps/web` (Next.js App Router, Tailwind, shadcn/ui, PWA, API Route Handlers) | `contracts`, `game-engine`, `game-content`, MongoDB driver | browser modules importing server modules; raw capabilities |
| `packages/game-engine` (pure reducer)                            | `contracts`, `game-content`                         | Node APIs, clock, `Math.random`, IO, DB, transport |
| `packages/contracts` (Zod schemas + `z.infer` types)             | Zod                                                 | React, Next.js, DB, engine                         |
| `packages/game-content` (versioned original board/decks/economy) | data and validation helpers                         | infrastructure, third-party content                |

Storage is MongoDB with the official driver and replica-set transactions. Realtime uses authenticated SSE and MongoDB change streams inside the Next.js runtime. Redis is deliberately absent until measured horizontal coordination need is proven. Deployment is Coolify: one `web` service and private MongoDB; maintenance and cleanup use the same web image.

## Cross-cutting invariants

These constraints span many documents. Break one and the change is wrong, even if it compiles.

- **Server authority.** The browser may render a projection or preview a legal action. Only server-side modules in `apps/web` call the engine to accept a command. See [ENG-002](docs/engineering/architecture.md).
- **Pure engine.** `packages/game-engine` performs no IO, no clock read, no randomness, no logging, no mutation, and no token checks. The server authorizes; the engine then independently rejects illegal seat/phase actions. See [ENG-020](docs/engineering/game-engine.md).
- **One transactional command path.** Authenticate, lock the game, check the command ID, load snapshot, verify `expectedVersion`, resolve, append events, update snapshot, insert receipt, commit, _then_ broadcast. See [ENG-015](docs/engineering/realtime-and-data.md).
- **Four separate capabilities.** Invite, game-seat command token, host capability, and reclaim claim are distinct. An invite admits; it never operates an occupied seat. Store token hashes, never raw tokens. Never place a capability in a URL, localStorage, log, or analytics event. See [SEC-002](docs/engineering/security-privacy-analytics.md).
- **Determinism.** The server generates a secret 256-bit seed at creation. Dice, shuffles, and every chance outcome are emitted as events. Replaying events needs no PRNG. Never send the seed or future deck order to a client. See [ENG-022](docs/engineering/game-engine.md).
- **Money is integer minor units.** Never float. Rounding is data-defined.
- **No timers in the MVP.** There is no turn, purchase, auction, trade, or debt timeout. A disconnected required actor pauses play. Connectivity loss never fabricates a pass, bid, or bankruptcy. See [RULE-009](docs/product/rules.md).
- **Safe command boundary.** Bot replacement, reclaim, host transfer, and `EndNoContest` happen only after one command transaction commits and before the next starts. See [PROTO-003](docs/engineering/realtime-and-data.md).
- **Immutable versions per game.** A started game keeps the `contentVersion`, `stateSchemaVersion`, and resolved variant configuration captured at start. Never let a resumed game read current deployment defaults. See [ENG-027](docs/engineering/game-engine.md) and [VAR-011](docs/product/rule-variants.md).
- **30-day retention.** Active games expire 30 days after the last authoritative gameplay action; completed games 30 days after completion. Presence, viewing, and failed commands do not extend it.
- **Exactly eight variant toggles.** No ninth toggle, and content cannot add one. See [rule variants](docs/product/rule-variants.md).
- **No chat, accounts, matchmaking, or spectators.** These are explicit non-goals.

## Vocabulary: two layers, never mixed

[Glossary](docs/product/glossary.md) is normative. Code, commands, events, wire fields, DB columns, content IDs, analytics properties, and test fixtures use the **canonical wire layer** (`deedId`, `district`, `detention`, `seatCapability`). The UI renders the **display layer** (Address, Block, Noise Complaint) at the presentation boundary only.

A display-name change must never require a schema migration or a content-version bump. A display name in a command or fixture is a defect.

Domain commands and events are PascalCase (`AcquireDeed`, `RulesConfigured`). Transport events are dotted lower-case (`game.command`, `game.events`).

## Requirement IDs and traceability

Every normative statement carries a bounded ID: `PRD-FUN`, `PRD-NFR`, `RULE`, `VAR`, `CONTENT`, `UX`, `DS`, `ENG`, `PROTO`, `SEC`, `ANA`, `OPS`, `TEST`, `MILE`, `BRAND`, `LEGAL`.

Cite the IDs you implement, and update [traceability](docs/traceability.md) in the same change. New scope gets a new ID; never widen an existing one silently. A requirement is `Verified` only when implementation, evidence, and approvals are all linked — code alone is not enough.

## Planned test commands

Not yet runnable. When the workspace exists, the intended toolchain is:

- Vitest for engine, table, scenario, and property tests (`fast-check`). No browser, clock, network, or DB in engine tests.
- Protocol/integration tests against an ephemeral replica-set MongoDB.
- Playwright across Chromium, Firefox, and WebKit with separate browser contexts per player.
- axe for automated accessibility, plus a manual VoiceOver and NVDA checklist per release.

Test rules that already bind: use fixed seeds and record the seed on failure; keep golden fixtures immutable and add a new version instead of editing one; never retry a failure into green. Tests covering rules, authorization, persistence, or realtime ordering may not be quarantined for a release. See [test strategy](docs/delivery/test-strategy.md).

## Legal and content constraints

This project implements familiar mechanics with independently authored expression. The rules are operational, not optional. See [IP safety](docs/legal/ip-safety.md).

- Never commit copied or paraphrased rule text, board data, card copy, rent schedules, art, audio, or third-party scans. Synonym substitution is prohibited — start from the original brief.
- Every creative or numerical asset needs a provenance record (creator, date, inputs, license, AI-tool record, review). Missing provenance blocks release.
- **Blockparty** is provisional and uncleared; **Civora** is the fallback. No design or content decision may depend on the name. Do not register domains, reserve handles, or publish packages.
- Never place the mark next to blockchain, web3, crypto, NFT, or token language anywhere public.
- The board is a winding, irregular neighborhood street route. A square grid or a familiar perimeter layout is a **Red** finding, not a style choice.
- Public release is blocked on the attorney gate. Do not make clone, remake, compatibility, or affiliation claims.

## Working practice

- Prefer editing an existing document over adding a new one. The register in [docs/README.md](docs/README.md) lists every document and its purpose.
- When a document is wrong, fix the document in the same change as the code.
- Do not delegate brand selection, legal judgment, privacy approval, or launch approval to an agent.
