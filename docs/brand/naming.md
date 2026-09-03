# Naming Exploration and Decision Process

This document explores names for the original game identity described in [Brand Strategy](brand-strategy.md). It is not legal advice, a clearance opinion, or evidence that any candidate is available. Follow [IP safety](../legal/ip-safety.md) before public use.

## Naming brief

The name should feel social, bright, and strategically capable for a 13+ web game. It should support an original world rather than signal an unofficial version of an existing tabletop title. Prefer two to four syllables, easy spoken spelling, and a flexible visual mark. Avoid direct references to another game’s titles, components, slogans, board labels, or distinctive world.

### Explicitly rejected pattern

Reject pun/synonym renames such as **“Walkboard”** and **“Parking Place.”** Replacing words in a recognizable title or phrase does not create a safe identity, and it keeps the product anchored to another brand. Do not use title-adjacent wordplay, sound-alikes, rhyming variants, or “the free/open version of …” positioning.

### Second rejected pattern: synonyms of the category-defining mark

Reject direct synonyms and near-synonyms of the famous mark itself, such as **Monopolyfill**, **Monorepoly**, **Duopoly**, **Oligopoly**, and **Nopoly**. Naming this product category after that mark’s own meaning aims at the brand rather than away from it. A clever pun does not reduce confusion risk; it increases it. Keep such names as internal jokes only. Never use one in a repository name, package name, domain, handle, or public copy.

Generic economics terms that describe monopoly _behavior_ — antitrust, network effects, vendor lock-in — sit in a lower-risk tier. They are still not cleared, and they still run the full workflow below.

### Blocked candidate

**Eminent Domain** is blocked. It is the title of a board game published in 2011. Do not score it, test it, or revive it.

## Candidate pool

These are brainstorming candidates only. They have not received trademark, web, domain, app-store, package-registry, or GitHub clearance.

| Category    | Candidates                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Suggestive  | Civic Exchange; Common Ground; Market Hours; Neighbor’s Ledger; Open Borough; Fair Share; Side Street Society; The Long Bid                                        |
| Compound    | Districtcraft; Tradefold; Townthread; Parcelworks; Guildgrid; Charterhouse; Blockmarket; Cornerstone Exchange                                                      |
| Invented    | Virello; Novera; Civora; Talora; Meridia; Bravello; Orbinet; Lendera                                                                                               |
| Thematic    | Lantern District; Harbor Ledger; Market Mosaic; Assembly Square; Foundry Row; Meridian Fair; Copper Quay; Bellwether Town                                          |
| Web/dev pun | **Blockparty**; Cache Flow; Property Value; Monolith; Gridlock; Boardroom; Multi-Tenant; Merge Conflict; Corner Case; Vendor Lock-In; Network Effects; Trustbuster |

That is 44 candidates. Do not reserve usernames, register domains, or begin design production based on this list without the workflow below.

The web/dev pun lane works on one mechanism: each name is a web or developer term that is _already_ a money or property word. Cache reads as cash. A CSS `property` takes a `value`. A SaaS platform is multi-tenant, and so is a street of rented addresses. The joke lands with a technical audience without referencing any game. That is why this lane is separate from the two rejected patterns above.

## Shortlist scoring

Scoring is an internal comparative exercise: 1 = weak, 5 = strong. **Risk** is the preliminary _name-shape/association_ risk only, where 5 = lower apparent risk; it is not a clearance result. Searchability assumes ordinary web search behavior and must be tested empirically.

| Candidate        | Memorability | Distinctiveness | Pronunciation | Searchability | Visual fit | Risk (5=lower) | Total / 30 | Notes                                                                                                                                                                                                                       |
| ---------------- | -----------: | --------------: | ------------: | ------------: | ---------: | -------------: | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Civic Exchange   |            4 |               3 |             5 |             3 |          5 |              4 |         24 | Strong match to the recommended territory; descriptive elements may weaken distinctiveness.                                                                                                                                 |
| Districtcraft    |            4 |               4 |             5 |             4 |          4 |              4 |         25 | Clear, ownable-feeling compound; check crowded “-craft” field.                                                                                                                                                              |
| Tradefold        |            4 |               5 |             4 |             5 |          4 |              5 |         27 | Compact and distinctive; validate spoken comprehension.                                                                                                                                                                     |
| Townthread       |            4 |               4 |             4 |             4 |          4 |              5 |         25 | Conveys social connections; may imply a social network.                                                                                                                                                                     |
| Civora           |            4 |               5 |             4 |             5 |          5 |              5 |         28 | Invented, flexible, civic feel; must test spelling recall.                                                                                                                                                                  |
| Virello          |            4 |               5 |             4 |             5 |          4 |              5 |         27 | Musical, friendly invented name; meaning needs intentional definition.                                                                                                                                                      |
| Lantern District |            4 |               3 |             5 |             3 |          5 |              4 |         24 | Vivid thematic system; potentially crowded descriptive phrase.                                                                                                                                                              |
| Harbor Ledger    |            4 |               4 |             5 |             4 |          5 |              4 |         26 | Strategic and warm; test fit if civic setting changes.                                                                                                                                                                      |
| Market Mosaic    |            4 |               4 |             5 |             4 |          5 |              4 |         26 | Social and visual; could sound arts-oriented.                                                                                                                                                                               |
| Meridian Fair    |            3 |               4 |             5 |             3 |          4 |              4 |         23 | Pleasant, but generic word components warrant broad searching.                                                                                                                                                              |
| **Blockparty**   |            5 |               2 |             5 |             2 |          5 |              2 |         21 | Selected on product fit, not on score. Best-in-pool memorability and visual fit. Weak on distinctiveness, searchability, and apparent risk because the open phrase “block party” is crowded. See the decision record below. |

## Current decision

**Blockparty** is the provisional mark. It is adopted for product, design, and content work only. It is **not cleared**. Nothing here says the name is registrable, usable, or available.

Write it as one closed word, **Blockparty**. The open phrase “Block Party” is the plain English term and holds the weakest position of the three forms. Camel case “BlockParty” adds nothing when spoken. Use lowercase `blockparty` for package and repository identifiers once counsel approves the mark.

### Why this name, given a lower score

Blockparty scores 21 against Civora’s 28. The team selected it on product fit instead:

- The world it implies — a closed street, neighbors, folding tables, an open invitation — matches the social promise in [Brand Strategy](brand-strategy.md) more directly than any other candidate.
- Three terms already canonical in the [Glossary](../product/glossary.md) — `seat`, `invite`, and `host` — are literal block-party words. The product is a link-shared private room for up to six people. The name and the product agree.
- It supplies an original world with room for independent districts, events, art, and board topology.

The score gap is real and sits in searchability and apparent risk. Treat it as known debt, not as a solved problem.

### Fallback candidate

Keep **Civora** live as the designated fallback. Do not retire it, and do not delete its score row. If counsel blocks Blockparty, Civora becomes the working mark and the design system re-skins without a structural rewrite.

### Retained for testing

**Tradefold** and **Harbor Ledger** stay in the pool as secondary options.

## Clearance workflow

Engage qualified trademark counsel before adoption or release. The team should document each stage, its date, the exact spelling/logo, relevant goods/services, territories, and reviewer. A knockout search is not full clearance.

1. **Define the mark and use.** Record word mark, stylization, expected goods/services (web game, downloadable software, community services, merchandise if any), jurisdictions, and intended launch date.
2. **Internal collision check.** Search the repository, organization, contributor agreements, prior prototypes, and project issue tracker. Check direct matches, spacing, plurals, phonetic equivalents, translations, and conceptually similar terms.
3. **USPTO search.** Search the USPTO trademark database for exact, similar, phonetic, and design-mark conflicts in related and adjacent classes. Start at [USPTO Trademark Search](https://www.uspto.gov/trademarks/search). Record live/dead status but do not treat a “dead” record as automatic permission.
4. **Likelihood analysis.** Read the USPTO’s [likelihood-of-confusion guidance](https://www.uspto.gov/trademarks/search/likelihood-confusion) and assess mark similarity, related goods/services, channels, consumers, and actual marketplace context. Counsel performs the legal assessment.
5. **Web and social search.** Search general web results, game databases, streaming platforms, major social networks, and common misspellings. Capture dated screenshots/URLs of meaningful results.
6. **Domain check.** Check likely domains and typo variants; a domain being unregistered does not prove trademark availability. Do not infer permission from a parked or unused domain.
7. **App-store check.** Search major mobile and desktop app stores, web-game portals, and gaming marketplaces for exact and confusingly similar names.
8. **Package check.** Search relevant registries (for example npm, PyPI, crates.io, Maven Central, RubyGems, and container registries used by the project) for package/project collisions.
9. **GitHub check.** Search GitHub repositories, organizations, topics, and usernames. Record active projects and confusingly similar open-source projects.
10. **Counsel clearance and decision.** Provide the evidence set to counsel for jurisdiction-specific advice. Decide whether to adopt, modify, abandon, or commission a new candidate.
11. **Secure consistently after approval.** Register domains/handles, publish approved spelling and logo rules, and use the mark consistently. Registration strategy and notices require counsel’s advice.
12. **Monitor and re-check.** Re-run relevant searches before major launches, merchandise, new territories, or substantial product-category expansion.

## Naming decision record template

Copy this into the project’s decision system for each contender.

```md
### Naming decision: <candidate>

- Date / owner:
- Exact word mark and proposed stylization:
- Product and goods/services description:
- Territories and planned launch date:
- Brand territory and rationale:
- Alternatives considered:
- Internal collision check (links/results):
- USPTO search (queries, date, links/results):
- Web/social search (queries, date, links/results):
- Domain results:
- App-store results:
- Package-registry results:
- GitHub results:
- Similarity/confusion notes (non-legal internal assessment):
- Counsel engaged / advice reference:
- Decision: adopt / hold / modify / abandon
- Decision maker and date:
- Required follow-ups (domains, handles, design, monitoring):
- Public-use approval / attorney release gate reference:
```

## Naming decision record: Blockparty

This is the live record. Update it as each clearance stage completes.

- **Date / owner:** 2026-09-02 / _(assign a named owner)_
- **Exact word mark and proposed stylization:** `Blockparty` — one closed word, title case in product copy, lowercase `blockparty` for identifiers. Not “Block Party”, not “BlockParty”.
- **Product and goods/services description:** free, open-source browser game (downloadable/installable PWA); online multiplayer game services; community and contributor services. No merchandise planned.
- **Territories and planned launch date:** _(to be defined)_
- **Brand territory and rationale:** neighborhood street party. Merges Territory A (Civic Exchange) with Territory C (Festival of Fortunes). See [Brand Strategy](brand-strategy.md).
- **Alternatives considered:** Civora (fallback), Tradefold, Harbor Ledger, Cache Flow, Monolith, Property Value, Gridlock, Boardroom.
- **Internal collision check:** _(pending)_
- **USPTO search:** _(pending)_
- **Web/social search:** _(pending — see known collisions below)_
- **Domain results:** _(pending — do not register before counsel)_
- **App-store results:** _(pending)_
- **Package-registry results:** _(pending)_
- **GitHub results:** _(pending)_
- **Decision:** **hold pending counsel.** Provisional internal use only.
- **Decision maker and date:** _(pending)_
- **Required follow-ups:** complete steps 2–10 of the clearance workflow above; keep Civora live as fallback.

### Known collisions to log and assess

Record these during steps 5, 7, 8, and 9. This list is a starting point from ordinary searching, not a clearance result, and it is certainly incomplete.

| Source                                                           | Nature              | Why it matters                                                  |
| ---------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| A 2005 concert documentary film titled _Block Party_             | Entertainment title | High public recognition of the phrase; different goods/services |
| A social-media safety and anti-harassment tool named Block Party | Software/services   | Closest goods/services overlap found so far                     |
| Several crypto/NFT ventures using Blockparty or BlockParty       | Software/services   | Closest spelling overlap; see the web3 rule below               |
| The generic English phrase “block party”                         | Common usage        | Weakens distinctiveness and makes search noisy                  |

### Elevated-risk notes

1. **Crowded phrase.** Searchability scored 2 for a reason. Budget more time for steps 5 through 9 than a coined name would need, and capture dated evidence for each.
2. **Do not begin brand production that is expensive to unwind.** Logo exploration is fine. Printed material, merchandise, and paid placement are not.
3. **The name pulls toward a square grid.** “Block” invites a city-block board. That is the exact trade-dress hazard in [IP safety](../legal/ip-safety.md). The board must stay an irregular street route.

## Public naming rules

- Until approval, use a neutral internal codename and do not publish candidates in marketing, package names, domains, screenshots, or social handles.
- Do not make comparative references to other games to explain the name or product.
- A name approval does not approve logos, wordmarks, board appearance, marketing copy, or third-party assets; each remains subject to [IP safety](../legal/ip-safety.md).
- Keep brand descriptions aligned with [Brand Strategy](brand-strategy.md): original expression, clear social strategy, and no affiliation implication.

### Blockparty-specific rules

- **Never place the mark next to blockchain, web3, crypto, NFT, or token language.** “Block” already reads blockchain to part of the audience. Adjacency invites a false read of the product and increases confusion with the crypto ventures listed above. This applies to marketing copy, metadata, keywords, SEO, README text, social bios, and screenshots.
- Do not use “block” in the game’s currency, wallet, or ledger naming for the same reason.
- Always write the mark closed and unmodified: `Blockparty`. Never “Blockparty.io”, “Blockparty Online”, or a hyphenated form in public copy.
- Until counsel clears the mark, keep [Civora](#fallback-candidate) reachable in design and content decisions. Avoid any choice that only works if the name is Blockparty.
