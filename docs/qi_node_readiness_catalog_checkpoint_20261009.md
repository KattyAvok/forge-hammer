# QI Settlement Support — Cost contracts, production readiness and metadata discovery

Development milestone: 2026-10-09. Work is confined to `feature/qi-settlement-support`. PR #1 stays draft and main is unchanged.

## Scope of this increment

The current user request is to keep implementing the state-driven QI Fighter / Donor economic optimizer while minimizing human interaction and relying on automated CI. This checkpoint advances three contracts without claiming gameplay accuracy not established in live evidence.

### 1. Catalog from QI metadata rather than the historical guide

Previously `rankBuilds` would silently exclude buildings whose name did not match the manually transcribed Day 1–4 guide. It now considers every recognized QI-marked residential, production or culture definition with a footprint and economic benefit. It still checks game metadata price, per-resource affordability, population and QI relevance. The manual guide's aliases are retained only for phase estimation and historical reference.

`catalogCoverage` reports the broader number of QI-marked economic definitions and `guideNameRecognized` for reference. Neither number proves an item is available in the current construction menu; **build-menu unlock and road/placement verification are open**.

### 2. Passive QI node resource-contract assessment

New pure module `qi-settlement-node-budget`:
- Consumes only `GuildRaidsMapService.getOverview` traffic already received by Forge Hammer.
- Scans resource bundles within nodes with hard depth / node limits.
- Distinguishes clearly labeled `cost`/`requirements`/`payment` candidates from rewards, ambiguous alternatives and unknown structures.
- Extracts the candidate's QI resource keys in memory, without saving node IDs, player/guild identifiers or coordinates. Unknown positive spendable resource types make a price incomplete, rather than silently free.
- Reports aggregate counts of nodes with exactly one candidate, ambiguity, unclassified resource bundles, raw-budget coverage and coverage after the **maximum protected investment envelope** from the top alternative Donor plans. It never presents numeric node prices or player inventory in the public compact report.
- A bundle with a cost-like property path is **not evidence of an actual currently payable donation**. The report always includes `nodeCostSemanticsVerified:false`, `nodeAvailabilityVerified:false`, `safeDonation:null`, `donationInstructionAllowed:false`. QA and game node progression rules remain unverified.

### 3. Observed QI production transition readiness

New `qi-settlement-readiness` uses `ProducingState.next_state_transition_in`, which Forge Hammer's existing CityMap interprets as seconds. It reports only the number of active productions, transitions within 1/3/24 hours and the nearest transition in minutes. It does **not** infer that a reward was collected or available as money/supplies. `CompletedState` is not assumed collectable without validating game semantics.

The UI shows this passive readiness alongside the already guarded cycle-length inference from `option.time`.

### 4. UI performance

The multi-step planner is now cached by current map/bag revision, selected Fighter/Donor profile, manual reserves, and known QI production/QA boosts. Cache reuse is checked in native Node VM tests, including invalidation after a new resource-bag observation or changed boost.

### Verification

Run `node --test tests/qi-settlement-*.test.cjs`. Native GitHub Actions:
- **142/142 PASS** on [run 37926469681](https://github.com/KattyAvok/forge-hammer/actions/runs/37926469681), covering catalog discovery, candidate node accounting, strict unknown-cost safety, production readiness and planner cache.
- Browser acceptance is not yet performed for this new milestone.

### Next high-value engineering gates

1. Verify actual node cost, QA and unlock field contracts before permitting any user-facing `darovat` amount.
2. Confirm current construction-menu availability and real footprint/road geometry. The placement solver is still intentionally non-executable.
3. Build a time-aware objective on verified chosen production options and construction completion, not per-cycle totals of incomparable durations.
4. Add QI unit counts and enemy-node data for Fighter. A heuristic score based on Alloy is not a substitute for combat readiness.
5. Request at most **one** privacy-safe `copy(QISettlementSupport.ShareReport())` after a later consolidated milestone; no screenshot/per-commit checks.
