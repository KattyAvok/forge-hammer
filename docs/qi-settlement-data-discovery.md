# QI Settlement Support — data discovery (phase 1)

Status: opt-in diagnostic implementation, **not validated against a live QI session**.
Branch: `feature/qi-settlement-support`. This is not the Fighter/Donor optimizer.

## Confirmed from Forge Hammer source
- `FH.proxy.addHandler(service, callback)` can observe replies already received by the game.
- `CityMapService.getCityMap` includes `gridId`, `entities`, `unlocked_areas`. Existing main module recognizes the `guild_raids` map.
- `GuildRaidsService.getState` exposes a running/pending state and raid difficulty.
- `CityProductionService` and `CityMapService` update building states.
- `ResourceService.getPlayerResourceBag` is filtered to `PlayerMain` by the original resource handling; the new diagnostic listener is independent.
- `CityMap.guild_raids` uses city-entity metadata to calculate QI population, euphoria, production and local bonuses.

## Unconfirmed: verify with real game traffic
1. Actual resource bag type for QI; whether QI stock is provided at all via the observed resource methods.
2. Whether the QI city map `gridId` is always exactly `guild_raids`, including resume/reload.
3. Reliable incremental updates and whether the existing city-map handler exposes all construction/production changes.
4. Available fields/endpoints for army composition, battle boosts, expansion costs, and current QI action points.
5. Start/end/reset behavior; whether progress or map snapshots can be stale after a new season.

## Data safety
Diagnostic collection is **disabled by default**. It contains only event counts, selected resource bag type labels, QI-only numeric resource amounts, and basic map counts. It keeps no raw responses, request bodies, building/player/guild identifiers, tokens, or arbitrary text; it does not send game requests, store snapshots or transmit reports elsewhere.

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
Compare the report's event counts and numeric holdings against the QI screen, then implement a typed, read-only normalized QI state with explicit unknowns and fixture tests. Only afterward import Fighter and Donor versioned templates.
