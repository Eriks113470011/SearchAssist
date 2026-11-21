# SearchAssist simulated participant design — proposed V1.1

Status: design proposal, not an implemented simulator. Baseline: merged SearchAssist 1.0 at 87f0515bb274c8a2ea8e1ea2dcbb5a9deffd8564. No application version, protocol, or data format changes are made by this document.

## Goal and evidence boundary

Build an automated participant simulator that makes bounded search decisions, performs recovery actions, and produces reproducible synthetic test runs. Use it to find workflow failures, stress imports/reports, inspect behavior under explicit assumptions, and choose hypotheses for a later pilot.

Call its outputs **simulated participant runs**, not volunteer observations. Model success and modeled time describe the configured agent interacting with SearchAssist. They do not establish how real people perform or whether C improves human trust, comprehension, ease, or accessibility. More simulated agents reduce computational sampling variation; they do not supply additional human evidence.

Start with a small, inspectable decision model inspired by goals/operators/methods and KLM-style action timing. Classic KLM addresses expert execution of specified, error-free methods; it is not itself a model of novice learning, search mistakes, or subjective ratings. Our branching, recognition, reading, and error rules are additional hypotheses. Full ACT-R is a possible later research implementation, not a dependency or a name for this simpler model. See the primary references below.

## What exists today

| Existing component | Reuse or constraint |
| --- | --- |
| `dist/engine.mjs` | Actual exact/fuzzy/assist matching. B/C share the same engine and ranking. |
| `dist/study.mjs` | Twelve tasks, four types per block, all six orders, three rotations, pause/recovery and validated exports. The evaluator owns target IDs. |
| `dist/app.mjs` | Real public result cards, details, suggestions, undo, grouping, pagination, and search controls. |
| `dist/workspace.mjs`, paired/rating/coverage modules | Reuse definitions after validation through a distinct simulation adapter; do not silently turn simulations into ordinary recordings. |
| `tests/browser.mjs` | Existing Playwright infrastructure and functional regression patterns. |
| `scripts/generate-qa-fixtures.mjs` | Perfect-answer fixture baseline for mechanical checks. It is not the proposed behavior simulator. |
| V1.0 study format | Requires submitted integer ratings to advance blocks; unknown top-level fields are discarded during validation. A new `synthetic: true` property on an ordinary export is therefore insufficient provenance. |

Guided C currently uses short explanations and separate approximate results. Request-only explanations and reveal controls belong only to configurations where the public UI actually offers them. Do not add unavailable actions to the standard protocol or claim an on-demand explanation event when the agent merely read short text.

## Architecture and execution modes

| Module, proposed | Responsibility |
| --- | --- |
| `simulator/config.mjs` | Strict versioned configuration, parameter bounds, budgets and scenario definitions. |
| `simulator/random.mjs` | Versioned seeded streams keyed by agent, task, decision type and attempt. |
| `simulator/policy.mjs` | Shared observe/decide/update policy. No imports of the study answer key or ranking engine. |
| `simulator/perception.mjs` | Bounded attention, noisy goal/text recognition, explicit reading costs and local memory. |
| `simulator/timing.mjs` | Operator ledger and modeled active/wall times. |
| `simulator/adapters/model.mjs` | Runs the real engine behind a public-interface projection and virtual simulation clock. |
| `simulator/adapters/browser.mjs` | Playwright reads the rendered interface and executes public controls in an isolated QA context. |
| `simulator/evaluator.mjs` | Scores submitted choices against hidden targets after decisions. Owns protocol validation. |
| `simulator/format.mjs` | Distinct simulation envelopes, provenance, input validation and report boundaries. |
| `simulator/report.mjs`, `cli.mjs` | Trace files, synthetic-only summaries, parameter sweeps and reproducible run manifests. |

**Fast model mode** runs many bounded trajectories without real-time sleeps. The adapter can call the actual engine but passes only the information a participant could currently see to the policy. It does not test CSS, keyboard behavior, DOM event wiring, or real browser timing. Label its results as model runs.

**Browser mode** uses the same policy through visible result cards and public controls. It tests the actual interaction path and application exports. Keep state and storage separate from participant sessions. Record browser/viewport, screenshots on failure, action handles, and the actual action/event trace. Do not use hidden state to choose a result. Browser scheduling is nondeterministic: identical seeds need not reproduce elapsed browser milliseconds exactly.

An optional answer-key oracle may remain as an explicitly separate smoke-test baseline. It must never be described as a human analog or used as its success policy.

## Information boundary

The policy receives the visible task prompt and starting query, text it has inspected, enabled controls, visible result order, its own prior actions and bounded memory. Reading a description, scrolling, opening details, or attending to an explanation must be an explicit action with an attention/time charge. A DOM dump does not mean the model has read every word.

The policy must not receive `targetId`, success flags, hidden `data-record` values as semantic hints, engine scores, unrendered matches, private aliases, sessionStorage contents, or future task definitions. The browser adapter maps public opaque handles to controls; the evaluator alone resolves correctness. Goal text that genuinely appears in the task prompt is allowed. Full dataset titles must not be preloaded into a rewrite dictionary simply to recover the correct answer.

Separate Node modules/process message boundaries and import checks enforce the distinction. A test changes the hidden target mapping while holding the public observation fixed: policy actions must be unchanged. The evaluator result may change. Another test replaces opaque IDs without changing visible text: choices must remain equivalent.

## Agent behavior

A bounded state machine cycles through: acquire task, inspect results, open details, decide to submit, revise query/use an available correction, inspect again, or skip. It can choose incorrectly. It cannot inspect evaluator feedback before ending the trial.

Model parameters are behavioral dimensions, not demographic or clinical labels:

| Dimension | Proposed effect |
| --- | --- |
| Scan budget and rank bias | How many results are inspected and how much attention favors early entries. |
| Verification threshold | How much observed evidence is needed before submission. |
| Goal vocabulary and alias knowledge | Which rewrites the agent can construct from the prompt, prior observations, and a declared small vocabulary. |
| Rewrite budget and persistence | When to try another query, repeat an ineffective strategy, or skip. |
| Reading and motor costs | Time charged for text inspection, editing, pointing/clicking and device switching. |
| Recognition noise and lapse rate | Occasional poor relevance judgments or mistaken choices, without consulting the answer key. |
| Suggestion acceptance and verification | Whether to inspect, edit/apply, or undo an available correction. |
| Memory capacity and optional learning | Previously inspected entries/queries retained locally; learning is disabled in the first release. |

Initial templates: careful scanner, first-result chooser, frequent reformulator, limited-vocabulary searcher, explanation reader, and cautious suggestion user. These are configurable test scenarios, not validated population clusters. Do not infer their prevalence from the 26-person preference survey or assign age/gender/intelligence labels to them.

A first recognition model can combine similarity between the visible goal representation and attended title/description text, position bias, and seeded noise. Rewrites draw from the prompt and actually read text. This relevance rule must be independent of SearchAssist's matching implementation. Its failure cases and vocabulary assumptions belong in the run report.

Example: for an available misspelling correction, a cautious agent reads the task, inspects candidates, reads the suggestion, chooses whether to apply it, reinspects the changed results, and then opens/submits a candidate, undoes, revises, or skips. A hasty agent may submit an early plausible distractor. Neither is instructed to choose the target or given a condition-specific success probability.

## Fair comparisons

Use the same baseline agent parameter distributions across A, B and C. The policy consumes capabilities and observed content, not an A/B/C label that selects a more favorable probability table. Feature use incurs reading/interaction costs as well as any possible change in the agent's judgment. C is allowed to help, tie, or hurt under different assumptions.

Run every profile across all six orders and three rotations. The actual task sets remain different across condition blocks; matching task type does not make the actual tasks equally difficult. Report results by task, order, rotation and profile as well as pooled summaries. B/C still compare interface bundles, not the isolated causal effect of explanations.

Use separate random streams for timing, recognition, slips and scenario faults so one extra C action does not shift every subsequent random draw. Store the RNG algorithm/version and keys. Replay tests cover deterministic model behavior. Preserve immutable configuration, source commit, protocol/dataset identifiers and hashes. Do not tune parameters until C wins.

Learning, if added later, requires an explicit cross-task memory policy and held-out validation because carryover changes the interpretation of condition order. Any interface ablation outside the fixed guided configuration receives a separate experiment/protocol identifier.

## Timing and error accounting

Maintain an auditable ledger for task-prompt reading, attended result text, decision/preparation, edit keystrokes, pointer/click actions, device homing when applicable, and non-overlapped system waits. Reading/recognition and mental preparation must not be charged twice for the same operation. Do not charge typing for the study's prefilled starting query.

KLM operator terminology is a modeling aid. Modern keyboard, touchscreen, reading, recognition and error parameters require explicit assumptions and eventual calibration; historical constants are not universal default human speeds. A future geometry-based pointing model must use actual target bounds and declared/calibrated coefficients.

Export separate fields for modeled active time, modeled paused time, observed browser active/wall time, and adapter overhead. In fast mode advance a simulation clock without changing production clocks. In browser mode app timing remains its actual synthetic execution measurement; do not add modeled time to it. Optional real-time pacing is a labelled test mode, not measured human time.

Wrong choices arise from the agent's observation/decision process. Add explicit typing slips, failed rewrites, skipped tasks and misread suggestions as parameterized scenarios. Manual pause, tab hiding, reload recovery, partial sessions and abandonment are separate fault scenarios. Distinguish an agent's voluntary skip from browser/adapter failure and run-budget termination. Retain failures in reports rather than dropping them from success denominators.

Starting guardrails, for software testing only: at most 24 high-level actions and four rewrites per trial, with a configurable modeled-time budget. A budget is a simulator stopping rule, not a timeout newly added to the real protocol. Validate finite nonnegative costs, bounded probabilities and global session/run/output limits.

## Ratings and synthetic data separation

A simulator cannot supply observed human confidence, trust or ease. Its internal decision evidence is not the study's confidence rating. Main simulator reports leave human rating outcomes unavailable.

Phase 1 uses a distinct `searchassist-simulation-run` format and a simulation-only report path. It does not emit ordinary v0.2 session JSON or create files that current human-review controls can accept as valid recordings. No production workspace changes are required for the initial CLI model runner.

Before browser-generated sessions are supported, implement a distinct `searchassist-simulation-session` envelope and isolated simulation storage/export behavior. If the current form needs fixed ratings to advance a QA run, tag them as `qa-fixture` values, document the chosen fixture rule, and exclude them from every substantive simulation rating summary. They test the form; they are not inferred human opinions. A simulation adapter may expose common task metrics for reusable aggregation without pretending the data satisfy a human-rating model.

The ordinary study importer must reject simulation envelopes with a clear reason. A future Simulation review entry point accepts only simulation formats; human-study and simulation inputs cannot be silently mixed. Synthetic origin must survive saving, reopening, CSV/HTML output and ZIP manifests. Reserve `SIM_` codes and `simulation-runs/` output as additional visible cues, not the sole safeguard. Existing legacy files do not gain authenticated provenance merely because they lack a simulation tag. Checksums do not prevent intentional relabelling.

## Proposed input and outputs

Example configuration below is illustrative, not a working command or an empirically calibrated profile:

```json
{
  "format": "searchassist-simulation-config",
  "schemaVersion": 1,
  "dataOrigin": "synthetic",
  "calibrationStatus": "uncalibrated",
  "runner": "model",
  "profile": "careful-scanner",
  "masterSeed": 20261121,
  "assignmentCells": "all-18",
  "replicates": 1,
  "policy": {
    "maxInspectedResults": 5,
    "maxQueryRewrites": 4,
    "maxActionsPerTrial": 24,
    "recognitionNoise": 0.15,
    "verifyDetailsBeforeSubmit": true,
    "learning": false
  },
  "timing": {
    "units": "milliseconds",
    "parameterSource": "hypothetical-sensitivity-scenario",
    "keyPressTriangularMs": [100, 200, 400],
    "readingWordsPerMinute": [120, 200, 320]
  },
  "humanRatings": "unavailable"
}
```

Distributions and their units need a strict schema; the triangular arrays are minimum, mode, maximum. Reject invalid ordering, unknown fields/versions, unbounded output requests and unsafe paths. Store explicit unit definitions in every run manifest, not only in the CLI help. Actual defaults and their sensitivity ranges must be declared before an experiment.

Each run produces:

- A manifest with synthetic origin, calibration status, configuration hash, code commit, dataset/protocol/model/adapter/RNG versions, seed allocation, all budgets, scenario definitions and file hashes.
- Simulation session/trial JSON, agent action traces and a per-trial operator ledger. Observed text and action reasons make failures reproducible; explanations are model diagnostics, not participant quotations.
- Separate agent/task and aggregate CSVs, plus an HTML report headed **SIMULATED / UNCALIBRATED**. Report actual simulated success, wrong choices, skips, reformulations, detail opens, recovery actions, abandonment and failure counts. Keep modeled and browser timing columns separate.
- Coverage by profile × order × rotation × task type, worst-case traces, omitted/cancelled cases and sensitivity comparisons. Never title a synthetic count as recruited volunteers.

Existing 60-file review limits are not bypassed. Larger sweeps aggregate through the distinct simulation runner/report path. The main study workspace retains its current limits and meanings.

## Implementation sequence and acceptance gates

| Milestone | Deliverable | Gate |
| --- | --- | --- |
| 1. Format and policy baseline | Separate simulation schema; strict config; seeded policies; public-observation boundary; model runner; no human ratings. | Simulation files rejected by normal study imports; no answer-key leakage; same config/seed reproduces model actions and modeled metrics. |
| 2. Fast scenario sweeps | Six templates, all 18 assignment cells, finite budgets, traces and synthetic reports. | Outcomes are consequences of actions; coverage is complete; failures retained; costs/parameters and sensitivity ranges visible. |
| 3. Browser conformance | Isolated simulation sessions/storage/export; same policies through Playwright; failure screenshots. | No private study state read by policy; rendered-observation parity checked; public actions exercise real event handlers; no contamination of existing sessions. |
| 4. Calibration and validation | Optional empirical parameter fitting and held-out comparisons. | Calibration source documented; participant/task splits prevent leakage; validation covers paths/errors/timing distributions, not just an overall mean. |

Development smoke test: one profile × 18 assignment cells = 18 simulated sessions and 216 trials. Full initial profile coverage: six × 18 = 108 sessions and 1,296 trials. Three seed replicates make 324 sessions and 3,888 trials. These are engineering coverage batches, not human sample-size or Monte Carlo convergence recommendations. Larger runs require a declared precision/stability target and parameter-sensitivity design.

Required implementation tests include schema/provenance round-trips; separate-data enforcement; permutation and hidden-target tests; seed replay; no-result/distractor/rewrite/skip behavior; realistic action availability in each condition; query coalescing and prefilled-query timing; partial/paused/restored cases; no double-counted time; fixture-rating exclusion; bounded termination; and report agreement with canonical task metrics where definitions match.

A falsification check is that the simulator does not always favor C. Test parameter settings where reading extra explanations costs time without changing choices, and other settings where attended text can change a decision. An absence of benefit is not a failed software test. Browser-only faults and model-only assumptions must remain distinguishable.

## Calibration and later human work

Initial parameters are hypotheses. The existing preference survey can motivate scenarios but does not estimate click times, recognition noise, error probabilities, or population weights. Human timing and behavior should be compared with model output before calling it predictive.

When observed sessions become available, fit on a designated development subset and evaluate on held-out participants and task variants. Compare success/skip/error rates, action sequences, rewrite counts, timing distributions and subgroup/scenario discrepancies. Store the calibration dataset's permitted identifier/version and provenance outside public study data. Report large mismatches and uncertainty; do not tune on the held-out set or select only settings supporting the preferred interface.

Simulation can support the course project now and make a later pilot more targeted. It cannot validate human trust/ease or replace empirical evidence for a claim about actual volunteers.

## Primary references and scope

1. Card, S. K., Moran, T. P., and Newell, A. (1980). *The Keystroke-Level Model for User Performance Time with Interactive Systems*. Communications of the ACM 23(7), 396–410. DOI: 10.1145/358886.358895. [CMU archival paper](https://iiif.library.cmu.edu/file/Newell_box00072_fld05094_doc0001/Newell_box00072_fld05094_doc0001.pdf). Basis for an operator-cost treatment of specified expert methods; our stochastic search/error hypotheses are additional, unvalidated mechanisms.
2. Card, S. K., Moran, T. P., and Newell, A. (1980). *Computer Text-Editing: An Information-Processing Analysis of a Routine Cognitive Skill*. Cognitive Psychology 12, 32–74. DOI: 10.1016/0010-0285(80)90003-1. [Primary paper](https://www.sciencedirect.com/science/article/pii/0010028580900031). Background for goals, operators, methods and selection rules; this proposal is not a faithful implementation of the full published model.
3. Bothell, D. *ACT-R Reference Manual*, introduction. [Official manual](https://act-r.psy.cmu.edu/actr7.x/reference-manual.pdf) and [CMU project](https://hcii.cmu.edu/project/act-r). ACT-R is an actual cognitive architecture; task-specific models require assumptions and comparison with human data. We should use its name only if we implement and evaluate an ACT-R model.

Repository basis: `docs/EVALUATION.md`, `docs/RESEARCH.md`, `docs/ACCEPTANCE-v1.0.md`, the current renderer and session validator. Proposed behavior/configuration choices above are engineering decisions to test, not findings supplied by these references.
