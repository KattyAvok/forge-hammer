# QI Settlement Support – production collection vs rebuilding (October 2026)

This milestone continues the state-based economic adviser and remains completely read-only. The original Fighter/Donor day guides are reference material, not mandatory checklist instructions. No game purchases, sales, donations, collection, production starts or rush actions are invoked.

## New "wait / review collection before selling" decision

The QI settlement already supplies production states through `CityMapService.getCityMap`. Forge Hammer's CityMap interprets `ProducingState.next_state_transition_in` as seconds. A new pure module `QISettlementOpportunity` inspects up to 300 current entities and identifies:
- `ProducingState` with an observed upcoming state transition, sorted by nearest completion;
- `CompletedState` whose possible pending collection should be verified before any sale;
- production on an ambiguous or multiple-option building, where the amount cannot be stated;
- transition dates that are after the **observed QI season end**, in which case it must not suggest that waiting for that transition will help this QI run.

For one unambiguous production option, a *candidate* cycle output may be displayed using the previously derived current-euphoria and boost model. It is never treated as a verified reward, already collected resources, a permitted sale or spendable stock. Unknown timestamps/choices remain unknown.

The user-facing QI panel now shows the nearest three "review after collection" opportunities and any completed producers. The existing two-sale search continues to **exclude producing and completed buildings** until state changes are observed in a fresh map; the module does not silently allow a sell based on a time estimate. The compact `QISettlementSupport.ShareReport()` includes only publicly named building types, state tags, minute estimates and counts—never raw entity IDs, map coordinates or current holdings.

## Corrected horizon semantics

Previously `QISettlementTiming.theoreticalPlanHorizon()` labeled its net resource projection an `optimistic-upper-bound`. With a demolition that *removes* future production, that is not mathematically an upper bound: shortening the remaining window also reduces the lost output. The projection status is now `zero-delay-comparison`, with `optimisticUpperBound:null`, `spendableGains:null`, and `comparisonOnly:true`. It represents a signed *hypothetical* effect under zero construction delay, instantaneous production start and no interruptions. If timing units are not sufficiently corroborated, it provides no hourly amount at all. The panel wording explicitly rejects any claim of guaranteed future proceeds.

## Testing

The GitHub Actions test workflow executes native `node --test tests/qi-settlement-*.test.cjs`. New tests cover:
- imminent production transition before season end and a transition after QI end;
- completed-state priority and unknown multiple production options;
- never crediting future loot or exposing entity IDs/coordinates in a shared report;
- signed net production losses not being called an upper bound;
- session-independent read-only behavior and prior regression scenarios.

At this checkpoint **166/166 Node.js tests passed** (CI run `37933496220`) before the version marker was advanced.

## Explicit open gates

Actual building unlock/menu availability, connected roads, accepted placement, exact ongoing selected production option, construction time and rush expense, confirmed donation-node price and QA, military units and combat applicability. A user-facing "wait" reminder is not automatic scheduling and never acts upon game servers.

## Development process

The user explicitly requested fewer interactions: do not request per-commit test results or screenshots. Keep batching code/test/documentation in the feature branch and verify CI. Request at most one `copy(QISettlementSupport.ShareReport())` at a future substantive acceptance gate when the missing contracts will materially change the next implementation.
