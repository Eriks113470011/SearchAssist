# SearchAssist v0.4

Portable workspaces preserve the facilitator's review across visits and devices. v0.4 also adds per-file decision notes to the inclusion log. Search, the synthetic directory, study tasks, recording schema, and timing definition remain unchanged.

## Use the workspace

1. Generate an assignment schedule, then import session JSON files under Review session exports.
2. Select duplicate copies and inclusion choices, set the analysis filters defined by the protocol, and add optional decision notes (up to 1,000 characters per file).
3. Choose **Download workspace JSON**. Generate the schedule first if assignment fields have been edited. Workspace edits show an unsaved-changes message; exporting a CSV does not save the workspace.
4. On another visit or device, use **Open workspace JSON**. The plan, embedded recordings, choices, filters, and notes are restored together. An existing review or unsaved plan is replaced only after confirmation. Invalid files leave it unchanged.
5. Export the participant-condition CSV and inclusion-log CSV as before. Decision notes appear in the inclusion log; neither CSV contains recorded queries or participant observations.

Nothing is automatically persisted or uploaded. Reload still clears the current in-memory review; download the workspace before leaving. Opening or clearing a facilitator workspace does not resume, replace, or clear the active participant recording.

## Data and compatibility

Workspace JSON is a separate format (`searchassist-review-project`, project version 1). It includes full validated recordings, including queries, participant observations, and events. Store it with raw study data and keep it out of the repository. Invalid source files keep only their name, error, decision, and reviewer note; raw invalid source contents are omitted.

Project files are limited to 12 MB. Embedded recordings retain the review limits of 60 files, at most 1 MB each, and at most 10 MB in aggregate. On open, embedded recordings are revalidated without recovery side effects. Duplicate flags and comparisons are recomputed; stored summaries and unknown metadata are ignored. Unresolved duplicate conflicts remain unresolved.

The application version is 0.4. Participant recordings remain version 0.2 / schema 2 / `active-time-v2`; original v0.2 and v0.3 app exports remain compatible. Legacy v0.1 recordings remain separate. Individual session JSON cannot be opened as workspace JSON, and workspace JSON belongs in the workspace controls rather than participant-session restore.

## Verification

`npm test` runs 36 unit tests. The new cases cover project round-trips, explicit/default decisions, filters and notes, active-clock isolation, unknown metadata, damaged embedded recordings, wrong formats, project size limits, invalid settings, empty projects, unresolved duplicate conflicts, and CSV note escaping. `npm run check` validates all application modules and browser tests.

The Chromium suite additionally downloads a workspace, reopens it after reload, checks restored CSVs and assignment controls, verifies decision notes and analysis settings, rejects malformed and damaged projects, tests accepted and cancelled replacement, prevents saving ungenerated assignment edits, and verifies that the active study recording is unchanged. Existing study recovery, download, review, and mobile overflow checks continue to run.

Screen-reader use, actual hidden-tab lifecycle behavior, and physical-device testing remain manual checks. Project files do not authenticate recordings or establish participant benefit.
