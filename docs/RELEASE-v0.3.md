# SearchAssist v0.3

The facilitator workspace helps prepare balanced sessions and inspect exported study recordings before analysis. The matching engine, synthetic directory, twelve tasks, and v0.2 recording schema remain unchanged.

## Workflow

1. Open **Study workspace**. Choose a code prefix, starting participant number, and count. Every 18 consecutive numbers covers all six condition orders and all three task rotations once. Download the assignment CSV and continue numbering on later schedules.
2. Choose **Set up session** for an assignment. The normal study form is filled; a participant must still acknowledge recording. An existing recording must be exported and cleared before another is set up.
3. Run the study and export JSON. Pause/resume, reload recovery, saved rating drafts, and original CSV downloads continue to work.
4. Import a batch of session JSON files into the workspace. Review invalid files, incomplete sessions, and repeated participant codes. All repeated codes are excluded until exactly one file is chosen. Import the full set of candidate files together; duplicates cannot be detected across separate batches.
5. Apply the analysis rules defined before collection. Incomplete sessions are excluded by default. The optional interruption filter changes timing means only, leaving success denominators and ratings intact.
6. Download the participant-condition CSV and inclusion-log CSV. The first contains three condition rows per included session; the second covers every imported file and its decision. Both record selected filters. Source file names and participant codes are included; queries and observation notes are omitted.

The comparison display uses equally weighted participant condition means. It reports how many participants contribute to success and timing. It does not run paired tests, infer significance, validate participant identities, or authenticate file contents. Partial sessions can leave different participant groups across conditions. Blank timing and rating values are missing data, not zero.

## Compatibility and limits

- Application version: 0.3. Recording/schema version: 0.2 / 2. Timing definition: `active-time-v2`. v0.2 JSON remains compatible; v0.1 remains separate.
- Batch limits: 60 files, 1 MB per file, 10 MB total. A new batch replaces the previous review. Reload clears imported data and choices.
- Reviewing recordings does not add recovery events or modify time, flags, drafts, original files, or the currently running study.
- Code matching is case-insensitive to flag likely duplicates conservatively. An explicit choice is required for repeated codes; conflicting choices exclude that participant.
- Existing session storage remains tab-local. No review data are uploaded or automatically persisted.
- Assignment schedules balance combinations deterministically. They are not randomized allocation, recruitment guidance, or a power calculation.

## Verification

`npm test` runs 26 automated tests. `npm run check` checks every application module and the browser script. New tests cover schedules continued at different participant numbers, read-only validation, malformed/legacy/oversized files, duplicate choices and conflicts, missing ratings, timing denominators, participant-weighted means, and export privacy/formula escaping.

`npm run test:browser` starts a temporary local server and runs Chromium against synthetic fixtures. It checks assignment setup; query persistence through pause/reload/resume; JSON download/import; invalid imports and cancellation; rating drafts; trial and summary downloads; batch imports, duplicate resolution and partial inclusion; review CSV downloads; recording isolation; clearing on reload; and mobile page overflow. CI stores desktop and mobile screenshots for layout inspection. Actual hidden-tab lifecycle behavior, screen-reader use, and physical-device testing still require a manual walkthrough.

Verification result: all 26 unit tests and syntax checks pass locally. GitHub Actions has passed both the unit and Chromium browser jobs. Desktop and mobile screenshots were inspected; tables scroll within their regions on narrow screens.
