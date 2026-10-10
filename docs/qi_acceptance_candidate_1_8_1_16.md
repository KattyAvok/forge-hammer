# QI Settlement Support — Live acceptance candidate 1.8.1.16

**Development checkpoint:** 9 October 2026. Work is isolated to `feature/qi-settlement-support`. PR #1 stays **Draft**, `main` remains unchanged. The extension is **read-only**: no demolition, build, rush, production start, army action, donation or direct game request is issued.

## Why this version is a live validation gate

The extension now has enough computed decision state to check the integrity of its output against **one real QI city**, rather than asking the user to test individual fixes. It still does **not** have verified construction-menu unlock rules, all road-level constraints, live accepted building placement, exact donation/QA semantics or Fighter army composition. Those need observed gameplay contracts before any claim of an optimal, executable action list.

### 1. Money and every other construction currency

The bounded multi-step search evaluates sequences of up to two sales and two builds under one rolling resource bag. Candidate buildings are selected from QI-marked game metadata and the **financially affordable** set is filtered **before** the top-candidate cutoff. A high-scoring but unpayable building (e.g. Clapboard House) can no longer suppress a cheaper valid choice.

A plan's `remaining` stock and cost reconciliation include **every construction resource spent** (QI money, supplies, Alloy and goods such as Rope), rather than checking only the three headline currencies.

### 2. Separate internal plan verifier

New pure module `QISettlementVerification.audit()` cross-checks each returned plan, in memory:

- summed step construction costs equal the plan's reported total spend;
- every required source balance reconciles to the reported remaining stock;
- manual Donor reserves remain protected;
- interim free population and euphoria are valid;
- any `geometry-sequence-no-fit` candidate has been excluded;
- no scenario or action is incorrectly marked game-verified or executable.

It returns **only an aggregate status and problem names**, not raw quantities, player names, account IDs or city coordinates. The status `internally-consistent` means **arithmetically self-consistent**, not that a building can be placed or a QI node can safely be donated to.

### 3. One compact diagnostics command

The existing command:

```js
copy(QISettlementSupport.ShareReport())
```

returns one JSON object containing:
- development build, QI-running / map-fresh state and difficulty;
- geometry evidence and obstacle-area mismatch, with no coordinates;
- economic plan count and independent `consistency` verdict;
- **up to three public building-name action sequences**, with each operation `sell` or `build`, heuristic index and geometry evidence;
- anonymized budget-protection readiness and tentative QI node contract;
- production-ready/near-collection timing evidence;
- explicit unverified game action gates.

This is the **only** interaction requested from the user at this milestone. It can be taken from the Donor city first. If this report reveals that geometry indexing, node price semantics or shop availability is insufficient, the next implementation should be a targeted passive contract discovery, not a stream of per-fix screenshots.

## Test command and acceptance

```sh
node --test tests/qi-settlement-*.test.cjs
```

The QI suite currently includes 179 native tests, including an end-to-end synthetic Donor map and state, cost conservation, all-spendable-goods validation, busy production protected from demolition, two-demolition/two-build geometry, non-credited future output, and no leaked current holdings or IDs in the compact report. GitHub Actions is the official development CI; the final tagged build's run is recorded on PR #1.

### Expected live verification

1. Install the **single fresh** unpacked `feature/qi-settlement-support` build, check Chrome shows **1.8.1.16**, and reload the FoE page.
2. Enter a running **QI Donor** settlement and ensure it has a fresh city map/stock.
3. Execute **only** `copy(QISettlementSupport.ShareReport())` in Chrome DevTools Console. Paste the copied JSON into the project chat.
4. Key branches:
   - `consistency.status = internally-consistent`: calculation reconciles; **not** proof that construction / donations are actually available.
   - `consistency.status = inconsistent-model`: stop and repair exact invariant failures with synthetic tests.
   - `geometry.status = insufficient-evidence`: continue resolving placement geometry from returned cause.
   - `nodeBudget` returns only possible costs: identify exact live node cost/unlocking/QA response contract; **never infer a safe donation amount** from a candidate.
   - `examplePlans` lists public operations to compare against the actual city without screenshots or disclosing amounts.

Do not ask the user for further screenshots, console commands, or repeated installs until this single gate has been evaluated.
