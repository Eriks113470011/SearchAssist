# V1.5 — recover plausible results and reduce unnecessary skips

V1.5 adds volunteer policy V4 and defaults new runs to it. A's exact-search engine, B/C's shared approximate engine, directory data and recording protocol are preserved. V2 and V3 remain selectable. All behavior assumptions are synthetic and uncalibrated.

## Rerun the matched tests

```bash
npm run investigate -- --config configs/investigation-smoke.json --output simulation-runs/recovery-comparison-001
open simulation-runs/recovery-comparison-001/report.html
```

The supplied smoke configuration compares V3 and V4 across baseline, no-recognition-noise and no-typing-errors: 6 runs / 1,296 controlled tasks, plus 60 separate synthetic sanity-case evaluations. The supplied full-profile configuration uses three seeds and all six profiles: 18 runs / 23,328 controlled tasks, plus 1,080 separate sanity-case evaluations.

```bash
npm run investigate -- --config configs/investigation-profiles.json --output simulation-runs/recovery-profiles-001
```

For paired real-browser checks, install Chromium as in the existing browser guide, then run:

```bash
npm run investigate -- --config configs/investigation-browser.json --output simulation-runs/recovery-browser-001
```

This compares both policies and all four controls over assignment slots 3, 5, 10 and 15: 8 runs / 384 tasks / 120 interruptions. These assignments include the locations of the four lost-success model cases. Interruptions can change later observation epochs and decisions, so browser outcomes need not equal the fast-model outcomes. Headed Chromium and a display are required for hidden tabs; use Xvfb on Linux.

The report now includes a skip breakdown separating target-not-returned, target-not-inspected, target-inspected-not-selected, modeled-time budget and action-budget stops. These are post-trial engine-replay categories, not proof of visual attention or causation. Per-task rows and all matched transitions remain in the CSVs. Repeated control runs are matched scenarios, not additional independent volunteers.

## What the investigation found

In the V1.4 fast-model run at seed 42 with careful-scanner, four cases that V2 completed correctly became V3 skips: BCA/rotation 0/task 2, CBA/rotation 0/task 2, CAB/rotation 1/task 10, and BCA/rotation 2/task 6. All concerned the NYC task. V3 returned and attended New York City but its summary overlapped only one of the three substantive goal terms (city/five/boroughs). Weighted goal overlap was 0.34375; rank/noise often left it below the unchanged 0.42 acceptance threshold. Repeated rewrites and scans then exhausted the modeled-time budget.

That differs from the 24 A skips in the same run, where none of the issued literal queries returned the target. The improvement addresses both early abandonment of plausible candidates and wasteful query reformulation; it does not add alias/fuzzy matching to A.

## V4 rules

- For profiles that verify details, an eligible candidate can be opened and read once even when its summary score is below the submission threshold. An unsuccessful detail inspection cannot loop indefinitely: the candidate must meet the threshold after details, or the policy moves on. Existing action, rewrite and modeled-time limits still apply.
- Detail evidence is still evaluated independently. The topical gate is unchanged: at least one non-generic goal word and goal overlap of at least 0.25 are required **before** query cues, rank or recognition noise can justify selection.
- After reading a title, a general identity cue can support confidence: the original query equals the full normalized title, or an original uppercase 2–5 letter query equals the entire title's initials after common function words are removed. There is no NYC/DMV/MIT answer dictionary. Initials are derived only from attended titles, not private aliases or uninspected results. Acronym collisions can still be ambiguous; this is an engineering hypothesis rather than semantic understanding.
- The base goal score is retained as goalOverlap. A supported title contributes `overlap = goalOverlap + (1 - goalOverlap) * 0.4`; otherwise overlap equals goalOverlap. Rank boost and configured recognition noise are then added, with the original profile threshold unchanged. This cue cannot bypass the topical gate. Copying an attended title into a rewrite does not create a new identity cue; only the original query can supply one. Reports retain the cue, attended title and each score component.
- Rewrites prioritize topical words/phrases from the public task prompt. Broad-vocabulary profiles may also rewrite using a previously attended eligible candidate title. Generic instruction phrases are avoided; candidates are bounded/deduplicated and each rewrite still consumes the existing rewrite allowance. Typing slips and full typing costs remain enabled unless the selected control disables them.

Title comparison is modeled as part of the existing decision operator. No extra word-reading cost is invented: the title is already part of the charged card/detail text. Opening/reading details and typing a rewritten title are charged through their ordinary operators. Geometry, human memory, acronym knowledge and decision timing have not been empirically calibrated.

The adapters expose title only when a card or detail is attended. They do not expose it in the uninspected candidate list. Adapter versions advance to guided-public-model-v3 / guided-dom-v3; observed automation overhead can change while modeled reading text remains identical for legacy policies.

## Versioned comparisons and references

Investigation configuration now accepts policyVersions, exactly two distinct supported versions. The first is the reference; the second is compared against it. Supplied configurations explicitly pin `["v3", "v4"]`. To reproduce the old V1.4 policy comparison, add `"policyVersions": ["v2", "v3"]` to its investigation configuration. Ordinary simulator configurations continue using singular policyVersion.

Saved V1.4 investigation configurations omitted policyVersions; V1.5 defaults them to V3/V4, so pin the old pair for historical replay. Original output folders are never overwritten. Legacy V2 retains its V1.3 parity fixture. V3 has a new full-session hash fixture captured from commit b1389cf49ad55f140f161d61c0513cd588d4b573 for seeds 42 and 57, all six profiles and all eighteen assignments. It checks outcomes, traces, diagnostics and modeled costs, not browser automation timing.

The old synthetic benchmark cases are unchanged. Their historical held-out split remains separately reported; they are now reused regression fixtures, not a newly independent held-out evaluation for V4. No claim of human effectiveness follows from passing them. Future tuning needs fresh cases and suitably collected volunteer traces.

## Verify outputs

```bash
npm run check
npm test
python3 tests/verify-investigation.py simulation-runs/recovery-comparison-001
npm run test:browser
npm run test:simulator-browser
npm run test:recovery-browser
npm run test:investigation-browser
```

On Linux, prefix headed browser tests with xvfb-run -a. The investigation browser test includes all four lost-success assignment locations, tagged recorder reconciliation and desktop/mobile/print reports. Independent verifiers check source/payload hashes, selected policy pairs, unchanged named controls, raw recordings, outcomes, timing sums, score components and topical eligibility. Unit checks cover both legacy references, the four regressions, unrelated-result rejection at extreme noise/rank settings, independent details, bounded title/prompt recovery and evaluator isolation.

A perfect result on this small, deliberately structured directory is a possible ceiling effect, not a validation of human performance. Inspect all profiles, seeds, wrong selections and skips; do not select a policy only because its headline skip count is lower. The existing output/session/action limits, 64 MB artifact cap, separate human ratings and synthetic import rejection remain in force. See the V1.4 investigation guide for artifact fields and the V1.3 recovery guide for browser interruption mechanics.
