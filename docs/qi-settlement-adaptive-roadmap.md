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

The current five test files passed **44/44 scenarios in an isolated JavaScript execution harness**, using actual GitHub-fetched sources (not full browser or Node CLI acceptance).

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
