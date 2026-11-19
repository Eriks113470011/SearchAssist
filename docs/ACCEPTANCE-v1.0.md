# SearchAssist 1.0 acceptance checks

Use a separate browser tab and synthetic data before collecting participant recordings. These checks verify the research prototype's behavior; they do not establish statistical validity or accessibility conformance. Record the app version, browser/device, date, pass/fail, and any actual result differing from the expected one. Keep QA recordings separate from study data.

## Prepare

1. Run `npm run check` and `npm test` with Node.js 22 or later.
2. Run `npm run fixtures:qa`. It creates ignored `qa-fixtures/clean` and `qa-fixtures/edge` folders. The script refuses to overwrite existing fixture files; move or remove that generated folder deliberately before rerunning.
3. Serve `dist` using `python3 -m http.server 8080 --directory dist`, then open `http://localhost:8080/#workspace`. Use HTTPS on a hosted deployment. Browser module loading needs HTTP; bundle hashing needs HTTPS or localhost.
4. Set code prefix `QA_`, starting number `1`, participants `18`, and choose Generate schedule. Import only the 18 JSON files from `qa-fixtures/clean`.

## Baseline results

| Check | Expected |
| --- | --- |
| Review | 18 valid, 0 invalid, 18 included complete recordings |
| Coverage | 18 planned codes imported, 0 not imported, 18 included matching plan, 0 mismatches/unplanned |
| All 18 balance cells | 1 planned, 1 included, 1 complete, 1 matching plan in each |
| A / B / C success | 72 / 72 tasks and 100% mean participant success for each condition |
| A / B / C mean active time | 1.00 / 0.70 / 0.40 seconds |
| B − A / C − A / C − B success difference | 0 percentage points, 18 participants per comparison |
| B − A / C − A / C − B time difference | −0.30 / −0.60 / −0.30 seconds, 18 participants and 72 matched task-type pairs per comparison |
| Confidence median A / B / C | 2 / 4 / 6, with 18 submitted responses and none missing |
| Trust median A / B / C | 4 / 4 / 4 |
| Ease median A / B / C | 6 / 4 / 2 |
| Matched rating directions | 18 higher for confidence, 18 same for trust, 18 lower for ease in every comparison |

## Add, resolve, and undo

Add all three files from `qa-fixtures/edge` through Add session JSON files. Expect 21 files: 20 valid and one invalid. The original `QA_001` and new `qa_001` form a repeated-code group and are excluded until one is explicitly selected. Complete-only inclusion leaves 17 selected recordings. The added `QA_019` is incomplete and outside the 18-code plan.

Select the original QA_001: 18 complete recordings are included again. Select both copies: the conflict excludes that code, leaving 17. Uncheck the added copy to resolve it. Enable incomplete-session inclusion: QA_019 contributes four A trials and its submitted A ratings, but no B/C trials or paired blocks. Its code remains unplanned; timing settings do not change ratings.

Edit an earlier file's decision note, then Undo latest addition. Expect 18 original files, no added-file invalid row, the earlier edited note retained, and the current plan/settings kept. Save and reopen workspace JSON; the same choices, notes, and results should return. Undo history intentionally does not return.

## Bundle and backup

1. With the 18 clean recordings selected, leave Include workspace backup and participant-level CSVs unchecked and download a review bundle. Extract it with your operating system's ZIP tool.
2. Expect nine files: manifest.json, readme.txt, study-summary.html/json, condition-summary.csv, paired-summary.csv, rating-distributions.csv, matched-ratings.csv, and balance.csv. There is no individual folder or restorable workspace. Counts can still identify small groups in context.
3. Open the HTML offline. All four report sections should be readable; Print / Save as PDF should produce four US Letter pages under default settings. Check your target paper size, fonts, row boundaries, and table scrolling on a phone. Browser print settings can alter pagination.
4. Confirm CSV and JSON values match the baseline table. JSON and bundle CSV times use milliseconds; the HTML converts them to seconds. Null/blank values mean missing, not zero.
5. Verify manifest SHA-256 values against each extracted payload file (on macOS, `shasum -a 256 path/to/file`). The manifest does not hash itself. Digests detect changes, not authorship; this archive is not encrypted.
6. Explicitly check the individual-data option and download again. Expect 16 files, including seven under individual/. Workspace JSON contains full recordings, queries, observations, and notes. Open the extracted individual/workspace.json with Open workspace JSON; choices and settings should match. Keep this archive with study data.
7. Exclude all recordings and download again with individual data enabled. Expect missing aggregate results, plus two omittedFiles entries in the manifest for participant-condition and paired-participant CSVs. The workspace backup and audit files remain available.
8. Editing assignment fields without generating blocks bundle export. If a workspace changes during hashing, the archive should not download; retry for the current review. A bundle download preserves the unsaved indicator and active study recording.

## Participant workflow and devices

In a separate QA recording, verify keyboard-only setup/search/result selection, pause/resume without idle-time accumulation, reload recovery opening paused, unfinished rating drafts, invalid import rejection, replacement cancellation, and JSON/CSV export. Test interrupted timing exclusions and successful-only paired timing against the protocol. Do not reuse QA records as participant data.

Check your actual phone, browser, screen reader, keyboard focus order, live announcements, zoom, and printer. Inspect downloaded files, not only screen displays. Retain failures and expected/actual observations before deciding the prototype is ready for a participant pilot. Real task-difficulty calibration and participant evaluation remain separate work.
