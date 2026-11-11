# SearchAssist v0.5

The facilitator workspace now compares each participant's results between search conditions. It adds paired participant and summary CSVs and preserves the paired-timing setting in workspace files. Search behavior, the synthetic directory, trial assignments, recording schema, and active-time definition remain unchanged.

## Workflow

1. Open a workspace or import session JSON, resolve duplicates, and apply the study's inclusion rules.
2. Review **Within-participant comparisons** for B − A, C − A, and C − B. A pair contributes only when its participant has completed both four-task blocks. Incomplete sessions remain excluded by default; enabling them can produce different participant groups for different comparisons.
3. Set **Paired timing: require correct selections in both conditions** according to the analysis plan. It is enabled by default. Turning it off includes unsuccessful selections and skips in timing. This setting affects only paired timing, leaving success counts and the original condition table unchanged.
4. Inspect success-participant counts, timing-participant counts, and matched task-type pairs. An interruption exclusion removes a type from both conditions whenever either side was interrupted. Empty timing subsets remain blank.
5. Download the paired participant CSV and paired summary CSV. Save workspace JSON to retain the setting, inclusion choices, assignments, and notes for another visit.

## Interpretation

Success differences are percentage points: B success 3/4 minus A success 2/4 is +25 pp. Timing differences are comparison minus reference active milliseconds; B 1.5 seconds minus A 2 seconds is −0.5 seconds. The summary gives each participant equal weight, even when different numbers of task types qualify for timing.

Timing matches task type (spelling, alias, partial, reordered), not the actual directory target. Matching does not validate equal difficulty. Successful-only timing describes the jointly successful subset, not all tasks. Both four-task blocks must be complete, but final ratings are not required for these task-only comparisons. Type coverage and contributing participants may differ by comparison. These outputs are descriptive; they do not run significance tests, infer causal benefit, or isolate explanations from the other SearchAssist interface features.

Paired participant CSV contains three rows per selected recording, including ineligible pairs with missing results and reasons. Fields identify both conditions, trial/success counts, success eligibility and differences, timing coverage and means/differences, excluded types, and filter settings. Interruption exclusions precede unsuccessful exclusions so each type has at most one listed exclusion reason. Paired summary CSV contains three comparison rows with aggregate counts and participant-weighted differences. Queries and participant/reviewer notes are omitted from both; participant-level output retains participant codes and file names.

## Compatibility

- Application version: 0.5. Participant recording version/schema: 0.2 / 2, timing definition `active-time-v2`.
- Workspace exports use project version 2 to preserve `pairedSuccessfulOnly`. Version-1 workspace files from v0.4 open with this setting enabled. Subsequent saves use version 2; v0.4 apps cannot read those newer files.
- No recording or project is uploaded or automatically persisted. Full recordings remain in workspace JSON; keep it with raw study data.
- Calculated negative numeric CSV fields remain numeric. Spreadsheet formula protection continues for user-supplied strings, including negative-looking query text.

## Verification

`npm test` runs 48 unit tests. New cases cover all 18 order/rotation assignments, comparison direction and units, successful-only and all-attempt timing, bilateral interruption filtering, complete-block eligibility, partial-session opt-in, equal participant weights with unequal type coverage, missing versus zero differences, duplicate/exclusion rules, paired CSVs, negative numeric serialization, and version-1/2 workspace compatibility. `npm run check` validates every application module and the browser script.

The Chromium suite checks displayed participant counts, signed differences, matched type counts, filter effects, both paired downloads, version-2 save/reopen, version-1 migration, invalid-setting isolation, and desktop/mobile layout, alongside existing study and workspace regression checks. Screen-reader use, physical-device testing, and actual hidden-tab lifecycle behavior remain manual checks.
