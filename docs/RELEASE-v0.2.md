# SearchAssist v0.2

This release makes the guided study recoverable while preserving the v0.1 directory, task assignments, matching engine, and rankings.

## Changes

- Pause and resume a task without resetting its query, suggestion undo, or recorded active time.
- Pause automatically when the tab becomes hidden, the task view is left, or the page exits. Recovery always requires an explicit Resume.
- Save query changes immediately, flush pending reformulations before selections and pauses, and keep unfinished block ratings across reloads.
- Export trial CSV, condition-summary CSV, and versioned session JSON. Restore validated v0.2 JSON, including partial and completed sessions. Invalid imports leave the current session intact; valid replacements require confirmation.
- Separate active task time from wall time and retain interruption counts and restored-trial flags. Preserve v0.1 stored JSON as a separate original download.
- Add dependency-free Node test/check commands and GitHub Actions checks.

## Run and verify

Use Node.js 22 or later for `npm test` and `npm run check`. No package installation is needed. Serve the app using `python3 -m http.server 8080 --directory dist` and open http://localhost:8080.

Automated verification: 16 tests covering matching regressions, active/wall timing, repeated pause/restore, pending queries, partial-session continuation, incomplete ratings, import validation, CSV escaping, condition summaries, and all 18 order/rotation assignments. Module syntax checks pass. The matching engine and directory are byte-for-byte unchanged from the v0.1 source.

The v0.2 live-browser walkthrough remains pending. The available remote browser returned an Unauthorized page for the local server, so browser downloads, file-picker import, visibility handling, and rendered layout have not been verified in this continuation. Automated state tests do not replace these browser checks.

## Manual release walkthrough

1. Start a QA session with order CAB. Edit the query and immediately pause. Resume and confirm the edit and accumulated active time remain. Apply a correction, pause, resume, and check Undo restores the original query.
2. Hide the tab during a task, return, and confirm Resume is required. Reload during a task and confirm the query, task number, completed results, and recorded active time remain.
3. Complete four tasks, partially fill the ratings and observation, then reload. Confirm unfinished answers remain and can be completed.
4. Download all three exports. Check the JSON participant code and progress, trial-row count, and three condition-summary rows. During a pause, active time should stay fixed while wall time grows.
5. Restore the downloaded JSON into a fresh tab. Resume and finish the session; check that earlier trials and ratings are retained without duplication. Restore a completed session and confirm the summary remains available.
6. Try malformed JSON and a v0.1 export while another session is saved. Confirm a readable error and unchanged progress. Cancel replacement of a valid session and confirm the original remains. Keep developer QA exports separate from participant data.
7. Check keyboard focus, mobile layout, screen-reader announcements, and the storage warning in a browser with session storage denied.

## Analysis compatibility

Use `activeElapsedMs` for accumulated active task time; `elapsedMs` is its compatibility alias. Use `wallElapsedMs` for total interruption-inclusive duration. Define handling of `pauseCount`, `resumeCount`, and `restored` before recruitment. Wall time uses the device clock; abrupt exits and delayed checkpoints can lose unrecorded active time. Tab visibility is not a measure of attention.

Keep v0.1 and v0.2 timing analyses separate. v0.1 JSON cannot be restored into this version. The app remains an exploratory local prototype; no participant benefits or validated usability results are claimed.
