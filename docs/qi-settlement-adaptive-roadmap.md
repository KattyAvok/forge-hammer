# QI Settlement Support — automatic advice (development checkpoint)

## Corrected product requirement
Day-by-day Fighter and Donor guides are **reference strategies**, not a sequence the player is required to follow. The system must infer the settlement's current development state and compare alternative actions, including whether to build, sell, wait, accelerate production or donate. It must account for actual resources, active vs construction bonuses, euphoria, population, area/roads, unlocked building choices, verified cost, QA availability, remaining season time and fighting needs.

**A historical guide day cannot be inferred uniquely** from a single current map after demolitions. The state model should use inferred development phase and explicit confidence, not pretend to recover the exact past.

## Implemented in this checkpoint
- Pure read-only module: `js/web/qi-settlement-advisor/js/qi-settlement-advisor.js`.
- Extracts recognized building counts from the currently observed QI map.
- Infers one of `foundation`, `early-rebuild`, `rope`, `expansion`, `advanced` or `unknown` with limited confidence.
- Uses current resource bag and no stale map data.
- Detects clear euphoria/population deficits, construction steps, and Donor reserve uncertainty.
- Offers ranked, **non-actionable proposals**: verify cultural shortfall, expansion/goods readiness, limited QI building candidates and possible surplus-cultural removal.
- For metadata candidates reports documented costs only when QI money + QI supplies are explicitly present in the expected price structure; unknown cost stays `null`, not zero.
- Requires separate checks for item unlock, roads, exact placement, payback, season horizon and QA; never labels such proposals executable.
- Donor's displayed surplus is strictly **above manual reserve**, and explicitly not a safe amount to donate without node + building budget.
- The panel now prioritizes automatic analysis from the current QI map and stock. The day-by-day manual picker remains as a secondary **reference**, no longer controls recommendations.
- `QISettlementSupport.Status()` exposes anonymized inferred phase and metadata coverage counts.
- `QISettlementAdvisor.catalogCoverage(FH.Main.CityEntities)` exposes only aggregate coverage (known prices, productions, footprint) and no raw game or account data.

## 2026-10-09 live price-coverage checkpoint
User-verified `QISettlementSupport.Status()` in a live difficulty-9 QI city:
- `running=true`, `hasStock=true`, `hasMap=true`, `mapStale=false`.
- `autoPhase=advanced` with medium confidence, based only on the presence of Bakery. It is **not** proof that an exact Day 4 or later checklist step is complete.
- `qiCatalogCount=13`, `withYield=8`, `withFootprint=13`, `priced=0`; breakdown residential 4, production 4, culture 5. **This is the limited set matching known building aliases and current metadata patterns**, not the complete QI building catalog.
- `priced=0` means the existing parser could not verify a price under the legacy `requirements.cost.resources` path requiring *both* QI money and QI supplies. It does **not** prove that the game lacks prices or that none can be recovered.

**New development-only price-schema discovery**:
Run `QISettlementSupport.PriceDiscovery()` in the game console, inside the QI settlement, after loading the latest branch. Returns only aggregate structural paths and counts of QI resource token occurrences. It does not emit raw payloads, building IDs, player IDs, account state, cost numbers, or coordinates. It limits traversal depth, object keys, paths, and total nodes to avoid unbounded work.

The goal is to establish whether modern metadata exposes construction prices at another nested path. If `definitionsWithQIPriceTokens` remains zero, the next narrowly scoped investigation is to inspect the **existing build-menu response schema**, still without making new game requests. Only after confirming the path may the optimizer use it to decide `sell -> build -> collect/donate` and compute budget/time feasibility.

**Validation:** 54/54 isolated JS scenarios PASS after adding schema-discovery tests. No new Chrome integration test or full Node CLI run yet.

## 2026-10-09 Chrome stale-build fix
The user successfully loaded the automated Donor UI, but `QISettlementSupport.PriceDiscovery()`
threw `TypeError: ... is not a function`. The feature **does exist in branch source**,
so the loaded page JavaScript is behind the branch. The previous extension
manifest stayed at `1.8.1`, and injected modules are fetched with `?v=1.8.1`,
making a cached older build a plausible cause; an older unpacked local folder is
another plausible cause.

The development manifest is now `1.8.1.1` to change injected resource URLs.
The panel and `QISettlementSupport.Status()` expose build marker
`1.8.1.1-qi-price-probe`. The advisor also suppresses unpriced building
suggestions: without a verified price, footprint and yields do not make a
proposed Bakery/Clapboard/Frame House an optimized investment. One extra
regression test ensures unpriced buildings do not appear as ranked build
suggestions.

**Correct replacement procedure:**
1. Unzip the latest branch archive into a NEW directory with its own `manifest.json`.
2. In `chrome://extensions`, remove or disable the previous development
   installation and load the new unpacked directory, or deliberately replace
   all files of the currently loaded directory and press its Reload icon.
3. Confirm version `1.8.1.1` in the Chrome extensions page.
4. Completely reload the Forge of Empires tab (the already-injected JS
   survives a mere extension reload until the page itself is refreshed).
5. Enter QI; run `Object.keys(QISettlementSupport)`, then
   `QISettlementSupport.Status().build`. Expect `PriceDiscovery` and
   `1.8.1.1-qi-price-probe`.
6. Only then call `QISettlementSupport.PriceDiscovery()`.

54/54 isolated JS checks passed against fetched branch sources. These are
not Chrome integration or standalone Node CLI results.

## 2026-10-09 validated live structural price path
User provided sanitized `QISettlementSupport.PriceDiscovery()` from a real QI city:
- `examinedDefinitions = 16`
- `definitionsWithQIPriceTokens = 16`
- `truncatedTraversalCount = 0`
- `components.AllAge.[key].cost.resources`: 16 distinct definitions; all tracked QI money, supplies, alloy keys found (metadata-only structural observations)
- `components.AllAge.production.options[item].products[item].requirements.resources`: 3 definitions, 12 occurrences (production-option inputs, **not** building purchase prices)
- `components.AllAge.production.options[item].products[item].playerResources.resources`: 9 definitions, 12 occurrences (production outputs; **not** building purchase prices)

The `[key]` component name is deliberately redacted by the discovery tool.
The evidence strongly supports the existence of a build-cost branch beneath
`AllAge`, but alone cannot confirm which component supplies the live purchase price
for every building or whether the values are current build-menu prices.

**Code change**:
- New `priceEvidence(definition)` supports a unique direct
  `components.AllAge.<component>.cost.resources` candidate, or one legacy
  `requirements.cost.resources` branch. It does **not** traverse into production
  options, does not infer zero for absent keys, and refuses ambiguous multiple
  candidates or unsupported positive resources.
- `moneyCost` now returns all recognized positive, spendable `guild_raids_*`
  cost keys including Rope/Alloy when observed. Population/happiness/QA pseudo
  resources are excluded from purchase costs and handled separately.
- `catalogCoverage.priced` now measures **parsed metadata candidates**, NOT
  player-confirmed prices. The UI label was changed accordingly.
- `QISettlementSupport.CostSamples()` returns a bounded 16-building set of
  public building names, extracted price candidates, and source labels for
  comparison with the actual QI build menu. No world/player identifiers, map
  positions or raw responses included.
- Development manifest and visible build marker advanced to
  **1.8.1.2** / **1.8.1.2-qi-price-parser**.
- **54/54 isolated JavaScript test scenarios passed** after this change.

**Acceptance test**: install the new version in a fresh unpacked folder,
confirm `QISettlementSupport.Status().build`, enter QI, then call
`QISettlementSupport.CostSamples()`. Compare 1–2 extracted building costs to the
current QI construction menu before considering any cost valid for automatic
sell/build/donate decisions.

**Still not proven**: building unlock state, exact layout, demolition impact,
resource acceleration, remaining horizon and donation-node availability.
Therefore numeric prices alone do NOT complete the full action-sequence optimizer.

## NOT yet implemented or proven
- A full multi-step search/optimization with economic payback and dynamic sell/build/rush scheduling.
- Fully verified construction-price schema in modern QI entity metadata and current QI build-menu availability.
- Map packing, blocked tiles, road connectivity and geometric placement solver.
- Live API contracts for QI army, combat stats, unit costs and selected bonus against upcoming battle.
- QI node-specific donation costs, boosts and remaining season horizon in a shared model.
- Strategy reference for Days 5–11; the user has supplied detailed steps through Day 4-2. Do **not** invent later steps.
- Live Chrome acceptance of this latest automatic-advisor code.

## Validation
Run in a checked-out working branch:

```sh
node --test tests/qi-settlement-*.test.cjs
```

The current five test files passed **54/54 scenarios in an isolated JavaScript execution harness**, using actual GitHub-fetched sources (not full browser or Node CLI acceptance).

After loading the unpacked development extension, enter the QI settlement; read the panel's **Automatická analýza aktuální osady** section and then in the developer console call:

```js
QISettlementSupport.Status()
```

It shows current status, inferred phase and an aggregate QI catalog coverage probe, without player/building identifiers or holdings. If `catalogCoverage.priced` is zero, the next step is to identify the actual QI construction-price metadata path using a separately scoped, sanitized observation. Do not hardcode old guide prices.

## Decision-engine roadmap
1. **P0 data contracts:** production, construction and expansion costs, entity states, unit inventory, QA and battle/donation node costs; verify and test game metadata.
2. **P1 solver:** simulate small change sequences (build, sell, move, await, accelerate) with pop/happiness changes at each intermediate step, goods and resource consumption, production payback and layout feasibility.
3. **P2 objective:** Fighter = expected battle contribution/units/boosts; Donor = expected useful donation contribution after protected investment and QA. Penalize shard usage and human visits by configuration.
4. **P3 acceptance:** compare advice to user-known successful runs on multiple worlds and QI difficulties; reject any action without proof of feasibility.
