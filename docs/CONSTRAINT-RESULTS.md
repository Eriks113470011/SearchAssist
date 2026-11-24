# Frozen V5 evaluation results

Policy implementation: `de902c6eb8d05d3fd40f2cf065bdbbe3bd176f65`.
Fresh fixtures committed before implementation: `cf648e615b10768d561d1d677e7fb6e0b176fc4d`.
No V5 dependency was changed after inspecting evaluation outcomes. A later compatibility fix makes the older Python verifier recognize additive V5 registration; its original V4 reference hashes and exact session replays remain intact.

## Fresh evaluation split

Ten author-created cases, repeated across seeds 201–205, six profiles, A/B/C, and original/reversed order: **1,800 trials per policy**. Repetitions are not independent samples; this is not a blind holdout. Development cases are reported separately.

| Outcome | V4 | V5 |
|---|---:|---:|
| Correct selection on 1,440 answerable trials | 1,103 | 1,440 |
| Wrong selection | 697 | 0 |
| Answerable skip | 0 | 0 |
| Correct abstention on 360 unanswerable trials | 0 | 360 |
| Mean modeled active cost, all trials | 23,563 ms | 34,631 ms |

The paired changes are 337 wrong → correct selections and 360 wrong → correct abstentions; all 1,103 earlier correct selections were retained. The added checks cost approximately **47% more modeled time** in this split. All V5 abstentions here were deliberate agent skips, not budget stops.

## Earlier broad challenges, retained as regressions

The original 24 fixtures are unchanged. The new comparison repeats them using seeds 201–205 and common V4/V5 draw keys; these counts should not be substituted for the earlier V3/V4 benchmark, which used different seeds and keys.

| Outcome | V4 | V5 |
|---|---:|---:|
| Correct selection | 2,601 | 3,600 |
| Wrong selection | 1,539 | 0 |
| Answerable skip | 0 | 0 |
| Correct abstention | 180 | 720 |
| Mean modeled active cost | 26,206 ms | 36,783 ms |

V5 retained all earlier accepted outcomes in this run. Of the 720 V5 correct abstentions, 716 were deliberate skips and four were time-budget stops. They remain separately identifiable in every terminal row; the four stops are not evidence of an explicit abstention decision.

## Unchanged directory tasks

Five seeds × six profiles × 18 assignments × 12 tasks: **6,480 tasks per policy**.

| Outcome | V4 | V5 |
|---|---:|---:|
| Correct completion | 6,291 (97.1%) | 6,414 (99.0%) |
| Wrong selection | 0 | 0 |
| Skipped / stopped | 189 | 66 |
| Mean modeled active cost | 30,895 ms | 37,783 ms |

The added inspection recovered 123 directory completions while increasing mean modeled cost by approximately 22%. These are software scenarios under declared assumptions, not human performance measurements.

## Reproduction and limits

[Commands and behavior](CONSTRAINT-POLICY-V5.md) and the [pre-implementation protocol](CONSTRAINT-PROTOCOL.md) describe the exact matrices. [Machine-readable summary](CONSTRAINT-RESULTS.json) retains all split totals, directory totals, terminations and paired transitions. Development results were 1,440 correct selections and 360 correct abstentions for V5 across 1,800 trials, with no wrong selections or answerable skips.

GitHub Actions runs the full model matrices and independent validators, plus a separate 864-task V4/V5 comparison on the unchanged directory in an actual browser. The browser test reconciles selected IDs and queries against tagged application recordings and checks paid qualifying evidence before every V5 submission. Fresh challenge fixtures run in the model; the browser comparison does not execute those challenge records. See PR #16 checks and uploaded `constraints-model-qa` / `constraints-browser-qa` artifacts for the current run.

Perfect results on these narrow, hand-authored fixtures do not imply general search correctness. The rule set recognizes a limited English vocabulary and simple scopes; unrecognized constraints and complex phrasing can still fail. The evaluation split was authored before implementation, but was available to the author and is not independent. No significance tests, population estimates or human-effectiveness claims are made. V4 remains the default pending review.
