# SearchAssist 1.2 — browser participant runner

The simulator can now operate the real guided app in isolated Chromium contexts. The new `simulate:browser` command uses the seeded policies and visible DOM content, then downloads tagged app recordings and checks every task's selection, query changes, result opens, suggestion events and observed timing.

A synthetic-only app mode visibly labels testing, separates tab storage and JSON/CSV exports, and continues blocks without fabricated human ratings. Normal recording/review imports reject synthetic data; human recording schema 0.2/2 and workspace/bundle formats remain unchanged. Synthetic reload recovery and fault injection are future milestones.

Accelerated execution is the default. Optional modeled pacing waits the assumed operator cost before each action. Reports distinguish modeled time from recorded browser automation active/wall time. Source/payload hashes, actual browser version, configuration and reconciliation metadata make runs auditable; browser timing is naturally not deterministic.

Opening and reading details are now separate policy actions. The fast adapter includes actual C detail explanations. Model/adapter versions advance so previous V1.1 numerical baselines remain identifiable. The normal search engine, dataset, tasks and participant timing definitions are retained.

See `docs/BROWSER-RUNNER-v1.2.md` for setup, all configurations, watching a paced demo, limits, provenance, failure handling and validation. The smoke configuration covers 18 sessions / 216 tasks; the full configuration covers 108 sessions / 1,296 tasks. All outcomes remain SIMULATED / UNCALIBRATED and cannot establish real volunteer effectiveness, trust, ease or accessibility.
