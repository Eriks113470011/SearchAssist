# SearchAssist 1.0

V1.0 packages the current review into a reproducible export and adds a synthetic acceptance workflow for the research prototype. It retains the search, study, review, coverage, paired comparisons, ratings, incremental imports, and offline summary features from v0.9.

## Review bundles

Download review bundle ZIP creates a timestamped snapshot with an offline HTML/JSON report, aggregate condition/paired/rating/balance CSVs, instructions, and a manifest. The default aggregate-only bundle has nine files and omits individual codes, filenames, plan prefixes, queries, observations, and notes. Small-group privacy limits still apply.

Explicitly enable Include workspace backup and participant-level CSVs to include seven individual-data files: workspace JSON, assignments, inclusion log, planned coverage, assignment checks, participant-condition results, and paired participant results. The full bundle normally has 16 files. If no recordings are included, the last two CSVs are omitted and the manifest explains why; no-data aggregate values stay missing. The ZIP is not encrypted. Workspace JSON contains full embedded recordings and can be reopened after extraction; the ZIP itself is not an import format.

All outputs share one UTC snapshot date and the current analysis settings. The manifest records UTF-8 byte sizes and SHA-256 digests for every payload file. It excludes its own digest and does not claim authenticity or provide a digital signature. Archives use standard uncompressed ZIP entries and CRC32 without third-party runtime dependencies. The archive size limit is 32 MB. Existing individual downloads remain available.

Generation captures/revalidates state before asynchronous hashing. Workspace changes during preparation discard the pending download; errors cannot create partial archives. Ungenerated plan fields block export. Downloading a bundle does not change recordings, decisions, notes, undo history, or unsaved workspace status. Hashing needs Web Crypto in an HTTPS or localhost context; a clear failure leaves the existing downloads available.

## Acceptance workflow

Run npm run fixtures:qa to create 18 clean synthetic sessions and three edge-case files in the ignored qa-fixtures folder. The script refuses to overwrite existing files. docs/ACCEPTANCE-v1.0.md gives baseline results and manual checks for duplicate handling, additions/undo, ratings, bundles, workspace restoration, print, devices, and participant recovery. These are QA fixtures, not evidence of participant performance.

## Compatibility and scope

Application version is 1.0. Bundle format searchassist-review-bundle uses version 1. Recording version/schema remains 0.2 / 2; workspace project and summary report versions remain 2. Workspace versions 1 and 2 still open. Protocol, dataset, search definitions, timing, inclusion rules, and analysis meanings are unchanged. No data are uploaded or automatically persisted by app code.

This remains an exploratory HCI research prototype, not a validated usability instrument or production search service. Release numbering does not establish participant effectiveness, statistical significance, causal effects, or assistive-technology conformance.

## Verification

101 unit tests plus syntax checks cover the application and fixture generator. New tests verify standard CRC vectors, UTF-8 and empty ZIP payloads, safe fixed archive names, size limits, aggregate omissions, independent SHA-256/byte counts, explicit full-backup opt-in, restored decisions/notes, empty-result omissions, snapshot settings/versions/row counts, deterministic output, read-only generation, and malformed-input rejection.

Chromium checks exercise aggregate/full/no-included-data ZIP downloads, default opt-out, embedded workspace reopening, preservation of unsaved state, shared summary timestamps, plan guards, hash failures, cancellation after edits, and desktop/mobile overflow alongside all existing regressions. CI independently reads actual downloads with Python zipfile, checks ZIP CRCs, every manifest SHA-256 digest and byte count, and CSV/JSON agreement. Generated clean fixtures are checked against expected counts and timing differences. Screenshots and all four print pages are inspected. Target-device, screen-reader, and physical-printer checks remain manual.
