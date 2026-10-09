# QI Settlement Support — data discovery (phase 1)

Status: QI diagnostic collection and economy reconciliation confirmed with live before/after snapshots (2026-10-08–09). The optional construction forecast itself remains untested in Chrome.
Branch: `feature/qi-settlement-support`. This is not the Fighter/Donor optimizer.

## Confirmed from Forge Hammer source
- `FH.proxy.addHandler(service, callback)` can observe replies already received by the game.
- `CityMapService.getCityMap` includes `gridId`, `entities`, `unlocked_areas`. Existing main module recognizes the `guild_raids` map.
- `GuildRaidsService.getState` exposes a running/pending state and raid difficulty.
- `CityProductionService` and `CityMapService` update building states.
- `ResourceService.getPlayerResourceBag` is filtered to `PlayerMain` by the original resource handling; the new diagnostic listener is independent.
- `CityMap.guild_raids` uses city-entity metadata to calculate QI population, euphoria, production and local bonuses.

## Added in this branch
- `QISettlementCore.normalizeRun`: distinguishes running, pending and unknown runs.
- `QISettlementCore.normalizeQIStock`: only recognized numeric `guild_raids_*` holdings, preserving observed zero and unknown absence.
- `QISettlementCore.normalizeMap`: structure-only city summary; no entity IDs.
- `QISettlementCore.deriveEconomy`: economy computed from game entity metadata, with explicit unknowns on missing definitions.
- `QISettlementCore.donationCapacity`: conservative donor calculation; protected amount = max(minimum reserve, planned costs + buffer), defaulting to QI money/supplies only. Other goods require explicit node-specific allowlisting.
- The diagnostic module uses these functions, exposes aggregate economy results and clears previous season's snapshots on pending state or a changed season end timestamp.
- `QISettlementCore.reconcileEconomy` and `auditBuildingStates`: compare direct bag totals with simulated building totals, and summarize population/euphoria by coarse construction/production states.
- 25 deterministic scenarios in `tests/qi-settlement-core.test.cjs` and `tests/qi-settlement-diagnostics.test.cjs`.

## Run tests locally
Install Node.js (no additional dependencies required) and execute from the repository root:

```sh
node --test tests/qi-settlement-core.test.cjs tests/qi-settlement-diagnostics.test.cjs
```

The 25 scenarios have been executed successfully in an isolated JavaScript test harness against source retrieved from this GitHub branch. **The actual Node test command and real Chrome integration are not yet verified.**

## Initial live observation (2026-10-08)
A user-supplied, sanitized schema-v1 diagnostic report confirmed:
- One `ResourceService.getPlayerResourceBag` response of type **`PlayerMain`** includes actual `guild_raids_*` holdings.
- `GuildRaidsService.getState`, `GuildRaidsMapService.getOverview`, and `CityMapService.getCityMap` were observed in an active difficulty-8 session.
- The snapshot successfully produced 70 map entities, 21 unlocked areas, 36 producing states, with no missing city-entity definitions.
- Building-metadata totals exceeded observed resource-bag population capacity by **150**, free population by **150**, and happiness by **750**, even though the implied used population was identical in both sources. Cause is **unknown**; candidate explanations include construction lifecycle and observation timing. Do not silently substitute inferred map totals for observed current state.
- Both observed and calculated euphoria/population ratios imply the maximum euphoria multiplier for this snapshot.
- No military/army methods were observed. That is missing evidence, not proof that the game does not expose these APIs.

The schema-v2 diagnostic adds `economyComparison` and `buildingStateAudit`. Its purpose is to identify state groups contributing to these discrepancies without exposing map positions, account identifiers, building IDs or exact personal resource holdings.

### Second city: independent schema-v2 observation
A second live report came from a different QI settlement, evidenced by a different
map size and economic state (54 entities / 19 unlocked areas, compared with 70 / 21
in city A). Both were difficulty 8 and both contained exactly 3 construction-like states.

| Anonymized difference (map-derived minus bag-observed) | City A | City B |
| --- | ---: | ---: |
| Total population | +150 | 0 |
| Available population | +150 | 0 |
| Happiness | +750 | +2,925 |
| Used population | 0 | 0 |
| Construction-group population provided | 150 | 0 |
| Construction-group happiness | 750 | 2,925 |

Both snapshots match the following **hypothesis** exactly: positive population and
happiness bonuses of construction-state buildings are counted in the metadata-only
sum but are not yet active in the current game resource bag. Population consumption
from construction-state buildings appears accounted for already, because used
population differences are zero. This is strong cross-city evidence, **not proof for
all construction-state variants**.

The new `QISettlementCore.attributeConstructionGap` function checks whether a
construction-group contribution exactly matches the observed difference and
reports `exactMatch: true/false/null`; it does not alter the game's current values
or presume that matching establishes causality. The diagnostic now includes
`constructionAttribution` when a comparable state group is available.

### City A: after three building completions (2026-10-09)
A follow-up schema-v2 report for the 70-entity, 21-area QI city showed no
construction-state buildings and exact agreement between the observed QI resource
bag and metadata-derived totals:

| Measure | Before completion | After completion | Change |
| --- | ---: | ---: | ---: |
| Total population (resource bag) | 1600 | 1750 | +150 |
| Available population (resource bag) | 250 | 400 | +150 |
| Happiness (resource bag) | 4550 | 5300 | +750 |
| Derived minus observed, all three values | nonzero | 0 | reconciled |
| Used population (both sources) | 1350 | 1350 | unchanged |
| Construction states | 3 | 0 | -3 |

All three added positive contributions match the initial construction-state
metadata group. The remaining completed/producing/idle categories together
account for all 70 entities. No building positions, identifiers or raw responses
were retained. This is **before-and-after evidence** consistent with positive
population/happiness effects activating on completion, with consumption already
reserved earlier. It does not establish the exact rule for every future building
or intermediate map update.

The new `QISettlementCore.forecastConstructionCompletion` provides a **conditional**
positive-effect forecast only if the current resource bag and state audit agree
exactly (`attributeConstructionGap.exactMatch === true`); otherwise it returns
`null`. This function is for the future planner, and has not been independently
tested against the live Chrome runtime. The user-supplied report remains
schema v2; the forecast function does not change diagnostic report fields.

Other observations:
- Running difficulty advanced from 8 to 9; difficulty alone is not a
  season-identity key. The current diagnostic reset key is the game-provided
  `endsAt` timestamp (kept in memory, excluded from reports).
- Five `CityProductionService.pickupProduction` events were observed,
  compared with none in the initial sample. This supports the event hook but
  **does not attribute inventory deltas to individual collections**.
- Producing states fell from 36 to 2, while the report separately classified
  36 as completed and 32 as idle. Counts change as collection/state transitions
  happen; they must not be used as a fixed number of production buildings.
- The resource bag remains `PlayerMain`; the latest diagnostic included
  five observations. QI balances were accessible after collection.
- No army/units endpoints were observed. This remains an unresolved prerequisite
  for the Fighter-specific planner.

### Known issues and next validation
- In both reports, `economy.complete` is true while `buildingStateAudit` counts
  16 entries with absent/non-object static resource blocks, mostly in producing
  and idle groups. These are **different definitions of completeness**:
  `deriveEconomy` treats absent stat keys as zero, while the audit marks absent
  blocks as unknown. Do not interpret the audit's unknown count as a proven
  defect or assert all metadata is complete without examining those types.
- The diagnostic's map-derived counts are updated only when a fresh
  `CityMapService.getCityMap` response arrives. A post-construction test should
  **leave and re-enter QI** (or reload normally) and confirm this event appeared
  before comparing snapshots. No extra requests to the game should be sent.
- Distinct source-world identities are not included in the sanitized report.
  Future stored preferences should be scoped to game world + player, but player
  identifiers must not be included in diagnostic output.
- The first report shown for the supposed second city repeated all values of
  city A; it is **not** treated as independent evidence. The 54-entity report is
  the second distinct observation.

## Unconfirmed: verify with real game traffic
1. **Confirmed in two QI city samples:** `PlayerMain` bag includes QI resources. Verify whether it updates correctly after purchases, donations and production collections.
2. QI map was observed; confirm grid ID stability through repeated entry/resume and action sequences.
3. Reliable incremental updates and whether the existing city-map handler exposes all construction/production changes.
4. Available fields/endpoints for army composition, battle boosts, expansion costs, and current QI action points.
5. Start/end/reset behavior; whether progress or map snapshots can be stale after a new season.

## Data safety
Diagnostic collection is **disabled by default**. It contains only event counts, selected resource bag type labels, QI-only numeric resource amounts, aggregate map counts and derived economy totals. It keeps no raw responses, request bodies, building/player/guild identifiers, tokens, or arbitrary text; it does not send game requests, store snapshots or transmit reports elsewhere.

## Testing procedure
1. Disable the existing store-installed Forge Hammer while testing; Forge Hammer explicitly detects duplicate installations.
2. Load the checked-out fork through Chrome Extensions > Developer mode > Load unpacked, in a separate Chrome profile.
3. Open the game DevTools console; run `QISettlementDiagnostics.enable()`, then reload.
4. Enter QI settlement; open relevant buildings, produce/collect once, inspect `QISettlementDiagnostics.report()`.
5. Return to main city and verify QI city events are no longer added.
6. Run `QISettlementDiagnostics.disable()`. This clears the in-memory report and disables subsequent collection.
7. Share **only the sanitized report** after manually checking it for unwanted information.

## Limitations
- The report is in-memory only and resets on page reload. The opt-in flag alone persists (as `Hammer.QISettlementDiagnosticsEnabled`). This lets startup responses be observed after reload.
- A missing source or unobserved resource is unknown, never interpreted as zero.
- The report may expose numeric QI holdings; do not share it publicly without review.
- Static review is not a substitute for a test in Chrome. Two distinct live city snapshots have been provided (schema v1 for city A and schema v2 for both city A and city B); the new construction-attribution addition and later features have not been live-tested.

## Next smallest step
Complete source discovery for unit counts, combat stats and expansion costs. Implement a read-only Fighter/Donor profile panel using the authoritative resource bag for current holdings, and use metadata-derived construction forecasts only behind explicit evidence checks. Capture QI state changes and avoid displaying stale map-derived values as current after building/production updates. Then implement the read-only Fighter/Donor panel on the validated data. The current core performs economic calculations only; it does **not** claim to optimize strategy or issue game actions.
