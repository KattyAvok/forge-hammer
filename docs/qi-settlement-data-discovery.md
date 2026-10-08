# QI Settlement Support — data discovery (phase 1)

Status: opt-in diagnostic and pure economy core implemented, **not validated against a live QI session**.
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
- `QISettlementCore.donationCapacity`: conservative donor calculation; protected amount = max(minimum reserve, planned costs + buffer).
- The diagnostic module uses these functions, exposes aggregate economy results and clears previous season's snapshots on pending state or a changed season end timestamp.
- 14 deterministic scenarios in `tests/qi-settlement-core.test.cjs` and `tests/qi-settlement-diagnostics.test.cjs`.

## Run tests locally
Install Node.js (no additional dependencies required) and execute from the repository root:

```sh
node --test tests/qi-settlement-core.test.cjs tests/qi-settlement-diagnostics.test.cjs
```

The 14 scenarios have been executed successfully in an isolated JavaScript test harness against source retrieved from this GitHub branch. **The actual Node test command and real Chrome integration are not yet verified.**

## Unconfirmed: verify with real game traffic
1. Actual resource bag type for QI; whether QI stock is provided at all via the observed resource methods.
2. Whether the QI city map `gridId` is always exactly `guild_raids`, including resume/reload.
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
- Static review is not a substitute for a test in Chrome. No live-game integration tests were executed.

## Next smallest step
Compare the report's event counts and numeric holdings against the QI screen, especially resource bag types and whether the game emits current QI holdings. Confirm availability of combat stats, military units and expansion costs. Then implement the read-only Fighter/Donor panel on the validated data. The current core performs economic calculations only; it does **not** claim to optimize strategy or issue game actions.
