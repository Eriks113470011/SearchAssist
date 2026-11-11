# SearchAssist

A working first HCI prototype based on Erik Swanson’s project abstract and 26 survey responses. The app explores whether transparent approximate matching and recovery controls can improve directory search. No participant evaluation results are claimed.

## Run locally

No build, package installation, API key, or database is required. Use an HTTP server because browser ES modules do not run reliably from file URLs.

```bash
cd dist
python3 -m http.server 8080
```

Open http://localhost:8080. Core functionality works without external services. An optional Google Fonts stylesheet falls back to system fonts when unavailable.

## What is included

- A responsive directory containing 48 synthetic entries across Tools, Services, Resources, Places, and Forms.
- Exact, conventional fuzzy, and SearchAssist search conditions.
- Matching for normalized literal phrases, whole words, spelling distance including adjacent transpositions, word prefixes, reordered words, and explicitly stored aliases/synonyms.
- Evidence highlights, field-specific short explanations, optional explanations on request, editable correction suggestions with undo, category/title filters, and controls for approximate results.
- Keyboard operation using Tab, Enter, Escape, slash to focus search, and arrow keys between result titles. Visible focus, underlined highlights, labelled inputs, modal dialogs, and live result announcements.
- Research and insights page with aggregate survey findings and evidence-to-design mappings.
- A guided within-subject evaluation with all six condition orders, three task-set rotations, twelve trials, saved post-block rating drafts, trial CSV, condition-summary CSV, and a restorable session JSON event log.
- Pause/resume and reload recovery that preserve the current query, suggestion undo, completed tasks, and recorded active time. Restored sessions require an explicit Resume.
- Reproducible aggregate survey-analysis script, source notes, and an evaluation protocol.
- A facilitator workspace with balanced participant assignments, batch session review, explicit duplicate resolution, timing exclusions, and participant-condition and inclusion-log CSV exports.
- Portable workspace JSON files that preserve the generated assignment plan, full review recordings, choices, filters, and optional per-file decision notes for another visit or device.
- Within-participant comparisons for B − A, C − A, and C − B, with matched task-type timing, participant counts, and paired participant/summary CSV exports.
- Study coverage against the generated plan, all 18 condition-order/task-rotation counts, per-recording assignment checks, and three coverage CSV reports.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | App shell and accessible controls |
| `dist/styles.css` | Responsive visual design |
| `dist/app.mjs` | Views, result rendering, recovery, and local study workflow |
| `dist/study.mjs` | Versioned session state, timing, validation, restoration, summaries, and CSV exports |
| `dist/workspace.mjs` | Assignment schedules, read-only batch validation, inclusion rules, and descriptive comparisons |
| `dist/workspace-view.mjs` | Facilitator workspace interface and local file controls |
| `dist/review-project.mjs` | Versioned workspace JSON validation, saving, and reopening |
| `dist/paired.mjs` | Matched participant comparisons, timing eligibility, differences, and paired CSVs |
| `dist/coverage.mjs` | Batch coverage, assignment mismatches, plan/actual counts, and coverage CSVs |
| `dist/engine.mjs` | Shared deterministic matching engine and explanations |
| `dist/data.mjs` | Synthetic directory and curated relationships |
| `tests/search.test.mjs` | Matching, conditions, evidence, filters, and study-target regression checks |
| `tests/study.test.mjs` | Timing, query recording, all 18 study assignments, restore validation, and exports |
| `tests/workspace.test.mjs` | Balanced schedules, duplicates, partial sessions, timing exclusions, and review exports |
| `tests/review-project.test.mjs` | Project round-trips, validation, recording isolation, decision notes, and limits |
| `tests/paired.test.mjs` | Comparison signs, full-block eligibility, matched timing, equal weighting, missing data, and CSV measurements |
| `tests/coverage.test.mjs` | Imported versus included codes, assignment matching, balance counts, duplicates, partial sessions, and coverage exports |
| `tests/browser.mjs` | Chromium checks for study recovery, imports/downloads, workspace decisions, and mobile overflow |
| `docs/survey-summary.json` | Aggregated counts, denominators, source fingerprint, and quality notes |
| `docs/analyze_survey.py` | Workbook analysis using openpyxl; raw text is not exported |
| `docs/RESEARCH.md` | Survey findings and project-method update |
| `docs/EVALUATION.md` | Study protocol, measurements, and interpretation limits |

Run all automated tests with `npm test` (Node.js 22 or later). Run module syntax checks with `npm run check`. Neither command needs package installation.

For browser QA, run `npm install`, `npx playwright install chromium`, and `npm run test:browser`. Alternatively, set `SEARCHASSIST_CHROMIUM_PATH` to an installed Chrome/Chromium executable. The browser test starts its own temporary HTTP server and uses synthetic recordings. GitHub Actions prefers Chrome/Chromium already installed on the runner and falls back to installing Playwright Chromium and its operating-system dependencies when none is available. Screenshots are generated under `test-results/` for internal layout review.

Reproduce survey counts with `python3 docs/analyze_survey.py /path/to/responses.xlsx docs/survey-summary.json`. This script requires `openpyxl` in your Python environment. The supplied source workbook and abstract are not included in this repository or app.

## Search definitions

**A Exact:** case-insensitive, accent-insensitive, punctuation-normalized literal phrase containment across title, category, description, and tags. This is not whole-record equality. Prefixes that happen to be literal substrings can therefore match in A.

**B Fuzzy:** the literal search plus curated alias/synonym equality, per-word prefix recovery, Damerau-style adjacent-transposition edit distance, reordered words, and partial-query matches. Short tokens are not fuzzily expanded. The same B engine and ranking power C.

**C SearchAssist:** B’s ranking plus explanations, highlighting, suggestions, and grouping. Result scores are deterministic ranking heuristics and are not shown as confidence probabilities. Partial-query results require at least half the query tokens to match; unmatched words are explicitly disclosed.

The engine is intentionally small, interpretable, and bounded. It is not a web search engine, an LLM, a semantic embedding model, or a production search backend. Stored relationships are editorial examples for the experiment; survey examples inform some choices but do not establish universal equivalence.

## Study data

The study stores data in browser `sessionStorage` after a local recording acknowledgement. Data remain in this tab across reloads, subject to browser behavior; closing the tab generally clears them. Export before leaving. A browser denying storage can prevent recovery after reload. There is no central participant database or automatic upload. Hosting infrastructure can retain ordinary request logs, but typed queries are not put in URLs or sent by app code. No analytics scripts are used.

Result CSV neutralizes leading spreadsheet formula characters. JSON preserves entered query text. Treat exports as study data and avoid personal information. Do not pool QA sessions with participant data.

Active time uses a monotonic clock and accumulates across resumptions. Manual pauses, navigation away from the task, hidden tabs, and page exits stop active timing. Reload recovery and imported JSON sessions open paused. Wall time includes interruptions and time away; it uses the device clock and can be affected by clock changes. An abrupt exit can lose active time since the last checkpoint (normally up to one second; browser scheduling can delay it). `elapsedMs` and `activeElapsedMs` both report active time; `wallElapsedMs`, `pauseCount`, `resumeCount`, and `restored` describe interruptions. Define how to review interrupted trials before collecting data.

To restore, open **Run a study**, choose a v0.2 session JSON file under 1 MB, and choose **Resume task** when ready. Invalid files are rejected before replacing the current session; replacing a valid current session requires confirmation. Export the current JSON first to keep both sessions. Unfinished ratings are also restored. v0.1 JSON uses different timing semantics and cannot be imported into v0.2; any v0.1 session already stored in the tab remains available as an original JSON download. Keep v0.1 and v0.2 timing analyses separate.

## Status

Version 0.6 adds coverage and assignment checks against the generated plan. The recording schema remains v0.2 with the same dataset, tasks, engine, and timing definition, so v0.2 recordings remain restorable and reviewable. The application version shown in navigation is independent of the recording-schema and workspace-project versions. See `docs/RELEASE-v0.6.md` for workflow and verification. Accessibility features require screen-reader and physical-device testing. Real participant evaluation, task-difficulty calibration, formal comprehension measures, and a validated usability instrument remain future work. `docs/EVALUATION.md` explains the design limits.

## Facilitator workspace

Open **Study workspace** to generate 1–180 numbered assignments. Every 18 consecutive assignments cover all six condition orders crossed with three task rotations once. Start numbering where the previous schedule stopped to continue its sequence. This is deterministic balancing; it is not randomization, a recruitment target, or a power calculation. Download the schedule to retain it. **Set up session** fills the normal study form and still requires the recording acknowledgement; export and clear an existing session before setting up another participant.

Review up to 60 session JSON files at once, totaling at most 10 MB and at most 1 MB per file. A new batch replaces the current in-memory review. Invalid files are isolated with per-file messages. Only completed sessions are included by default. All files sharing a participant code (case-insensitive) are excluded until exactly one is selected. Import all candidate files in one batch when resolving duplicate exports. Reloading clears the review; source files and the current study recording are untouched.

The optional timing filter excludes paused, resumed, or restored trials from timing means only; success denominators still include those trials. Choose analysis rules before collecting data. Comparisons show equally weighted participant means, with contributing participant counts per condition. When incomplete sessions are included, condition groups can contain different people; the display does not perform paired or inferential tests. Empty means stay blank in CSV.

Download the participant-condition CSV for one row per included recording and condition, and the inclusion log for every imported file and its inclusion reason. Both exports record the partial-session and interruption filters. They contain participant codes and source file names, but omit typed queries and participant observation notes. The inclusion log also includes optional reviewer decision notes. They are descriptive analysis inputs, not a central participant database; full recordings remain available in the original JSON files.

## Save and reopen a workspace

Choose **Download workspace JSON** in Study workspace to keep a generated assignment plan, imported recordings, duplicate decisions, inclusion choices, both analysis filters, and decision notes. Generate the assignment schedule before saving edited plan fields. The unsaved-changes message tracks workspace edits; CSV downloads do not mark the workspace as saved. Nothing is saved automatically, and reload still clears the in-memory workspace.

On a later visit or another device, choose the saved file through **Open workspace JSON**. Validating the entire project happens before a replacement prompt or any state change. Damaged or unsupported projects leave the current workspace intact. Replacing an existing review or unsaved plan requires confirmation. Individual session JSON belongs in **Review session exports**, while workspace JSON belongs in **Open workspace JSON**. Neither opening nor reviewing projects resumes or replaces the active study recording.

Workspace JSON uses `searchassist-review-project`, project version 2, and a 12 MB file limit. Version 2 preserves the paired-timing setting. v0.4's version-1 workspace files still open, with successful-only paired timing enabled by default; subsequent saves use version 2. Older v0.4 apps cannot open version-2 projects, so keep original version-1 files when needed. Its embedded recordings must pass the same v0.2 checks and 60-file / 10 MB aggregate / 1 MB-per-recording limits as the review. Duplicate groups and comparison results are recomputed. Invalid source files retain only their name, error, choice, and decision note; their original invalid contents are not stored.

**Workspace JSON contains the full validated recordings, including typed queries and participant observations.** Keep it with the original study data and do not commit it to the repository. The CSV reports remain reduced outputs; the inclusion log carries your decision notes. Notes are limited to 1,000 characters per review file. Opening a workspace restores those notes and decisions, including unresolved duplicate conflicts, without silently resolving them.

## Within-participant comparisons

The workspace now shows B − A (Fuzzy minus Exact), C − A (SearchAssist minus Exact), and C − B (SearchAssist minus Fuzzy). Each pair uses the same participants on both sides and requires all four trials in both condition blocks. A completed block does not require a submitted block rating because paired reports compare task success and timing only. Incomplete sessions remain opt-in; when included, different pairs may have different eligible participants.

Success difference is comparison success proportion minus reference success proportion, in percentage points. For example, 3/4 in B versus 2/4 in A is +25 percentage points for B − A. The summary averages participant differences equally. Success uses all four trials in each block, including wrong choices and skips, regardless of timing filters.

Paired timing matches spelling, alias, partial, and reordered task types within the participant. **Require correct selections in both conditions** is enabled by default; unchecking it includes wrong choices and skips in timing. When interruption exclusion is enabled, an interruption on either side removes that task type from both sides. Each participant's eligible type differences are averaged, then participant means are averaged with equal weight. No eligible types means a missing timing value, not zero. Counts of timing participants and matched type pairs are shown. Successful-only results describe jointly successful types; type coverage can differ between participants and comparisons. Matching type does not validate equal task difficulty.

A negative active-time difference means less active time in the comparison condition. These are descriptive comparisons, without p-values, confidence intervals, or causal claims. Choose analysis rules before collection. The original condition table remains available and can use different participant or timing subsets from the paired table.

**Paired participant CSV** includes one row per selected session and comparison, including ineligible pairs with missing values and an explanation. It records block counts, success differences, matched type coverage, timing means/differences, excluded types, and all applicable filters. **Paired summary CSV** contains three aggregate comparison rows with participant counts and means. Both omit queries and participant/reviewer notes. Computed negative numbers remain numeric in CSV; spreadsheet formula protection still applies to user-supplied strings.

## Study coverage and assignment checks

**Study coverage** compares the generated or restored assignment plan with this imported batch. Generate the schedule after editing its fields. The summary distinguishes planned codes with a valid imported recording, planned codes not imported, and planned codes without an included recording. A recording can be imported yet excluded by your choices, duplicate-resolution rules, or incomplete-session setting. Code matching is case-insensitive and otherwise exact: `p001` matches `P001`, while `P1` does not.

Expand **Planned participant progress** for one row per assignment. It shows imported-file counts, included progress, and whether the included recording's order and task rotation match the plan. **Recording assignment checks** covers every imported file, including excluded copies, and flags invalid recordings, codes outside the current plan, and order/rotation differences. Invalid JSON has no trusted participant code; the app does not infer one from its file name.

**Condition order and task rotation counts** always lists all 18 combinations. Planned counts come from the generated schedule. Included and included-complete counts use each selected recording's actual order/rotation, including unplanned codes and mismatches. Included-matching-plan counts require a planned code with both settings matching. Each included participant code contributes once after duplicate resolution. These are counts for the current batch, not a recruitment target or a test of statistical balance.

Checks are descriptive and never change inclusion, overwrite recorded assignments, or affect timing/success calculations. Review a mismatch against the study log and change inclusion manually if appropriate. “Not imported” does not mean that a person did not participate: a recording may simply be outside the current batch. A plan may contain up to 180 assignments while the review remains limited to 60 files at a time.

Download **Coverage CSV** for every planned code, **Balance CSV** for all 18 combinations, and **Assignment checks CSV** for every imported file. They record `coverage-v1`, the plan prefix/start/count, and the incomplete-session setting alongside the counts, inclusion flags, or assignment checks. Numeric rotation indices use 0–2; readable task-cycle labels are included. They omit queries, participant observations, and reviewer notes. Source file names and participant codes are retained where relevant.

Coverage is recomputed from existing workspace data rather than stored as a trusted summary. Workspace project version 2 is unchanged; version-1 and version-2 projects still open, and reopening restores the plan and review decisions used to reconstruct coverage. No additional participant data are uploaded or persisted.
