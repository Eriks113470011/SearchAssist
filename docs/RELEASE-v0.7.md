# SearchAssist v0.7

V0.7 adds a printable aggregate study summary to the facilitator workspace. It brings together the current batch's review counts, generated-plan coverage, analysis settings, descriptive condition results, paired comparisons, and all 18 order/rotation cells. It uses the existing selection and analysis functions.

## Workflow

1. Generate or reopen the assignment plan, import session recordings, resolve duplicates and inclusion decisions, and set the analysis filters.
2. Choose Preview study summary to read a sandboxed snapshot in the workspace. Close preview returns focus to its button.
3. Download summary HTML for an offline report. Open it in a browser and choose Print to print or save as PDF. The US Letter print layout separates context/coverage, outcomes, and balance. Browser print settings can affect pagination.
4. Download summary JSON for the same timestamped aggregate values and explicit units. It is an output report, not a workspace backup.
5. Keep the workspace JSON, original recordings, and detailed CSVs for the underlying audit.

Preview and downloads share a cached snapshot until a plan, batch, decision, note, or analysis setting changes. Edits discard the preview and snapshot. Ungenerated plan-field edits block reporting. Creating a report leaves the active recording and workspace state unchanged, including its unsaved status. Reports are available for any imported batch, including one with no included recordings; no-data results are explicitly missing.

## Report content and limits

- Review counts separate imported, valid, invalid, included complete/incomplete, excluded valid, repeated-code groups, and conflicting-selection groups.
- Coverage distinguishes imported planned codes, codes not imported, codes without an included recording, included matching assignments, mismatches, unplanned codes, and flagged files.
- All three analysis settings are visible. Participant counts and matched task-type pair counts accompany results. Condition means and paired participant means retain equal participant weight.
- JSON reports proportions, percentage-point success differences, and milliseconds. HTML displays percentages, percentage points, and seconds. Missing values are null / Not available; zero remains zero.
- Both outputs omit participant codes, source filenames, plan prefixes, query text, observations, reviewer notes, and individual rows. Counts can still describe identifying small groups. The report does not guarantee anonymity or replace the audit.
- The HTML has inline CSS, no scripts or external resources, and a restrictive Content Security Policy. The embedded preview is sandboxed without permissions.
- Results remain descriptive. The report explains incomplete coverage, jointly successful timing subsets, matched-type limits, and the inability to attribute B/C differences to explanations alone. It adds no inference tests or winner labels.

## Compatibility

Application version is 0.7. Summary format is searchassist-study-summary, version 1. Workspace project version remains 2 and still reads versions 1 and 2. Recording version/schema remains 0.2 / 2 with active-time-v2. Search, study protocol, dataset, timing, inclusion rules, and existing CSV calculations are unchanged. Reports are recomputed rather than trusted as saved analysis inputs. No participant data are uploaded or automatically persisted by the app.

## Verification

69 unit tests and module/browser-script syntax checks pass. New tests cover agreement with canonical calculations across all 18 assignments and filter combinations; duplicate/conflict/partial/invalid counts; missing versus zero values; signed percentage-point and time units; identity and free-text omissions; escaped HTML; offline/CSP restrictions; read-only generation; and workspace round-trips.

Chromium automation checks preview and downloads, shared snapshots, read-only workspace state, close-preview focus, invalidation after filters/notes/plan changes or reopening, the ungenerated-plan guard, no-included-data reporting, disabled empty-batch controls, offline HTML, printed PDF generation, and desktop/mobile layouts alongside all previous regressions. The generated PDF and page screenshots are inspected for print layout. Screen-reader, physical-device, physical-printer, and actual hidden-tab lifecycle checks remain manual.
