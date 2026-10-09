# QI Settlement Support — Time and Donor Budget Milestone (2026-10-09)

Scope: bounded *read-only* enhancement to adaptive QI Fighter / Donor planning. No new FoE requests, game actions, automatic donations or sell/build buttons.

## Current objective

Instead of a fixed day-by-day checklist, compare current city investments and their production potential against the remaining QI period while protecting funds needed for future construction and node contribution. Exact node spending, unit inventory, allowed placement and rush expenses remain unresolved and must not be invented.

## Passive production-time evidence

New `QISettlementTiming.inspect(entities, definitions)` compares:
- `components.AllAge.production.options[0].time` from single-option buildings,
- `CityMapService.getCityMap` entity `state.next_state_transition_in` on current `ProducingState` entities.

It checks possible units seconds / minutes / hours using already-observed values. It returns a candidate unit only when at least three relevant states are compatible, with at least two distinct durations close to the complete production cycle, and only one unit hypothesis meets the threshold. Such evidence is described as **corroborated**, never proved; a mid-cycle or ambiguous snapshot remains `unknown`.

New `QISettlementTiming.theoreticalPlanHorizon(plan,hours,calibration)` only runs when a unit is corroborated, all participating production-step durations are known, and the QI season end is a credible server epoch-seconds timestamp. It calculates a **hypothetical upper-bound scenario** assuming buildings completed instantly and each production cycle could start/finish without downtime, with separate gains and losses for sold/constructed producers. These outputs are explicitly **not spendable balances, safe ROI, nor guaranteed future collections**. If timing is unknown, no numerical hourly prediction is printed. The existing sequence engine keeps raw option time and per-step production gains/losses with the step history.

## Donor budget protection

New `QISettlementDonationBudget.budget({stock, plans, manualReserves})` computes a conservative financial envelope across up to three of the model's current alternative plans:
- for each cost resource, the **maximum construction spend required by an alternative**;
- plus any explicitly supplied manual reserve;
- a remaining stock figure above those commitments, with shortfall if overcommitted.

This is a **reservation / headroom projection**, not a spend instruction. Missing reserves are not presumed approved donations; even with both node cost and QA data supplied, the module will not authorize contribution while actual node unlocking, geometry, cycle times and spending contracts remain unverified. `safeDonation: null` and `donationInstructionAllowed: false` are invariant.

The UI shows top ranked two-investment sequences, observed remaining QI hours, honest time-calibration status, optional purely hypothetical time-bound yield when corroborated, and Donor's maximum future investment budget. The single compact `ShareReport()` export includes **only aggregate timing and Donor-protection status**, not holdings or per-node resource prices.

## Main open gates
1. Observe and verify actual city production time units/option selection, production starts and collection readiness.
2. Verify placement, roads, build-menu options and active effects of demolition/reconstruction in QI.
3. Confirm actual contribution-cost/QA node contract from passive map data; categorize rewards and price possibilities without conflating them.
4. Verify army units, battle requirements and combat boost applicability for Fighter.
5. Verify rush cost and remaining-season resource opportunity cost before recommending acceleration or contributions.

## Verification and working practices

Native GitHub Actions executes `node --test tests/qi-settlement-*.test.cjs` on PR changes. This milestone added tests for unit inference, ambiguous/mid-production timestamps, unknown-duration fallback, guarded hypothetical horizon resources, shared Donor plan reserves and zero safe donations.

No manual user check is requested after this milestone. User should only be asked for **one `copy(QISettlementSupport.ShareReport())` report** at a later substantive integration gate that resolves enough live contracts, without screenshots or multiple one-off probes.

PR remains draft, feature branch only. All operations in game are informational.
