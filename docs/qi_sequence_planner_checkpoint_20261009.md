# QI Settlement Support — two-investment economic search (2026-10-09)

Status: implemented on `feature/qi-settlement-support` as a **read-only, heuristic model**, pending live UI validation and authoritative game feasibility rules. User requested fewer interactions: all changes are batched and verified by GitHub Actions; no new screenshot or console input is requested for this increment.

## Goal

Reference Day 1–11 strategies must not be treated as a mandatory order. Evaluate the *current* settlement state and choose economically sensible next action sequences subject to resource constraints. Profiles: Fighter (QI combat/QA advancement) and Donor (production/investment capacity prior to node contributions).

## Delivered: `qi-settlement-sequence` module

A bounded search evaluates:
- build one current QI construction candidate;
- sell an existing passive/non-boosting building, then build a replacement;
- build another building after the first investment decision, using *the same carried-forward stock*.

It is bounded by 12 candidate definitions, 30 initial sale prospects, 36 first choices in the second-stage beam, 500 total evaluated sequences, and up to 8 returned alternatives. Each financial step updates every known spendable QI construction cost, donor-specified reserves, interim free population, total population and euphoria. Positive building benefits become active **after** simulated completion, not during construction. No refunds or collected production between steps are assumed.

A sale reduces provided population, euphoria and modeled production (including all compatible one-option known QI resource outputs); loss of QI action/other boosts is intentionally vetoed. The model prevents a fall below the current euphoria factor at intermediate stages and rejects a known geometry no-fit. An unknown layout is a **blocker**, not proof a footprint is valid.

Per-cycle estimated incremental money/supplies/Alloy and QA bonuses are tracked separately; output changes of multiple buildings are only *approximate* when production cycles differ. Production time `option.time` units and construction completion delay are not yet verified. The planner does **not** add projected production to spendable balances for subsequent purchases.

Ranking uses a documented, dimensionless proxy based on change relative to observed holdings, available population, happiness, QA and investment burden. It is NOT a measured financial ROI, cross-resource exchange rate or global optimum. The UI displays the top 3 alternatives with total cost, intermediate minimum population/euphoria and per-cycle incremental production.

For Donor, the remaining money/supplies above manually entered reserves after the modeled construction plan is displayed *only when both reserves are present* and marked **not safe to donate**. Future upgrades and node cost/QA requirements remain unknown.

Each candidate's `executable` flag remains `false`. No purchase, demolition, rush, donation or server request is performed.

## Planned next gates
1. **Geometry**: convert anonymized area/obstacle diagnostics into actual permissible placement checks, including roads/requirements and genuine free rectangle packing after a sale.
2. **Production timing**: establish authoritative units of `option.time` and existing-cycle completion mechanics, then compare time-weighted resource improvements against the remaining QI horizon. Account for losses and supply/coin production boost changes.
3. **QI nodes**: confirm donation costs and required QA from a node contract, distinguish rewards and negotiation from spendable requirements, and optimize donations after known protected build costs.
4. **Fighter**: obtain actual QI unit inventory, enemy nodes and bonus applicability; do not equate producing more money with combat readiness.
5. **Verification**: expand native Node tests and Chrome acceptance on two worlds; keep the PR draft until real-world checks.

## Automated acceptance

```sh
node --test tests/qi-settlement-*.test.cjs
```

The native CI includes deterministic tests of shared spending, no funding purchases through uncollected production, population/euphoria guards, demolition production loss, QI bonuses, reserve accounting, unknown geometry, and branch isolation. The latest CI run link is recorded on PR #1.

## Product experience
- Automatic phase still uses current city data rather than manually selected historical guide stage.
- New panel section `Scénáře až dvou investičních rozhodnutí` summarizes current-state candidate sequences.
- Manual Fighter/Donor guide is kept lower as context only.
- Existing compact export `copy(QISettlementSupport.ShareReport())` now includes only anonymized sequence status/counts, not map coordinates or player balances.
- Do not request repeated test runs or screenshots from the user for small changes.
