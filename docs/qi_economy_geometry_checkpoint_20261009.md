# QI Settlement Support: economy + geometry normalization (2026-10-09)

## Observed live data (build 1.8.1.9)
- **Donor**, difficulty 9, a fresh QI map and complete tracked economic bag.
- 5 financially/population-modeled construction scenarios, 3 blocked and 6 replacement scenarios; **none validated for placement or node-specific donation**.
- Geometry declared `insufficient-evidence` because 15 of 54 map entities (30 tiles) were entirely outside the 19 unlocked 4×4 areas. All 15 were in a broad `other` category, with 0 outside roads and 0 outside main buildings.
- Metadata coverage: 13/13 recognized QI definitions have candidate construction prices. QI production: 144 options, 120 with resource inputs, 64 with outputs; every option had `option.time` (time unit not proven).
- QI boost snapshot included +150% money production, +150% supply production, 1180 QI Action Points collection and 4500 capacity. This is the *observed snapshot*, not a permanent game rule.
- Overview resource bundles were present on QI nodes; the old reporter exposed only their structural paths, not exact node costs/meaning.

## Why geometry was blocked
Forge Hammer's existing `CityMap.showQIBuildingList` **explicitly skips** metadata building types `impediment` and `street` in the productivity list, and other citymap handling distinguishes `off_grid`. The v1 geometry algorithm treated every rectangular entity as an owned, placed building, even if it was an impediment on land the player had not unlocked.

**New conservative behavior:** footprint tiles of `impediment` and `off_grid` objects outside unlocked land are omitted from the occupancy index. Their footprint **inside** unlocked land still blocks building placement. All ordinary buildings beyond unlocked bounds still invalidate the geometry model. Counters `ignoredOutsideObstacles`, `ignoredOutsideOffGrid` and `skippedOutsideTiles` allow us to verify whether this is the cause in the user settlement. The change **does not insert a fictitious 16×16 base area**: the live map had 19 actual 4×4 area rectangles and 0 16×16 areas.

## Production investment evidence
The existing Forge Hammer QI building list computes `round(baseProduction * (euphoriaMultiplier + productionBoostPercentage/100))`, except that main-building production excludes these boosts. The new `QISettlementProduction.estimateCycle()` mirrors this formula for buildings with exactly one unambiguous production option and produces per-resource output, input and net gain estimates.

`perResourcePayback()` estimates construction cost payback in **cycles per currency separately** (e.g. only supply-price recovery from supply-producing buildings), never pretending that coin costs and Alloy costs are covered by supply outputs. `option.time` is retained as a metadata number but **time units are not yet validated**, so payback hours and rush priorities stay unverified and no game actions can be triggered.

## Resource-bearing QI nodes
`QISettlementContracts` now counts nested node resource bundles from the **already-observed** map-overview response, by resource type and broad context:
- possible cost (under `cost/requirement/payment/negotiation/donation` property path),
- reward,
- unclassified.

No individual node identifiers, amounts, map coordinates, or response payloads are shared. Bundles are not automatically classified as valid donation prices without verified game semantics.

## Compact report and development practice
`copy(QISettlementSupport.ShareReport())` returns one compact JSON, including geometry validation/omitted impediments, QI node resource bundle coverage, up to six public production cycle estimates, and unresolved gates. No large console dumps, screenshots or multiple commands.

**102/102 native Node.js test cases passed in GitHub Actions** before the version-bump checkpoint (run `37921791626`). Regression cases include:
- impediments on both locked and unlocked land;
- genuine out-of-bounds player buildings (still blocked);
- boosted production and per-currency payback;
- cost versus reward node resource bundles, with numeric cost redaction.

**Still unresolved:** road level, shop unlocking, actual construction placement, precise option-time semantics, node requirements/QA costs and units. The feature branch remains draft and unmerged. Next work should target multi-step economic planning, not more fixed-day guide text.
