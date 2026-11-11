# SearchAssist v0.6

Study coverage connects the facilitator's generated assignment plan to the recordings currently under review. It adds planned progress, order/rotation counts, per-recording checks, and three CSV exports. It does not change participant recordings, matching, task assignments, timing, inclusion rules, or paired comparisons.

## Workflow

1. Generate or reopen the intended participant assignment plan. Editing form fields alone does not update the plan; choose Generate schedule.
2. Import the candidate session JSON files and resolve duplicate choices and inclusion decisions as before.
3. Read the Study coverage summary. It separates planned codes imported, planned codes not imported, and planned codes without an included recording.
4. Expand Planned participant progress, Condition order and task rotation counts, and Recording assignment checks. Check recorded order/rotation differences and codes outside the plan against the study log. Coverage never changes inclusion decisions automatically.
5. Export Coverage CSV, Balance CSV, and Assignment checks CSV. Save workspace JSON to preserve the existing plan and review decisions; coverage is recomputed when reopened.

## What the reports mean

- A planned code is imported when at least one valid recording in this batch has that code. Multiple exports can belong to one code. Matching ignores letter case but preserves the rest of the code exactly.
- Imported and included are distinct. Valid recordings may be excluded manually, by incomplete-session rules, or while duplicate decisions remain unresolved. Conflicting duplicate selections are identified separately.
- “Not imported in this batch” does not establish that a person did not participate. Invalid JSON has no trusted code, and the app does not infer a code from the file name.
- Each included code contributes once to actual order/rotation counts. These actual counts may include unplanned codes and assignment mismatches. Matching-plan counts require the code, order, and rotation all to match.
- Assignment checks cover every file, including excluded copies. They flag invalid recordings, codes not in the current plan, and order/rotation differences. They do not repair recordings or change analysis results.
- Counts describe the current batch and plan. They are not a recruitment recommendation, power calculation, or statistical test. A plan can exceed the review's 60-file batch limit.

Coverage CSV has one row per planned assignment; Balance CSV always has 18 rows; Assignment checks CSV has one row per imported file. All include `coverage-v1`, the plan prefix/start/count, and the incomplete-session setting. They omit queries, participant observations, and reviewer notes. File names and participant codes remain where relevant. Numeric rotation indices use 0–2 and readable task-cycle labels accompany them.

## Compatibility

Application version is 0.6. Workspace project version remains 2 and still reads versions 1 and 2. Participant recording version/schema remains 0.2 / 2 with `active-time-v2`. Existing search, analysis, and paired-comparison behavior is unchanged. Coverage is derived from saved inputs and decisions rather than trusted stored report fields. No new participant data are uploaded or automatically persisted.

## Verification

`npm test` runs 59 unit tests. Coverage tests include empty batches, all 18 combinations, imported-but-excluded recordings, mismatches and unplanned codes, exact case-insensitive matching, duplicate choices/conflicts, incomplete inclusion, invalid file names, plan changes, timing-filter independence, workspace round-trips, CSV counts/context, and formula-safe file names. `npm run check` checks all application modules and the browser script.

Chromium checks exercise displayed coverage counts, invalid-file isolation, duplicate conflicts and resolution, partial inclusion, recorded-versus-planned counts, excluded-file checks, all three downloads, plan regeneration, reopening a workspace, active-recording isolation, and desktop/mobile overflow alongside existing study/workspace/paired regressions. Screen-reader, physical-device, and actual hidden-tab lifecycle checks remain manual.

Browser CI prefers a Chrome/Chromium executable already installed on the runner and uses the Playwright installation as a fallback. This avoids an unnecessary browser/dependency installation when the runner is ready. Local browser QA can select an installed executable through `SEARCHASSIST_CHROMIUM_PATH`.
