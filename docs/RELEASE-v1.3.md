# SearchAssist 1.3 — interrupted browser sessions and synthetic recovery

The browser runner now supports scheduled manual pauses, navigation, native hidden tabs, reload and JSON restoration. It verifies that queries, correction undo state, completed trials and synthetic provenance survive each scenario, that no human ratings are invented, and that explicit Resume is required. Active time stays fixed during controlled idle holds while recorded wall time advances.

Synthetic recording restore reuses strict recording validation/sanitization with an exact synthetic-format gate, empty ratings and retained tags. Normal participant import continues rejecting synthetic data, and human rating requirements and schema/timing definitions remain unchanged. The synthetic storage key remains separate from ordinary participant recordings.

Recovery refreshes stale candidate handles; traces and a separate interruptions.csv describe injection points, idle durations, timing checkpoints, pause/resume counts, modal-close steps, restore events and visibility observations. Reports add recovery summaries without pooling automation times with modeled costs. Configured but unreachable scenarios fail explicitly.

Native hidden-tab checks require headed Chromium. Each assignment uses a fresh owned Chromium process/profile connected with no default emulation overrides, changes the actual active sibling tab and observes native visibility. Clocks and visibility properties are not patched. Linux CI uses Xvfb.

The smoke configuration runs 3 sessions / 36 tasks / 15 interruptions; the full configuration covers every assignment with 18 sessions / 216 tasks / 90 interruptions. See `docs/RECOVERY-v1.3.md` for commands, configuration, evidence definitions, bounds, validation and limits. All behavior parameters remain SIMULATED / UNCALIBRATED; empirical human calibration is future work.
