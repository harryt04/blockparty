# Security, Privacy, and Analytics

**Companion documents:** [PRD](../product/prd.md), [glossary](../product/glossary.md), [architecture](architecture.md), [game engine](game-engine.md), and [realtime and data](realtime-and-data.md). This is an engineering baseline, not legal advice; obtain applicable privacy/legal review before public release.

## SEC-001: Threat model

| Asset / threat                                      | Required control                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Game integrity: forged/replayed/out-of-turn command | Server authority, capability-to-seat authorization, Zod validation, legal-action checks, aggregate version, unique command ID, journal. |
| Private game access: guessed/shared invite          | High-entropy opaque invite ID, rate limits, expiry/use limits; invite is not a reconnect or host credential.                            |
| Seat takeover: stolen cookie/token                  | Secure HttpOnly reconnect cookie, token hash at rest, rotation/revocation on reclaim/replacement, TLS, short retention.                 |
| RNG/deck manipulation                               | CSPRNG seed generated server-side; deterministic engine; secret seed/deck order never serialized to clients.                            |
| Cross-site HTTP/SSE abuse                           | Strict Origin allowlist, cookie protections, CSRF on cookie-authenticated HTTP mutation, and authenticated SSE requests.                |
| Availability: spam sockets/commands/invites         | IP and identity limits, connection caps, payload limits, timeouts, bounded DB transactions, backpressure.                               |
| XSS/data leakage                                    | CSP, output escaping, no unsafe HTML, secret redaction, content security review.                                                        |
| Dependency/supply-chain or operator compromise      | Lockfile, CI audit/update process, least-privileged secrets, image scanning, patch cadence.                                             |

There is no chat. Do not add chat, user-uploaded content, public profiles, or direct messaging without a new abuse/privacy design.

## SEC-002: Identity, authorization, and entropy

On seat claim, issue a random command token scoped to that game and seat using Node `crypto.randomBytes` (minimum 32 bytes). Send it only as a cookie; store its cryptographic hash at rest and compare in constant time. Keep host authority and non-command reclaim claims in separate random capabilities. Cookies use the `__Host-` prefix where possible with `Secure; HttpOnly; Path=/; SameSite=Lax; Max-Age` bounded by game retention. Never place capabilities in URLs, localStorage, analytics, logs, or SSE query strings.

Create invitation IDs from at least 128 bits of CSPRNG entropy, encode URL-safely, and store only their identifier/state unless invitation secrecy needs a separate verifier. An invite authorizes joining according to its policy, never operating an existing seat. Use opaque UUID game IDs; never rely on sequential IDs.

Every HTTP/SSE action maps an authenticated game-seat capability to one current seat and checks game status and action ownership server-side. Client-provided seat, game, phase, expected version, and host flag are untrusted. Replacement revokes the command capability but preserves only the separate reclaim claim; approved reclaim issues a new command capability. Gameplay identity never spans games. Lobby host actions additionally require the separate host capability.

## SEC-003: Browser and transport controls

- Force HTTPS and HSTS at the proxy; redirect HTTP. Configure secure headers in Next.js/proxy: CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and frame protection (`frame-ancestors 'none'`).
- CSP starts deny-by-default: `default-src 'self'`; allow only necessary hashed/nonced scripts/styles, same-origin API/SSE, and consented PostHog endpoints. Avoid `unsafe-inline`; document any unavoidable framework exception and test it.
- Cookie-authenticated mutating HTTP endpoints require Origin validation plus a synchronizer/double-submit CSRF token. SSE requests and every CORS response allow only configured first-party origins; never `*` with credentials.
- Set request payload limits, max nesting/string lengths in Zod schemas, command timeouts, allowed event names, and bounded SSE connection counts. Reject binary payloads unless explicitly needed.
- Rate-limit create/join, invalid invite lookups, commands, sync requests, SSE connections, and analytics proxy calls by IP plus seat/game where available. Use generic responses for invite existence and exponential backoff for repeated failures.

## SEC-004: Abuse, operations, and secure development

Record security-relevant audit actions (create/join/reject/seat transfer/replacement, command receipt ID, admin retention action) with pseudonymous IDs, reason codes, and timestamps. Never log reconnect tokens, cookies, authorization headers, complete invite URLs, raw IPs beyond justified operational retention, full state/deck secrets, or form input. Apply structured-log redaction at the logger boundary and test it.

Keep runtime secrets only in Coolify secret injection: database URL, cookie signing/encryption keys if used, PostHog keys, and backup credentials. Never expose server keys with `NEXT_PUBLIC_`; rotate on exposure. Pin dependencies through `pnpm-lock.yaml`, run vulnerability scanning/audit in CI, scan images, review dependency updates, and use non-root minimal production images. Restrict database credentials to the game server role and backups; separate staging/production credentials. Alert on repeated auth failures, rate-limit spikes, transaction errors, and invariant failures.

## ANA-001: Consent-gated PostHog

PostHog is optional analytics. Default to no analytics persistence/transmission until the player gives clear, revocable consent. Present a concise choice before initialization; “essential game operation” must not be bundled with analytics. Store consent locally in a minimal preference and propagate it to PostHog only after opt-in. On withdrawal, call PostHog opt-out/reset as applicable, stop capture and session replay immediately, and do not reinitialize on future page loads without renewed consent. Consult the [PostHog consent guidance](https://posthog.com/docs/privacy/data-collection) and [session replay privacy controls](https://posthog.com/docs/session-replay/privacy) during implementation.

Session replay remains globally disabled until a privacy owner approves its configuration and real create/join/reconnect masking tests pass. After that gate, an opted-in replay masks all text and inputs by default, including display names, invite URL paths/parameters, tokens/cookies, forms, error detail, and visible game identifiers. Never record network bodies, identifying console logs, or full game-state payloads.

## ANA-002: Approved event taxonomy

Use a pseudonymous PostHog distinct ID derived from a random analytics ID, not a reconnect token, invite ID, IP, or player name. Allowed common properties only: `app_version`, `content_version`, `protocol_version`, `surface` (`web`), coarse `viewport_bucket`, `pwa_display_mode`, `locale`, `consent_version`, `game_player_count_bucket`, and duration/count buckets. Do not send free text, URLs, IDs, raw error strings, financial/game-state details, or identifiers.

| Event                                    | Allowed additional properties                                               | Purpose                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `consent_presented`                      | `consent_version`                                                           | Measure notice display.                                 |
| `consent_updated`                        | `choice` (`granted`/`denied`/`withdrawn`)                                   | Consent funnel.                                         |
| `game_create_started` / `game_created`   | `player_count_bucket`, `duration_bucket`                                    | Creation funnel.                                        |
| `rule_configuration_saved`               | `preset` (`standard`/`short_game`/`custom`), `enabled_variant_count_bucket` | Rule-selection use without sending exact game identity. |
| `invite_join_started` / `invite_joined`  | `result_category`, `duration_bucket`                                        | Join funnel.                                            |
| `game_started` / `game_finished`         | `player_count_bucket`, `finish_reason_category`, `duration_bucket`          | Completion.                                             |
| `reconnect_result`                       | `result_category`                                                           | Reliability.                                            |
| `pwa_install_prompted` / `pwa_installed` | `browser_family`                                                            | PWA adoption.                                           |
| `ui_error_shown`                         | `error_category` (stable enum only)                                         | UX reliability.                                         |

Operational telemetry is separate from product analytics and can collect aggregate counters/histograms such as active sockets, command latency, DB transaction failures, reconnect rate, rate-limit blocks, snapshot/resync rate, and engine invariant failures. It must use no player names, invite IDs, cookie/token values, or raw payloads.

## SEC-005: Retention, deletion, and age boundary

Apply [ENG-017](realtime-and-data.md#eng-017-expiry-backup-recovery-and-scale): active game data and capabilities expire 30 days after the last authoritative gameplay action; completed games expire 30 days after completion. Expiry jobs revoke capabilities and delete related rows in a controlled order. Configure the shortest practical encrypted-backup retention and publish unavoidable deletion lag. A support deletion path uses an authorized game reference without collecting a raw capability and records only a minimal deletion audit entry.

The service is for people age 13 and older. State this in terms/onboarding, do not knowingly collect personal information from under-13 users, and do not use child-directed marketing or analytics. If audience or territory changes, conduct a dedicated children's-privacy review. Guest play requires a game-scoped pseudonym under [PRD-FUN-003](../product/prd.md#entry-lobby-and-seats), never a real name, email address, birth date, account, or cross-game profile.

## SEC-006: Security acceptance checks

- Attempting commands with a copied invite but no valid game-seat capability cannot control an occupied seat.
- Duplicate/reordered commands produce at most one committed state change; stale actions cannot overwrite state.
- Origin/CSRF/CSP/cookie flags and socket origin policy are automated integration checks.
- Token, invite URL, name, and form fixtures are absent from logs and masked from opted-in replay.
- Consent-denied browser sessions make no PostHog capture/replay requests; withdrawal stops them.
- Retention job and restored-backup drill meet the documented 30-day deletion and recovery expectations.
