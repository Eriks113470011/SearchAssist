# SearchAssist v0.9

V0.9 adds incremental imports to the facilitator review. Later session files can be added without replacing earlier decisions or notes. A one-step undo removes the latest addition during the current visit.

## Workflow

1. Generate or reopen a workspace and review the initial recordings as before.
2. Choose Add session JSON files to extend the review. The status reports added/total files and repeated-code groups.
3. Check inclusion decisions. Duplicate groups are recomputed across all candidates. A previously default-included code becomes excluded when newly repeated until one candidate is explicitly selected. Earlier explicit choices and unresolved conflicts remain in effect.
4. Continue editing choices and notes, or choose Undo latest addition to remove only that latest group. Edits on earlier files, the plan, and current settings are kept.
5. Download workspace JSON to retain the combined review. Existing task, coverage, rating, CSV, and summary outputs recompute from its current decisions.

Additions work from an empty workspace too. Adding the same file again creates another candidate rather than silently deduplicating it. Undo returns the previous duplicate structure; default inclusion can therefore change when a code becomes unique again. Only the latest addition can be undone. Successful reopening, replacement, or clearing resets undo; saving/report downloads do not. Undo history is not saved in project JSON.

## Limits and state preservation

The combined review remains limited to 60 files and 10 MB, with a 1 MB per-recording validation limit. Addition size checks count retained valid recording JSON plus incoming bytes. Earlier invalid contents were discarded at import; their names, errors, and decisions remain available. A single invalid or oversized file is isolated when combined limits permit. Combined-limit or file-read failures leave existing review data and undo intact. Newer imports, clear, and undo prevent stale asynchronous reads from committing later.

Existing file positions, explicit choices, decision notes, generated plan, and analysis settings are preserved. Additions and undo mark the workspace unsaved and invalidate summary previews. Neither action resumes, replaces, retimes, or edits the active study recording. No files are uploaded or automatically persisted by app code.

## Compatibility

Application version is 0.9. Recording version/schema remains 0.2 / 2; workspace project version and summary report version remain 2. Workspace versions 1 and 2 still open. The combined review saves through the existing project format and revalidates on reopening. Analysis definitions, protocol, search engine, dataset, collection form, task timings, ratings, and report field meanings are unchanged.

## Verification

92 unit tests pass with application and browser-script syntax checks. New tests cover preserved file positions/choices/notes, input immutability, case-insensitive duplicate formation, previous explicit choices/conflicts, invalid isolation, partial inclusion, identical-file candidates, 60-file and 10 MB limits, empty additions, undo after later edits, default inclusion after undo, multiple additions, workspace round-trips, and derived report agreement.

Chromium automation covers addition from an empty review, retained choices/notes/settings, new and already-resolved duplicate groups, summary invalidation, undo and focus return, saves without resetting undo, atomic count/size/read failures, reopening without undo history, oversized-file isolation, clearing during a delayed read, recording isolation, and desktop/mobile layouts alongside earlier regressions. Screenshots and the four-page printable summary are reviewed. Screen-reader, physical-device, and physical-printer verification remain manual.
