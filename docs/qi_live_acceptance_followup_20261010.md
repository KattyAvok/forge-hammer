# QI Settlement Support – Live Donor acceptance findings and follow-up

Date: **2026-10-10**. Source: one `copy(QISettlementSupport.ShareReport())` JSON from **1.8.1.16-qi-acceptance-candidate**, user-provided in project chat. No further screenshots or repeated Chrome checks were requested.

## Verified from the user's actual QI observation

- Running QI at difficulty **10**, **Donor**, approximately **47 hours** remaining when the report was produced.
- All tracked economic keys present. **8/8 modeled plans were internally consistent**, i.e. arithmetic and protected resources passed the independent verifier; this **is not evidence of game-executable or strategically optimal play**.
- Geometry **indexed successfully**: 19 unlocked areas, 304 tiles, 292 occupied, 12 free; 15 impediments (30 outside-area cells) correctly ignored. However `streetTiles:0`, `roadTopologyKnown:false`, so even eight geometrically fitting joint layouts **do not prove connected roads or acceptable placement**.
- Building catalog: 36/36 QI-marked economic definitions priced in metadata, 13 aliases from original manual reference. The shop's actual present-day unlock list is unobserved.
- No active or completed producing building states in this sample. The metadata contains 144 production options with `option.time`; the units, actual active selections and collection readiness are not confirmed.
- `nodeResourceBundles` discovered **84 cost-context bundles involving `guild_raids_action_points` across 28 nodes**. The standalone node-cost parser erroneously reported no candidates because it excluded the QA resource key from its contribution-goods allowlist.
- Top ranked alternatives repeatedly included selling **Ropery** and constructing two **Clapboard Houses**, which is risky: Ropery can be required for strategic Rope production and future development and was not valued against known node goals or future expansion unlocks. Such a sale must not be actionable.

## Repairs integrated after acceptance

### Strategy safeguards
- `QISettlementSequence.saleRisk` blocks selling **Ropery** as a critical currently unpriced Rope chain.
- It also blocks demolition of QI producers with multiple/unknown active recipes and recognized strategic non-core goods outputs; unmodeled production must never be treated as zero-cost.
- The rest of the planner retains conservative budget/euphoria/population checks and can still consider selling an idle, modeled money/supplies producer.
- Compact diagnostic adds `sequencePreview.skippedStrategicSaleCandidates`; the QI panel explains these protections.

### QA/node source reconciliation
- `QISettlementNodeBudget.extract/evaluate` now recognizes `guild_raids_action_points` **separately** from QI money, supplies, Alloy and donor goods.
- QA-only cost-context bundles are classified as **potential QA alternative options**, not goods donations.
- Exposes bounded aggregate counters for nodes with QA requirements, nodes with multiple QA alternatives, QA-only bundles and possible gross QA-stock coverage. The resulting classification is `qa-only-option-candidates` when no separate goods donation is identified.
- Unknown additional positive cost types remain a hard incomplete-price condition. No QA option selection, donation or node cost semantics are claimed verified, and `safeDonation:null`, `donationInstructionAllowed:false` remain unchanged.
- Compact report includes `qaEvidenceAgreement` to compare the two independent anonymous QA observations when they are structurally comparable, making an overlooked resource-field mismatch visible immediately.

### Regression / status
- Reproduced the **28 nodes × 3 QA alternatives = 84** structure with synthetic tests. Additional end-to-end QI Donor test confirms the anonymized output, QA evidence agreement and that Ropery is not proposed for liquidation.
- **187/187 native Node.js tests passed** on branch head before final version metadata update. Evidence: https://github.com/KattyAvok/forge-hammer/actions/runs/38036521143
- This is still **read-only** and not yet a globally validated game optimizer. No new network requests or gameplay actions have been introduced.

## Open acceptance gates for future work

1. **Actual QI build shop unlocks:** the 36 metadata definitions are not proof that all are buildable now.
2. **Road/placement:** 0 street footprints observed means connection requirements remain unknown despite available geometric plots.
3. **Node semantics:** 28 nodes have three cost-like QA alternatives. We still do not know which option/amount is payable at a currently reachable node; goods donations vs QA negotiation remain distinct.
4. **Resource priority / economic planning:** retain Ropery and unpriced productive chains until the time-horizon / node goals can assign credible opportunity cost. Payback of money/supplies alone is not sufficient.
5. **Units/Fighter:** no battle unit inventory observed in this Donor snapshot.

No user action is necessary for code review/CI; any future live test should be one compact JSON after a substantial capability milestone, never screenshots or piecemeal commands.
