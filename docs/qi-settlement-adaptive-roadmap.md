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

## 2026-10-09 construction price samples and scenario simulator

The user supplied a live `QISettlementSupport.CostSamples()` object:
- `schemaVersion:1` and `summary:{priced:16,ambiguous:0,unknown:0}`.
- All 16 recognized building definitions produced a **single unambiguous metadata-candidate cost** at `components.AllAge.[component].cost.resources`.
- Examples: Bakery 84,000 QI money / 100,000 QI supplies / 1,000 Chrono Alloy; Alchemist 50,400 / 60,000 / 200; Clapboard House 210,000 / 200,000 / 1,000; Ropery 45,000 / 22,500 / 200. Some starter buildings (e.g. Tannery) have only QI money listed in the metadata price object.
- Metadata costs are not yet individually cross-checked against the game's building purchase UI. Building-unlock rules and placement are not verified.

### Implemented: read-only economics for possible build and replacement orders
- New pure module `js/web/qi-settlement-simulator/js/qi-settlement-simulator.js`, loaded after the advisor and before UI.
- `quoteBuild` determines whether the given QI resource bag covers **every recorded positive cost** after protected reserves, and reports per-resource shortages, remaining balances, population used immediately during construction, and population/happiness after completion.
- `quoteReplacement` models **sell → build → complete**, accounting for immediate loss of active population/happiness on demolition, then for construction population consumption. It rejects population-negative intermediate states, refuses to classify a sale as a viable scenario when it would remove recognized QI bonuses, and reports raw footprint-area differences.
- `explore` combines known building definitions and the current mapped buildings into bounded preview choices. Duplicate names are collapsed and none are marked executable.
- The panel now renders cost/stock/population quotations and possible sale–build replacements in a separate section `Ekonomické varianty z aktuálních cen` before the manual reference plan.
- Donor preview requires manually entered reserves; the planned investments do **not** yet compute a complete node-specific donation buffer.
- Development build `1.8.1.3-qi-scenario-preview`, manifest `1.8.1.3`; 63/63 isolated JS test scenarios PASS, including synthetic balances with the live-observed Bakery and Clapboard price fixtures.

**Limits:** this is constrained budget/state simulation, *not* a global optimum. It has no verified free-rectangle map packing, road/availability check, real game unlocking, dynamic production time, rush currency, resource production schedule, donation node requirements, enemy composition, or remaining time before season end. A positive model result is NOT a valid instruction to buy or demolish; the UI labels such results as scenarios.

### Next acceptance gate
1. Reload fresh `1.8.1.3` dev extension in Chrome and enter QI.
2. Compare 1–2 metadata prices with the actual construction menu; do not spend resources just for testing.
3. Confirm the economic scenario section shows prices, projected leftover resources and interim population, with all actions remaining unconfirmed.
4. Investigate unlocked buildings and free tiles/roads, then add projected production cycles and remaining-QI-horizon scoring. Only after these contracts are validated can optimization reliably rank whole sequences including donating and resource acceleration.

## 2026-10-09 affordability-first recommendations (bug fix)

Live screenshot from a difficulty-IX, Donor-mode QI city showed a disabled
`Clapboard House` entry in the building menu, while the advisory panel listed
it as its highest-ranked building candidate, with listed construction costs
of 210,000 QI money, 200,000 QI supplies and 1,000 Chrono Alloy. The user
confirmed it could not be afforded. Root cause in code: candidate ordering used
the strategic `score` while the advisor filtered only `cost !== null`,
ignoring its already calculated `affordable` and `populationOK` fields.
A second truncation to the top five candidates could mask affordable
lower-scoring alternatives. The economic simulator also displayed budget-
blocked candidates in its main list instead of a separate rejected group.

Fix in `1.8.1.4-qi-affordability-gate`:
- The advisor recommends priced build candidates **only if affordable === true
  AND populationOK === true**. Without verified placement, roads and unlock,
  this still does not constitute a fully executable recommendation.
- Budget or population failures are captured separately in
  `blockedBuilds`, with deficits for each recorded resource.
- Candidate ranking occurs before affordability filtering, without silently
  dropping lower-scoring cheaper choices via early top-five truncation.
- The simulator lists economically modeled builds separately from
  `blockedBuilds`. Replacement consideration may use a candidate that is
  budget-covered but population-blocked if removing an existing building first
  would clear that constraint; no budget shortfall is assumed to be funded by
  demolition, and no game action is performed.
- A missing explicitly specified Donor reserve is **unknown**, not zero.
- The panel now separates `Finančně nebo populačně nedostupné stavby`
  from possible build/replacement scenarios. Clapboard should appear only
  in the blocked section with its missing resources when the current
  holdings are insufficient.
- Three new regression scenarios cover donor affordability, unknown reserves,
  and higher-score blocked Clapboard versus affordable Bakery.
- **66/66 isolated JavaScript scenarios pass** on branch-fetched source;
  no new browser acceptance or real Node.js test CLI has been run.

**Still open:** actual build-menu availability/technology locks, contiguous
free placement and road connections, production/rush time and donation-node
economics. Never label a budget-covered building `can build now` until
these constraints are verified.

## 2026-10-09 two-world screenshot acceptance and Donor fallback

The user provided screenshots of both the Fighter and Donor settlements
running version `1.8.1.4-qi-affordability-gate`. The economic state is
world-specific and the distinct worlds load separate inventories. The screenshots
confirmed two issues:

- In Fighter mode with plentiful QI money/supplies/Alloy, the module lists
  economically feasible builds, but their strategic priority for combat remains
  unvalidated without units/boosts, road access, and payback horizon.
- In Donor mode with unconfigured manual reserves, the UI previously **refused
  to render any construction scenarios**. This incorrectly conflated two
  different questions: (a) can the observed inventory cover a construction price?
  (b) can the player safely spend or donate that inventory after future costs?
  The first can be estimated even when the second is unknown.

**Fix implemented in dev version `1.8.1.5-qi-donor-gross-budget`:**

- `rankBuilds()` now records `grossAffordable` and `grossShortages` separately
  from reserve-aware `affordable` / `shortages`. Unknown explicit reserve is
  still **null**, never silently coerced to 0.
- Donor strategic scoring now considers both coin and supply production;
  formerly the supplies focus could eliminate money-producing housing entirely.
- The panel runs read-only scenarios without requiring complete reserve inputs.
  It labels any gross-only result **`Předběžně kryto ze skladu`**, with an explicit
  warning that this is **not** a safe spend/donation decision. Already-entered
  partial reserves remain protected in the scenario calculation.
- Unaffordable buildings are shown separately with the missing QI resources
  even if no reserve has been configured. This makes blocked expensive
  housing visible while other budget-covered construction candidates remain
  visible for comparison.
- `Status().reserveMode` reports `gross-only`, `manual-protected` or
  `not-applicable` without exposing holdings.
- The optional historical guide was moved below current financial scenarios
  and reserve controls to prioritize adaptive decisions.
- **69/69 isolated JavaScript tests pass**, including headless Donor-panel
  rendering with synthetic stocks, a gross blocked Clapboard and a gross-covered
  Bakery, and explicit distinction of partial/complete reserve settings.
  This has not yet been run against the latest live Chrome UI or via actual Node CLI.

**Remaining critical limitation:** safe donation cannot be derived merely from
a cash balance or a manually supplied reserve. It requires a projected
investment schedule, node-specific donation requirements, QI action constraints
and available time. Current gross results are diagnostic planning information,
not game action recommendations.

## 2026-10-09: Donor upper-panel visibility (1.8.1.6)

A live Donor-mode screenshot confirmed the extension displays v1.8.1.5,
price coverage 13/13, and correctly marks Clapboard House as blocked.
However, the top screen also said no investment met all restrictions
because manually protected reserves were absent. The lower gross-budget
section was off-screen, so its browser rendering could not be confirmed.

v1.8.1.6 now exposes an explicit `grossBuilds` list (price covered from
observed stock and population viable, but NOT a safe recommendation) in
the first `Automatická analýza` section. It also lists *gross* shortages
next to blocked building names, making the blocked currency and missing
amount visible without scrolling. Under an incomplete donor reserve,
investment safety remains unknown, and the advisor explains this instead
of claiming no financially covered building exists. The simulator and
donation safety gates remain unchanged; no game actions occur.

Tests: 69/69 isolated JavaScript cases pass, including separate covered
Bakery and missing-money Clapboard in a synthetic Donor snapshot with
no configured reserves. Chrome acceptance of v1.8.1.6 is still pending.

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
