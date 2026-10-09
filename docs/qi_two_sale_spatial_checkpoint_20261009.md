# QI Settlement Support — Co-placement and safer demolition (October 2026)

Development checkpoint on `feature/qi-settlement-support`; PR #1 remains draft. The extension remains read-only and does not create game requests, purchases, demolitions, donations, rushes or production starts.

## Why this matters

Economic models were already capable of quoting and ranking multiple builds. The earlier geometry probe checked each building in isolation; two proposed buildings might each appear to fit in the same space, even though they could not coexist. Also, the sell-candidate generator considered actively producing or completed-production buildings, despite their not-yet-collected output.

## New conservative geometry evidence

New `QISettlementGeometry.probeSequence(index, definitions, removedRectangles)`:
- Tests **one or two** axis-aligned QI building footprints together against a current indexed set of unlocked/free cells.
- Supports freeing occupied tiles of up to **two** verified, non-overlapping demolished building footprints; refuses nonexistent, out-of-area, street or overlapping released rectangles.
- Rejects only a proven `geometry-sequence-no-fit`; missing/ambiguous maps or exceeded search limits return `unknown`.
- Reports no map coordinates or IDs in its public status and always has `roadLevelsVerified:false`, `futureShopAvailabilityVerified:false`, `actionable:false`.
- Does not infer rotations, road level, actual build-menu eligibility, obstacle-removal cost, or whether the game server accepts the placement.

## Sequence search improvement

The bounded state-driven planner:
- Carries the same geometric evidence through `build`, `sell -> build`, and `sell -> build -> build` so the second building cannot reuse the first's cells.
- Also explores a limited number of `sell -> sell -> build` sequences, and can then try another build under the same shared financial and spatial constraints.
- Checks free population and euphoria at **each intermediate demolition**, not only after the final building.
- Assumes **no sale refunds** or production collection between decisions, preserving Donor reserve buffers across the proposed sequence.
- Excludes `ProducingState` and `CompletedState` buildings from possible sales. This is conservative because actual uncollected production and collection opportunities are not priced by the simulator.
- Returns `doubleSalePairsInspected`, `skippedBusySaleCandidates`, and anonymized co-placement status counts in the public compact report.
- Keeps all proposals `executable:false`; a positive footprint check is *not* a verified game placement.

Search remains bounded: maximum two build definitions, two original building sales, up to 12 catalog building candidates, up to 12 considered sale prospects in two-sale exploration and a finite beam. Search is therefore a heuristic shortlist, not a guaranteed global optimum.

## Verification

Run `node --test tests/qi-settlement-*.test.cjs` locally or through the PR's GitHub Actions. Native tests cover:
- mutually incompatible 2×2 footprints and simultaneous 2-building fit;
- genuine land freed by one or two non-overlapping demolitions;
- invalid/out-of-area/overlapping demolition evidence failing closed;
- integrated planner rejecting two buildings that only fit separately;
- a two-sale replacement that does fit and shares one resource budget;
- refusal to sell a producing or completed production;
- intermediate population/euphoria protection and absence of automated gameplay.

**156/156 native Node.js tests passed** in GitHub Actions run [37931902833](https://github.com/KattyAvok/forge-hammer/actions/runs/37931902833) before the final metadata/version checkpoint.

## Remaining gates

- True road-level/connection requirements, construction menu unlocks and the accepted server placement map.
- Reliable timing of active production, build completion, rush cost and collection state.
- Actual node donation and QA cost contracts (cost-like response paths remain unverified).
- Fighter army/encounter state and battle impact rather than generic economic heuristics.
- Larger search completeness / benchmark checks with the user's real two-world QI snapshots.

No user check is requested for this increment; in a later major integration gate, prefer one `copy(QISettlementSupport.ShareReport())` response and no screenshots.
