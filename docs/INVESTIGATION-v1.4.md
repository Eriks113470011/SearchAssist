# SearchAssist V1.4 — failure diagnosis and paired policy investigations

V1.4 preserves A's literal-search engine and B/C's shared approximate-search engine. It adds a failure inspector, an explicitly versioned volunteer policy, separate synthetic sanity cases and paired seed/control reports. All parameters remain SIMULATED / UNCALIBRATED. No human effectiveness, comprehension, accessibility or trust findings are claimed.

## Quick start

Use Node 22+ and the existing installation. Each output directory must be new:

```bash
npm run investigate -- --config configs/investigation-smoke.json --output simulation-runs/investigation-001
open simulation-runs/investigation-001/report.html
```

This fast run compares V2 and V3 across the baseline, zero recognition noise and zero typing-error controls: six runs, 1,296 controlled tasks and 60 separate sanity-case evaluations. Run all six profiles across three seeds with:

```bash
npm run investigate -- --config configs/investigation-profiles.json --output simulation-runs/investigation-profiles-001
```

That produces 18 runs / 23,328 controlled tasks plus 1,080 separate sanity-case evaluations. Fast model runs have no recorded browser timing. The full browser investigation reproduces the three recovery-smoke assignments with both policies and all four controls:

```bash
npm install
npx playwright install chromium
npm run investigate -- --config configs/investigation-browser.json --output simulation-runs/investigation-browser-001
open simulation-runs/investigation-browser-001/report.html
```

Expect eight runs / 288 controlled tasks / 90 verified interruptions. Headed Chromium is required because baseline/control runs include native hidden tabs. Use a display or Xvfb on Linux. Let the runner control its own test windows. The no-interruptions control uses ordinary isolated browser contexts; interruption runs containing hidden tabs use V1.3's owned native process/profile launcher. Consequently this comparison includes launcher differences in automation overhead; modeled cost and selection changes are reported separately and are not isolated causal estimates.

## Inspect ordinary runs

Existing simulate and simulate:browser commands now default to policyVersion v3. Their report links to failure-inspector.html; failures.csv contains one row per unsuccessful task, including skips and budget stops. Session traces contain attended text and decomposed decision evidence: overlap, rank boost, recognition noise, final score, threshold, eligibility, source and (V3) topic terms.

The inspector shows issued queries, engine-replayed result counts and target ranks, attended text and decision evidence. It runs offline without JavaScript and escapes dynamic content. Expand a task to inspect its timeline. Categories are descriptive diagnostics:

| Category | Meaning |
| --- | --- |
| wrong-selection | Submitted a result other than the evaluator's expected target. |
| target-not-returned | The engine did not return the target for any issued query. |
| target-not-inspected | The target appeared in engine replay, with no corresponding attended trace. |
| target-inspected-not-selected | A target-associated attended trace exists, but the task ended without selection. |
| action-budget / time-budget | The configured action or modeled-time budget stopped the task. |

Availability is replayed **after** policy decisions against the unchanged directory/engine. It includes engine matches beyond a displayed result window, so it does not prove that the target was visible or noticed. Categories are not exclusive causal explanations: a wrong selection can coexist with the target never being returned. The private evaluator target and replay data are never sent to the policy. The original application dataset/protocol remains the twelve controlled directory tasks.

## V2 reference and V3 scoring

Set policyVersion to v2 in a normal model/browser configuration to replay legacy decisions. Saved V1.3 configurations did not have this field; add it explicitly when using V1.4. Keep original run directories and source manifests as the historical reference. configs/simulator-v13-reference.json reproduces the recovery-smoke policy/settings. tests/fixtures/policy-v2-reference.json contains canonical outcome/action/cost hashes captured from commit dbc0993c4c52dd0cd3a9c475cd546832a7ee71ee for seeds 42 and 57, all six profiles and all eighteen assignments. Unit checks compare those complete model traces and ledgers after removing only V1.4 telemetry.

V3 is a lexical hypothesis, not semantic understanding. Declared instruction words (directory, entry, tool, resource, form, service, page, application, find, information, responsible) receive weight 0.1; other goal content words receive weight 1. Known synthetic UI boilerplate is excluded. A candidate needs at least one matched non-generic goal word and weighted overlap of at least 0.25 before rank/noise can justify selection. The existing profile threshold still applies. Detail reading is scored independently of the earlier card rather than inheriting its accumulated relevance. Both policies retain bounded scanning/rewrites, keyed RNG, explicit costs and public-observation-only inputs. All conditions use the same selected policy.

This may convert wrong selections into skips, increase search effort, or reject valid paraphrases. None of those outcomes is hidden. Success is not hard-coded and benchmark answer IDs are evaluator-only. No curated target-specific abbreviation expansion is added to the volunteer model or to A.

## Paired investigations

Configuration fields are seeds, simulation and variants. seeds contains 1–10 unique unsigned integers. simulation contains an ordinary simulator configuration except masterSeed and policyVersion, which the investigation supplies. variants must include baseline and may include no-recognition-noise, no-typing-errors and (browser only) no-interruptions. Unknown fields/duplicates are rejected. The total bound is 100,000 controlled model tasks or 1,000 controlled browser tasks; individual-run bounds and the 64 MB output cap also apply. Ten seeds with six profiles and three model controls fit the model bound. Browser wall-time limits apply per run, not to the entire investigation. Benchmark evaluation is an additional bounded fast-model pass.

Each variation changes only its named configuration parameter. Policy pairs match seed/profile/replicate/order/rotation/task. Control pairs compare each policy's baseline to its altered setting. Actions and recovery epochs can differ, changing which keyed random draws are used later. A no-interruptions run also uses a different browser launcher. Deltas are therefore descriptive counterfactual software runs, not proof of a single psychological mechanism.

Outputs:

- report.html: outcomes, paired transitions and separate sanity-case summaries; printable.
- outcomes.csv: every controlled task, category, rewrites, modeled cost and separate browser timings.
- groups.csv: seed/profile/condition/task-type counts, mean modeled cost and rewrites.
- comparisons.csv: every matched policy/control pair, outcome/category transition and cost/rewrite delta.
- benchmark.csv: separate development/held-out cases with declared acceptable-selection or abstention checks.
- investigation.json: all resolved run configurations, condition summaries, per-task rows, pairs, sanity results, raw tagged app recordings for browser investigations, and hashes of full in-memory synthetic sessions. Full sweep action traces are not retained to keep output bounded; rerun a resolved configuration with simulate or simulate:browser to inspect its full failure timeline.
- config.json: rerunnable investigation configuration.
- manifest.json: source/payload SHA-256, versions and runtime/source identity. Hashes are not signatures.

The four development and six held-out cases are hand-authored synthetic software fixtures covering literal/spelling/alias/reordered/absent/ambiguous/misleading results. Held-out cases were excluded from scorer tuning in this milestone; they are not independent participant observations or representative language samples. Ambiguous fixtures can permit multiple acceptable IDs, and absent-answer fixtures expect abstention. Cases are evaluated separately, never pooled with controlled study success rates. Even a browser investigation evaluates the sanity cases in the fast model. Inspect held-out outcomes without tuning V3 to make them all pass; future tuning needs a new evaluation set.

## Validation and limits

```bash
npm run check
npm test
npm run simulate -- --config configs/simulator-profiles.json --output simulation-runs/profiles-001
python3 tests/verify-simulation.py simulation-runs/profiles-001
python3 tests/verify-investigation.py simulation-runs/investigation-001
npm run test:browser
npm run test:simulator-browser
npm run test:recovery-browser
npm run test:investigation-browser
```

On Linux, prefix headed test commands with xvfb-run -a. CI retains existing application, full six-profile browser and recovery regressions. The investigation browser suite checks both policies, every control, tagged-recording reconciliation and desktop/mobile/print inspector/report layouts. Independent Python verifiers check source/payload hashes, counts, control settings, pair matching, outcome transitions, CSV summaries and timing evidence. Unit checks cover V2 reference parity, evidence gates, independent details, replayable/bounded configurations, evaluator isolation and HTML escaping.

More synthetic runs can test stability under assumptions; they cannot validate those assumptions. Task difficulty is not empirically matched. Generic vocabulary and lexical overlap can still miss meaning or accept plausible distractors. Timing costs and memory/reorientation rules require calibration against suitably collected volunteer search traces. A participant pilot and held-out human evaluation remain later work.
