# Blockparty notices

Copyright and license obligations are layered:

- Blockparty application and package source is licensed under
  `AGPL-3.0-or-later`; see [LICENSE](LICENSE).
- Original game content and assets are licensed under `CC BY-SA 4.0`; see
  [CONTENT-LICENSE.md](CONTENT-LICENSE.md).
- The Blockparty marks are reserved separately; see [TRADEMARKS.md](TRADEMARKS.md).
- Third-party dependencies and assets retain their upstream licenses below.

## Dependency-license audit

Audit date: 2026-09-07. The audit was run against the installed pnpm graph
from the lockfile with:

```text
pnpm licenses list --json
```

The audit found 237 package entries across these license expressions:

| License expression | Entries | Notice handling |
| --- | ---: | --- |
| MIT | 181 | Retain each package's copyright and license text. |
| Apache-2.0 | 25 | Retain copyright, license, and any upstream NOTICE text. |
| MPL-2.0 | 4 | Retain the Mozilla license and file-level notices. |
| BSD-2-Clause | 7 | Retain copyright and license text. |
| ISC | 11 | Retain copyright and license text. |
| BSD-3-Clause | 2 | Retain copyright and license text. |
| LGPL-3.0-or-later | 1 | Preserve the LGPL notice and source obligations for the bundled library. |
| Python-2.0 | 1 | Retain the Python license text. |
| CC-BY-4.0 | 1 | Retain attribution and the Creative Commons license link. |
| `(MPL-2.0 OR Apache-2.0)` | 1 | Preserve the selected upstream alternatives and notices. |
| `BlueOak-1.0.0` | 1 | Retain the Blue Oak license text. |
| `(Apache-2.0 AND MIT)` | 1 | Retain both licenses and copyright notices. |
| `0BSD` | 1 | Retain the 0BSD notice. |

The exact package/version graph is reproducible from `pnpm-lock.yaml`; the
installed audit is not a substitute for retaining upstream license files in a
release artifact. The direct dependencies that must be checked when they are
updated are:

| Package family | License expression | Use |
| --- | --- | --- |
| `next`, `react`, `react-dom`, `zod`, `clsx`, `client-only`, `server-only`, `tailwind-merge` | MIT | Runtime/application |
| `class-variance-authority`, `mongodb` | Apache-2.0 | Runtime/application |
| `lucide-react` | ISC | Runtime icons |
| `posthog-js` | Apache-2.0 AND MIT | Consent-gated analytics |
| `@axe-core/playwright` | MPL-2.0 | Accessibility tests |
| `@playwright/test`, `typescript` | Apache-2.0 | Browser tests/tooling |
| `@eslint/js`, `eslint`, `eslint-plugin-react-hooks`, `fast-check`, `globals`, `prettier`, `prettier-plugin-tailwindcss`, `tsx`, `typescript-eslint`, `vitest`, and `@types/*` | MIT | Development/tooling |
| `@tailwindcss/postcss`, `tailwindcss` | MIT | Build styling |

Notable transitive licenses requiring explicit release review include
`@img/sharp-libvips-*` (LGPL-3.0-or-later), `argparse` (Python-2.0),
`caniuse-lite` (CC-BY-4.0), `dompurify` (MPL-2.0 OR Apache-2.0),
`lightningcss` (MPL-2.0), `lucide-react` (ISC), and `minimatch`
(BlueOak-1.0.0 in addition to an ISC version). Re-run the audit after every
dependency change and update this table if a new license family or required
notice appears.

## Fonts and bundled assets

The current CSS references these font families but does not bundle or fetch
font files:

| Family | Current status | Notice status |
| --- | --- | --- |
| Atkinson Hyperlegible | CSS family name with system fallback only | No font distributed by this repository; add OFL notice before bundling. |
| Fraunces | CSS family name with system fallback only | No font distributed by this repository; add OFL notice before bundling. |
| Platform UI fonts and Georgia | End-user platform fallbacks | Not distributed by this repository. |

Original assets added later must include the provenance fields in
[IP safety](docs/legal/ip-safety.md), and every third-party asset must be added
here with its exact license, source, attribution, and modification terms.
