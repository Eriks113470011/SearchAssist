# SearchAssist v0.8

V0.8 adds analysis of submitted confidence, trust, and ease ratings to the facilitator workspace and printable summary. It uses the ratings already collected after each block and preserves their original seven-point scale anchors.

## Workflow

1. Generate or reopen a workspace, import recordings, and resolve inclusion and duplicate decisions.
2. Read Post-block ratings. The first table has nine condition/question rows with submitted/missing counts, medians, and every response count from 1 to 7.
3. Read the matched table for nine comparison/question rows with matched/unpaired counts and higher/same/lower reported ratings in the comparison condition.
4. Download Rating distributions CSV and Matched ratings CSV. Each has nine aggregate rows, scale anchors, a rating definition, and the incomplete-session setting.
5. Preview or download the study summary to include these results and definitions. The offline print layout adds a fourth section for ratings.

Only final submitted block ratings count. Drafts stay missing. Existing inclusion choices, incomplete-session inclusion, and duplicate rules apply. Timing filters do not affect ratings. Downloads remain available for an imported batch with no included recordings; an empty workspace disables the new buttons. Median values are missing when there are no responses. Even-count medians can lie between scale points.

## Interpretation and data scope

The three questions are separate custom ordinal responses, not a validated usability scale or a composite. Matched counts compare the same participant's submitted responses in two conditions. Higher/same/lower describes direction, not the size or statistical significance of differences. Different condition rows and pairs can contain different participants. The app adds no imputation, inferential tests, winner labels, or causal claims.

The rating outputs are aggregate only: no participant codes, filenames, queries, observation notes, or reviewer notes. Small-group privacy limits still apply. The detailed participant-condition CSV and original recordings remain available for an underlying audit. Analysis and export are read-only and preserve active recordings and unsaved workspace state.

## Compatibility

Application version is 0.8. Summary JSON version 2 adds ratingScale, ratings, pairedRatings, and a rating unit while retaining earlier field meanings. Downloaded version-1 reports remain standalone outputs; summary reports are not workspace imports. Recording version/schema remains 0.2 / 2 and workspace project version remains 2, with versions 1 and 2 still readable. Reopened workspaces recompute rating results from submitted ratings. The protocol, dataset, search engine, collection form, task timing, and existing task-result calculations are unchanged.

## Verification

80 unit tests and syntax checks cover all application modules. New tests exercise all 18 orders/rotations, odd/even medians, all seven response points, independent questions, submitted versus draft values, partial and matched participant sets, invalid files, duplicate choices/conflicts, timing-filter independence, directional counts, empty data, privacy omissions, CSV metadata, read-only behavior, workspace round-trips, and summary version 2.

Chromium automation checks both displayed tables, draft exclusion, higher/equal/lower counts, incomplete inclusion, timing-filter independence, both CSV downloads, report data, read-only unsaved status, reopening, manual exclusions, empty-batch controls, desktop/mobile layouts, and printable PDF output alongside earlier regressions. Screenshots and the generated print pages are reviewed. Screen-reader, physical-device, and physical-printer verification remain manual.
