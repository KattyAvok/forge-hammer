# QI Settlement Support — data discovery (phase 1)

Status: QI diagnostic data collection **verified once in a live QI session (2026-10-08)**; derived economy reconciliation not yet re-verified in the browser.
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
- 22 deterministic scenarios in `tests/qi-settlement-core.test.cjs` and `tests/qi-settlement-diagnostics.test.cjs`.

## Run tests locally
Install Node.js (no additional dependencies required) and execute from the repository root:

```sh
node --test tests/qi-settlement-core.test.cjs tests/qi-settlement-diagnostics.test.cjs
```

The 22 scenarios have been executed successfully in an isolated JavaScript test harness against source retrieved from this GitHub branch. **The actual Node test command and real Chrome integration are not yet verified.**

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
Rerun the enabled diagnostics after reloading the extension and game. Collect `economyComparison`, `buildingStateAudit`, and changed `events` after one normal building completion/collection to determine whether the discrepancy comes from construction state or observation timing. Confirm availability of combat stats, military units and expansion costs. Then implement the read-only Fighter/Donor panel on the validated data. The current core performs economic calculations only; it does **not** claim to optimize strategy or issue game actions.
