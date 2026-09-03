# Blockparty

A private, browser-playable, original-property board game for 2–6 players.
One deployable Next.js App Router application backed by MongoDB.

> **`docs/` is the implementation authority.** Read the relevant specification
> before you write code. Start at [docs/README.md](docs/README.md) for the
> document register and normative precedence. `AGENTS.md` carries the
> cross-cutting invariants.

## Status

Scaffolding. Every page and API route exists as a stub that returns placeholder
data. No game rules, persistence, capabilities, or realtime fan-out are
implemented yet.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 10

## Run it

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The app runs at http://localhost:3000. **No MongoDB is required to boot.**
Leave `MONGODB_URI` empty and every page still renders; `/api/health/ready`
reports `degraded` instead of failing.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | Type-check all four packages |
| `pnpm lint` | ESLint, including the dependency-direction rules |
| `pnpm format` | Prettier |

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

## Deployment

A plain Next.js Node application — no container files live in this repository.
MongoDB is deployed separately and reached through `MONGODB_URI`. Set the
variables in `.env.example` on the host, build, and run `pnpm start`.
Terminate HTTPS at the proxy and raise its idle timeout so SSE streams survive.
