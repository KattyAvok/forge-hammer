# QI Settlement Support — geometry evidence checkpoint, 2026-10-09

## One real-world console observation

A pasted Chrome-console capture from development build `1.8.1.8` confirmed:

- Fighter mode, difficulty 9; QI running with a reported 68 hours remaining at capture time.
- Fresh QI map and all six required economic resource-bag keys observed.
- Budget/population model: five modeled builds, zero provisional, zero blocked and six possible replacement **scenarios**. No scenario is yet accepted as a game-valid action.
- Layout indexing returned `insufficient-evidence` with `buildings-outside-unlocked-areas`. Therefore all 12 visible sample building placements returned `geometryStatus:unknown`. **Do not claim no plots exist; do not advise a placement.**
- Passive contract events included one QI map overview and one QI run-state response; no unit-info callback was observed in this sample.
- The console log was copied twice and truncated around the structural-path list, so later production and boost observations were not reliably transmitted.

## Diagnostic changes, build 1.8.1.9

- Out-of-area geometry reports now include safe counters: buildings outside by road, main and other; entirely outside versus crossing an edge; occupied/area tile counts and presence of 16×16 base and 4×4 expansion rectangles. Coordinates and building identifiers are never in this report.
- The unresolved geometry case **remains** a hard evidence gate. We will not move/normalize coordinates by a guessed constant or assume missing land is unlocked. Forge Hammer's existing `CityMap.BuildGrid`/outpost renderer applies matching QI visual offsets to both areas and buildings, so there is no basis to change only one side before auditing the actual data.
- `QISettlementSupport.ShareReport()` returns a bounded, JSON-serialized snapshot with geometry, production coverage, QI boosts and concise structural-path summaries. It is designed for use with the Chrome DevTools command:
  
  ```js
  copy(QISettlementSupport.ShareReport())
  ```

  This puts JSON on the clipboard directly rather than trying to copy a truncated `console.log`. It does not save or send the report.
- The existing verbose `ReportToConsole()` remains available for local debugging but is **not** requested from the user again.
- Added geometry-mismatch regression and a native-Node compact JSON smoke test. CI runs automatically on the open draft PR.

## One meaningful external gate

**No screenshots or repeated per-commit checks.** When convenient, install the current branch `1.8.1.9`, enter a QI settlement and run the single command above. Paste the clipboard JSON once. We need it to distinguish base-map rectangle mismatch, road footprint discrepancies, and true out-of-bounds buildings, and to inspect production and passive node field availability. Later implementation and testing should continue within GitHub/CI without asking the user for intermediate screenshots.

## Still unresolved

Production times and boost semantics must be verified before ROI/rush planning. Donation node spending costs, game shop availability, road level and geometry obstructions remain unknown. Recommendation priorities are not validated as a complete economic optimum. The PR remains unmerged and all modules are read-only.
