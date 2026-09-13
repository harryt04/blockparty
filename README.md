# Blockparty

A private, browser-playable, original-property board game for 2–6 players.
One deployable Next.js App Router application backed by MongoDB.

> **`docs/` is the implementation authority.** Read the relevant specification
> before you write code. Start at [docs/README.md](docs/README.md) for the
> document register and normative precedence. `AGENTS.md` carries the
> cross-cutting invariants.

The code is licensed under [AGPL-3.0-or-later](LICENSE). Original game content
and assets use [CC BY-SA 4.0](CONTENT-LICENSE.md); third-party notices and the
trademark policy are recorded in [NOTICE.md](NOTICE.md) and
[TRADEMARKS.md](TRADEMARKS.md).

## Status

The playable lobby, authoritative game engine, bot turns, persistence,
capability cookies, and realtime sync path are implemented. A configured
MongoDB replica set is required to create and play live games.

The active [classic overhaul queue](docs/delivery/classic-overhaul-backlog.md)
has activated Blockparty's classic 40-space magical-city bundle for new games.
The placeholder reader remains available only for retained historical summaries
while its retirement workflow drains existing games.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 10

## Run it

```bash
pnpm install
cp .env.example .env.local
npm run dev
```

The app runs at http://localhost:3000. The root `.env` or `.env.local` is loaded
before Next.js starts. When its `MONGODB_URI` is absent or unreachable,
`npm run dev` starts an isolated, loopback-only development replica set through
the installed `mongod`; its data and log live under the operating system's
temporary directory. A healthy configured replica set still takes precedence.
Production, builds, and direct `pnpm dev` execution never start local database
infrastructure.

## Commands

| Command               | Purpose                                           |
| --------------------- | ------------------------------------------------- |
| `pnpm dev`            | Development server                                |
| `pnpm build`          | Production build                                  |
| `pnpm start`          | Serve the production build                        |
| `npm run agent:smoke` | Exercise create/start/bot/trade through live HTTP |
| `pnpm typecheck`      | Type-check all four packages                      |
| `pnpm lint`           | ESLint, including the dependency-direction rules  |
| `pnpm test`           | Vitest workspace with coverage                    |
| `pnpm format`         | Prettier                                          |
| `npm run ci`          | Full local and pull-request regression gate       |

## Layout

```
apps/web/              the only deployable application
  src/app/             App Router pages and Route Handlers
  src/server/          Node-only: env, MongoDB, auth, commands, projections, SSE
  src/client/          browser-only synchronization
  src/components/      UI primitives, app shell, game presentation
packages/contracts/    Zod schemas and inferred wire types
packages/game-engine/  pure deterministic reducer
packages/game-content/ versioned original board, decks, economy
```

Dependency direction is enforced, not advisory. `src/server/**` imports
`server-only`; `src/client/**` imports `client-only`. ESLint blocks the
remaining paths. See [ENG-002](docs/engineering/architecture.md).

## Contributing

1. Read [AGENTS.md](AGENTS.md), [docs/README.md](docs/README.md), and the
   specification for the area you are changing.
2. Work on one item from the active [classic overhaul queue](docs/delivery/classic-overhaul-backlog.md).
3. Run `npm run format` before checking the change.
4. Run `npm run ci` before committing or pushing. It validates formatting,
   typecheck, lint, unit and integration tests, the production build, and the
   deterministic browser suite.
5. Run the live browser, soak, load, or manual accessibility checks when the
   changed area requires them, and include the resulting evidence in the change.

See [CONTRIBUTING.md](CONTRIBUTING.md) for license, provenance, security, and
review requirements.

## Deployment

A plain Next.js Node application — no container files live in this repository.
MongoDB is deployed separately and reached through `MONGODB_URI`. Set the
variables in `.env.example` on the host, build, and run `pnpm start`.
Terminate HTTPS at the proxy and raise its idle timeout so SSE streams survive.
