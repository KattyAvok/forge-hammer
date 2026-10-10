# QI Settlement Support — first read-only panel (MVP)

Status: implemented on `feature/qi-settlement-support`, NOT yet accepted in live Chrome.
Scope: status and manual guide only; **no automatic gaming, purchases, donations or API requests**.

## What the panel does
- Adds a **QI** button in the Forge Hammer HUD; usable only when `FH.ActiveMap === 'guild_raids'`.
- Opens a native `FH.HTML.Box` with Fighter / Donor mode.
- Shows current QI money, supplies, Chrono Alloy, Rope and Quantum Actions from observed `ResourceService` responses.
- Shows observed population, available population and euphoria from the QI resource bag, not the naive projected entity sum.
- Warns if the last QI map is missing or became stale after a building or production action. It does not request a refresh itself.
- Uses a conditional construction forecast only when direct resource-bag and map-derived gaps are exactly attributed to the construction group.
- Shows **versioned, manual** Fighter / Donor strategy stages based on the supplied source guide, 8 stages each.
- Donor supports manually supplied minimum reserves for QI money/supplies. The calculated amount is explicitly labeled a **surplus over a user-entered reserve**, **NOT** a verified safe donation amount, because planned building prices, node costs and QA capacity are not available.
- Fighter explicitly reports unit composition, combat buffs and enemy information as unknown pending verified APIs.
- Stores only selected profile, manual stage and manually set reserves, scoped to `world + player` in origin-local Forge Hammer storage. It does not store raw responses or export identifying keys.

## Install for testing
1. Download or clone the `feature/qi-settlement-support` branch from the user's fork and unpack it.
2. In `chrome://extensions`, disable the existing Forge Hammer and **Load unpacked** the dev version (with `manifest.json`).
3. Reload Forge of Empires. Enter Quantum Incursions settlement.
4. Look for the new **QI** toolbar entry. Click it. Confirm that the status panel is visible.
5. Toggle Fighter / Donor, select a guide stage, set reserve values in Donor, switch back to Fighter and then Donor.
6. Collect a completed production normally: the map should show a stale warning until a fresh `CityMapService.getCityMap` response is observed after re-entering QI.
7. Return to main city. QI panel should not open outside the QI map.
8. Test on a different world/player: selected profile, stage, reserves should be isolated.
9. Verify no duplicate FoE Helper/Hammer extension is running concurrently.

## Test command

```sh
node --test tests/qi-settlement-core.test.cjs tests/qi-settlement-diagnostics.test.cjs tests/qi-settlement-strategies.test.cjs tests/qi-settlement-support.test.cjs
```

36 test cases passed in an isolated JavaScript harness against GitHub-fetched branch sources, including mocked event/state and a lightweight DOM rendering smoke test. The real `node --test` command and actual Chrome UI have **not** yet been run in this session.

## Gaps before strategy automation
- Validate native Forge Hammer window / menu integration in Chrome.
- Observe entity construction prices, expansion prices and exact research/production options from live game metadata; do not use hardcoded old guide costs.
- Observe military-unit counts, army losses and QI-specific combat boosts from live game traffic.
- Track building changes incrementally or force map aggregates to remain marked stale until game itself emits fresh `getCityMap`; never display an old map as authoritative.
- Stage completion is manual. Derive and verify prerequisites only after dynamic data is available.
- Confirm the multiplayer-world preference key behavior in the installed Chrome build.
- Respect game's extension/addon and fair-play rules.

## Data provenance
Fighter/Donor steps are a versioned transcription of the two player-provided Day 1–4 notes. They are **not** guaranteed optimal and have not been confirmed against the current QI balance. Ambiguities (e.g. Donor 100k goods) remain explicit, rather than replaced by invented values.
