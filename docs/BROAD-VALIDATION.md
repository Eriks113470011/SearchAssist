# Broad validation of the frozen V1.5 policies

This milestone evaluates V3 and V4 without changing their behavior. The application remains version 1.5. Policies, public adapters, matching engine, directory, task assignments, profile parameters, timing model and budgets remain byte-identical to main commit `a83b40f53c47d61c0e70c1c94bae84bfe3e0571c`. A pre-challenge V4 reference checks full session hashes for seeds 42 and 101, all six profiles and all eighteen assignments. Its source fingerprints also protect V2/V3 and shared helpers. Earlier V2/V3 reference tests continue to run.

## Run the three parts

Use a different output name for each execution. Existing folders are never overwritten. Run from the repository root with Node 22 or later.

| Part | Configuration | Scope | Controlled/challenge trials |
| --- | --- | --- | ---: |
| Controlled model baseline | investigation-broad-model.json | Seeds 101–105, six profiles, V3/V4, all 18 assignments | 12,960 |
| Controlled model controls | investigation-broad-controls.json | Seeds 101–102, six profiles, V3/V4, baseline / no recognition noise / no typing errors | 15,552 |
| Controlled browser baseline | investigation-broad-browser.json | Seeds 101–102, six profiles, V3/V4, assignment slots 0/7/14 | 864 |
| Fresh model challenges | validation-challenges.json | Seeds 101–105, six profiles, V3/V4, A/B/C, two input record orders, 24 cases | 8,640 |

The controlled model baseline and control batch share some baseline cases. Do not pool them as independent samples. The control batch is separate to stay within the existing 64 MB per-output cap. Each investigation also reports the ten historical sanity fixtures separately; these reused fixtures are not fresh validation cases.

```bash
npm install --no-package-lock --ignore-scripts
npm test

npm run investigate -- --config configs/investigation-broad-model.json --output simulation-runs/broad-model-001
python3 tests/verify-investigation.py simulation-runs/broad-model-001
open simulation-runs/broad-model-001/report.html

npm run investigate -- --config configs/investigation-broad-controls.json --output simulation-runs/broad-controls-001
python3 tests/verify-investigation.py simulation-runs/broad-controls-001

npm run validate:broad -- --config configs/validation-challenges.json --output simulation-runs/broad-challenges-001
python3 tests/verify-validation.py simulation-runs/broad-challenges-001
open simulation-runs/broad-challenges-001/report.html
```

With Chromium installed as in the browser-runner guide:

```bash
npm run investigate -- --config configs/investigation-broad-browser.json --output simulation-runs/broad-browser-001
python3 tests/verify-investigation.py simulation-runs/broad-browser-001
open simulation-runs/broad-browser-001/report.html
```

The broad browser batch uses accelerated execution and no injected interruptions. Existing native interruption tests continue separately. It samples all three set rotations and three of six condition orders, not all eighteen assignments. Browser task times are automation measurements, not human task times. The fresh challenge set executes in the fast model only. Browser report rendering does **not** constitute browser execution of those fresh cases.

## Fresh challenge design

The 24 hand-authored cases in `simulator/validation-cases.json` have six equally sized families:

- Positive controls: literal, spelling, reordered and acronym retrieval.
- Similar titles: identical titles with different locations, dates, access periods or applicant restrictions.
- Acronym collisions: two different titles with the same initials and curated alias.
- Misleading summaries: closed intake, unavailable walk-ins, training-only forms and referral-only services.
- Missing answers: unrelated records or text that explicitly excludes the requested service, location or eligibility.
- Multiple answers: two entries are both acceptable, with an unrelated distractor.

Acceptable IDs and rationales are evaluator-only. All trial targets are null during execution; correctness is evaluated after the policy terminates. No target ID or acceptable set reaches policy observations. The suite uses the production matching engine and public model adapter. Fields available only in the evaluator are never used to choose actions.

The new cases were authored after V4 was frozen. Policy thresholds, relevance scoring, query-cue weight, budgets and case answers were not adjusted in response to these results. The case bytes are fingerprinted in `tests/fixtures/policy-v4-reference.json`. Once inspected, these are challenge/regression fixtures, not a permanently untouched held-out set. They are not independently collected volunteer data.

Record order is original or reversed, with the same random keys for a matched seed/profile/case. The engine sorts by score and title; reversing input changes result rank only when those sort keys tie. Identical-title cases deliberately exercise that tie behavior. Compare order-specific rows rather than assuming every reversed case has a different ranking. A different policy action path may still consume different observation/noise keys.

## Read the results

Four outcomes keep retrieval and abstention separate:

| Outcome | Meaning |
| --- | --- |
| correct-selection | Selected one of the declared acceptable entries |
| wrong-selection | Selected an unacceptable entry, including any selection when the answer is absent |
| answerable-skip | Stopped without selecting when an acceptable answer exists |
| correct-abstention | Stopped without selecting when no acceptable answer exists |

`validation.json` retains every trial row and V3/V4 pair. `outcomes.csv` includes initial/final query, termination, costs, actions, rewrites, submission eligibility/score/threshold and post-trial acceptable-answer retrieval status. `comparisons.csv` retains all recoveries and regressions, including correct-to-wrong transitions. Summary CSVs separate family, profile, condition, seed and input record order. There are no winner labels or inferential tests.

`cases.json` exports public fixture records, acceptable answers and rationales for review. `manifest.json` records source/payload hashes, the frozen policy commit, full case-suite hash, resolved configuration and runtime. Hashes detect inconsistent artifacts; they are not signatures.

To bound report size, traces/ledgers are sampled: the first example for each case/policy/outcome is retained, rather than every repeated trace. Every outcome remains in the complete matrix; each row records a trace hash. Samples are not random. The independent verifier checks complete matrix coverage, evaluator outcomes, paired transitions, every CSV field, source fingerprints, submission gates, sampled trace hashes and timing sums.

To reproduce a particular row, copy the challenge config and restrict `seeds`, `profiles`, `conditions`, `recordOrders` and `caseIds` to that row. Both frozen policies always run, preserving its matched comparison. For example:

```json
{
  "seeds": [101],
  "profiles": ["careful-scanner"],
  "conditions": ["A"],
  "recordOrders": ["original"],
  "caseIds": ["missing-negated"]
}
```

## First challenge findings

Across 4,320 trials per policy, V3 produces 2,673 correct selections, 1,467 wrong selections and 180 correct abstentions. V4 produces 2,660 correct selections, 1,480 wrong selections and 180 correct abstentions. Neither policy has an answerable skip in this deliberately lexical challenge set.

V4 changes 26 wrong selections to correct ones, but changes 39 correct selections to wrong ones. Similar-title failures rise from 221 to 244; acronym-collision failures fall from 312 to 302. Both policies incorrectly select entries in 540 of 720 missing-answer trials. The three missing-answer cases with topical but disqualifying text account for those failures; the unrelated-record control is rejected.

This exposes lexical overlap's inability to reliably enforce negation, location, current availability and eligibility constraints. Zero skips alone is an insufficient acceptance criterion. These observations motivate a separate future change with explicit constraint evidence and fresh evaluation cases. This milestone deliberately does not implement or tune that change.

## Limits

Seeds and input orderings repeat authored fixtures, not independent people. All six profiles are hypothetical parameter settings. There is no human calibration of comprehension, trust, accessibility or speed. The original controlled directory and the fresh challenge set must remain separate. A perfect score on the original directory cannot establish general search effectiveness, and a lower modeled time is not a measured human time improvement.

CI runs both broad model batches, fresh challenges and the controlled browser batch, alongside the existing regression suites. Reports support desktop, horizontally scrollable mobile tables and landscape print. Passing CI establishes software consistency and reproducibility; observed wrong selections remain reported and do not cause the evaluation job to hide or discard a run.
