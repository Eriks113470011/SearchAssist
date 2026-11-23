# Run the SearchAssist participant simulator

The first working milestone is a local, seeded **fast behavior-model runner**. It uses the actual search engine and task prompts, with six configurable policies and an approximate projection of the guided UI. It does not operate a browser as an agent, implement ACT-R, measure people, or produce human confidence/trust/ease ratings. Every output is labelled **SIMULATED / UNCALIBRATED**.

## Install and run

Use Node.js 22 or later in the repository root. No package installation, model download, API key, network access, or paid service is needed for the fast runner.

```bash
npm run check
npm test
npm run simulate -- --config configs/simulator-smoke.json --output simulation-runs/smoke-001
```

This creates 18 simulated sessions and 216 tasks for the careful-scanner profile. To exercise all six profiles:

```bash
npm run simulate -- --config configs/simulator-profiles.json --output simulation-runs/profiles-001
```

Expect 108 sessions and 1,296 tasks. Each profile covers all six condition orders and three task rotations. This is engineering coverage, not a recommended number of human participants or a claim of statistical power.

Open `simulation-runs/profiles-001/report.html` in a browser. It works offline. Inspect the condition/profile tables, then the action traces for unexpected outcomes. The generated directory is ignored by git. Choose a fresh run name every time; the CLI refuses to overwrite existing output or use a symlink as the simulation-runs root.

Change the seed or choose one profile without editing the supplied configurations:

```bash
npm run simulate -- --config configs/simulator-profiles.json --profile limited-vocabulary --seed 123 --output simulation-runs/vocabulary-seed123
```

CLI options are `--config`, `--output`, `--seed`, `--profile`, and standalone `--help`. Configuration files are limited to 64 KB, runs to 324 sessions, and serialized output to 64 MB. Per-trial action, manual-rewrite, and modeled-time limits are configurable within bounds. Output must be one new `simulation-runs/<safe-name>` directory. Write failures can leave a partial directory; a final manifest is written last and the CLI exits nonzero on failure. Choose another name rather than treating incomplete output as a successful run.

## Files to inspect

| File | Contents |
| --- | --- |
| `report.html` | Human-readable synthetic summary, profile results, coverage counts, and interpretation limits. |
| `manifest.json` | Synthetic origin, source commit if available, working-tree status, source file hashes, runtime versions, configuration hash, model/RNG/timing identifiers, and every payload's byte count/SHA-256. |
| `config.json` | Fully resolved configuration for replay, including defaults and overrides. |
| `run.json` | Model metadata, resolved profile values, aggregate results and paths to session files. |
| `trials.csv` | Every attempted task, outcome/stop reason, model costs and recovery counts. |
| `conditions.csv`, `profiles.csv` | Aggregate condition and profile/condition outcomes. |
| `coverage.csv` | All profile × order × rotation cells, including expected and actual counts. |
| `sessions/SIM_*.simulation.json` | Distinct synthetic session envelopes containing per-trial action traces and operator ledgers. |
| `readme.txt` | Interpretation and provenance reminders. |

Model outputs are deterministic for the same resolved configuration, source and runtime. The manifest has no creation timestamp that would obscure replay differences. Git-less source folders report a null commit and use file SHA-256 identities rather than inventing a revision. A commit ID alone does not establish the working tree's contents; inspect the file hashes and dirty status. These hashes are integrity checks, not signatures or proof of behavioral validity.

The current normal study importer explicitly rejects generated simulation formats and recordings tagged `dataOrigin: synthetic`. The human workspace and bundle formats remain unchanged. There is no simulation-import UI yet. Do not unwrap or relabel these files as v0.2 participant recordings. Legacy untagged QA fixtures and manually edited files are not authenticated by this safeguard.

## What each agent does

1. Reads the public prompt and prefilled query. Starting text is not charged as typing.
2. Inspects a bounded number of visible result cards. Uninspected text and private result IDs are absent from the policy's observation.
3. Scores attended text using a small independent goal/text-overlap heuristic, rank bias and seeded recognition noise.
4. Reads an available short explanation, opens details, accepts or undoes an offered correction, manually rewrites from public words, submits, or skips according to its parameters.
5. The evaluator checks the submitted ID against the hidden target after the decision. No correctness feedback is supplied to the policy during the task.

The policy module imports only its independent text helpers. It does not import the task answer key, dataset, matching engine or evaluator. Tests permute record IDs and change a hidden target while holding public input fixed: action decisions and timings remain unchanged.

The profiles are careful scanner, first-result chooser, frequent reformulator, limited vocabulary, explanation reader, and cautious suggestion user. They are hypothetical behavior templates, not demographic groups or validated population segments. Their exact values are stored in `resolvedProfiles`, including any overrides.

The fast adapter implements public result content, available suggestions, undo, paging and detail-dialog ordering. It uses the real engine for outcomes, but does not run the real DOM, visual attention, keyboard event timing, geometry or screen-reader behavior. Browser tests compare its rendered card/explanation text and suggestion/undo transitions with the actual guided C interface. That limited parity check is not a complete browser simulator.

## Modify hypotheses and compare sensitivity

Copy a supplied config and add bounded overrides, for example:

```json
{
  "masterSeed": 42,
  "profiles": ["careful-scanner"],
  "replicates": 1,
  "limits": {
    "maxActionsPerTrial": 24,
    "maxRewrites": 4,
    "maxModeledActiveMs": 120000
  },
  "profileOverrides": {
    "careful-scanner": {
      "scanLimit": 3,
      "threshold": 0.5,
      "recognitionNoise": 0.15,
      "verifyDetails": true,
      "suggestionAcceptance": 0.3,
      "explanationAttention": 0.5,
      "typingErrorRate": 0.05,
      "vocabulary": "broad",
      "timeScale": 1.2
    }
  }
}
```

Top-level missing fields receive documented defaults; unknown fields/versions and invalid values are rejected. Profiles must be unique known names. Probabilities, noise, rank bias and thresholds are bounded to 0–1. `scanLimit` is 1–24, `timeScale` 0.25–4, and vocabulary is `basic` or `broad`. Recognition scores are heuristic evidence, not probabilities or human confidence. A typing-slip draw can transpose adjacent characters in a generated rewrite.

Vocabulary here means the available rewrite construction rules. Broad profiles can use additional combinations of words from the visible prompt; basic profiles use fewer combinations and shorter prompt words. There is no hidden answer dictionary, pretrained semantic model, learned population distribution or automatic human vocabulary assessment. Candidate memory resets after query changes; tried-query history lasts one trial. Learning across tasks is disabled.

Replicates vary seeded hypothetical agents while retaining every assignment cell. Separate keyed timing/recognition/slip draws avoid a timing draw shifting later recognition draws. Seeds support repeatability; they are not empirical evidence. Keep default baseline parameters shared across A/B/C. To study one change, keep the seed and other assumptions fixed and compare new output directories. Do not select only parameter sets in which C wins.

## Timing and outcome definitions

Costs are additive engineering hypotheses, not calibrated human predictions. Defaults use triangular [minimum, mode, maximum] distributions:

| Component | Default milliseconds | Definition |
| --- | --- | --- |
| Key | [100, 200, 400] | Per typed character plus three modeled select/replace control keystrokes for a rewrite. |
| Word | [180, 300, 500] | Per explicitly attended word. This is a reading-cost approximation. |
| Decision | [400, 900, 1800] | One preparation/decision charge per completed high-level action. |
| Point/click | [400, 800, 1400] | Per required public-control click. No geometry-based Fitts fit is claimed. |
| System wait | 100 | Hypothetical non-overlapped wait after rewrites, corrections or paging, not measured engine latency. |

Profile timeScale multiplies reading, decision, typing and click costs, not the fixed system wait. The report and CSVs use milliseconds. All ledger components sum exactly to modeled active time. Each action's ledger and attended text are inspectable. Rereading details is an additional reading action; short explanations are charged separately, without inventing an explanation-opened click. Submitting requires the detail dialog to have been opened even for a hasty profile.

`observedBrowserActiveMs` and `observedBrowserWallMs` remain null. Fast runs do not sleep or patch production clocks. They do not model pauses, restored trials, tab hiding, cognitive fatigue, longitudinal learning, or browser latency. Those scenarios require the later browser/fault-injection milestone.

Success uses the actual task target. Wrong submissions, voluntary skips, time-budget stops and action-budget stops remain in denominators. A modeled-time stop occurs before an action that would exceed the budget; it is not a timeout added to SearchAssist. A coding/adapter exception aborts the run with a nonzero CLI exit rather than silently dropping trials.

All-task time means include unsuccessful, skipped and budget-stopped work. They are not time-to-success estimates. Successful-only means use different subsets and are displayed separately. `manualRewrites` counts typed rewrite actions; `modeledQueryChanges` also counts applied/undone suggestions that change the query. They are not the app's measured 300 ms-coalesced editing episodes. `explanationsRead` is a model attention action, not a real browser event.

Human confidence, trust and ease are unavailable, not guessed or imputed. The current runner does not advance the real rating form, so it needs no fabricated Likert responses. There are no inferential tests, population weights, winner labels or causal claims. Matched task type still does not establish equal task difficulty.

## Validation and next milestones

`npm test` includes configuration bounds, seed replay, action availability, hidden-target and ID permutation checks, no automatic C bonus, reading costs, all six profiles/all 18 cells, timing conservation, stopping budgets, wrong choices/slips, synthetic import rejection, report counts and independent payload hashes. CI runs the full profile configuration and independently verifies its hashes, coverage, CSV outcomes and ledgers using:

```bash
python3 tests/verify-simulation.py simulation-runs/profiles-001
```

The Python checker is an optional verification tool; the simulator itself requires only Node. Browser regression checks also verify the normal app, synthetic-import rejection, projected content parity, and the offline model report's desktop/mobile/print layouts.

Next: implement an isolated browser-agent adapter using the same policies and preserved synthetic provenance, then add controlled interruption/recovery scenarios. Later empirical calibration needs development and held-out participant/task data, documented parameter sources, and comparison of action/error/timing distributions. A large uncalibrated simulation does not replace that work.

## V1.2 follow-up

Browser execution is now implemented; see [the browser-runner guide](BROWSER-RUNNER-v1.2.md). V1.2 separates opening/reading details and includes C detail explanations in the fast projection, advancing the policy and adapter version identifiers. Retain V1.1 manifests when interpreting the earlier baseline; V1.2 outputs are not identical numerical replays of V1.1.
