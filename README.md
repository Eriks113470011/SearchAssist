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
- A guided within-subject evaluation with all six condition orders, three task-set rotations, twelve trials, post-block ratings, trial CSV, and a full session JSON event log.
- Reproducible aggregate survey-analysis script, source notes, and an evaluation protocol.

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | App shell and accessible controls |
| `dist/styles.css` | Responsive visual design |
| `dist/app.mjs` | Views, result rendering, recovery, and local study workflow |
| `dist/engine.mjs` | Shared deterministic matching engine and explanations |
| `dist/data.mjs` | Synthetic directory and curated relationships |
| `tests/search.test.mjs` | Matching, conditions, evidence, filters, and study-target regression checks |
| `docs/survey-summary.json` | Aggregated counts, denominators, source fingerprint, and quality notes |
| `docs/analyze_survey.py` | Workbook analysis using openpyxl; raw text is not exported |
| `docs/RESEARCH.md` | Survey findings and project-method update |
| `docs/EVALUATION.md` | Study protocol, measurements, and interpretation limits |

Run search tests with `node --test tests/search.test.mjs`.

Reproduce survey counts with `python3 docs/analyze_survey.py /path/to/responses.xlsx docs/survey-summary.json`. This script requires `openpyxl` in your Python environment. The supplied source workbook and abstract are not included in this repository or app.

## Search definitions

**A Exact:** case-insensitive, accent-insensitive, punctuation-normalized literal phrase containment across title, category, description, and tags. This is not whole-record equality. Prefixes that happen to be literal substrings can therefore match in A.

**B Fuzzy:** the literal search plus curated alias/synonym equality, per-word prefix recovery, Damerau-style adjacent-transposition edit distance, reordered words, and partial-query matches. Short tokens are not fuzzily expanded. The same B engine and ranking power C.

**C SearchAssist:** B’s ranking plus explanations, highlighting, suggestions, and grouping. Result scores are deterministic ranking heuristics and are not shown as confidence probabilities. Partial-query results require at least half the query tokens to match; unmatched words are explicitly disclosed.

The engine is intentionally small, interpretable, and bounded. It is not a web search engine, an LLM, a semantic embedding model, or a production search backend. Stored relationships are editorial examples for the experiment; survey examples inform some choices but do not establish universal equivalence.

## Study data

The study stores data in browser `sessionStorage` after a local recording acknowledgement. Data remain in this tab across reloads, subject to browser behavior; closing the tab generally clears them. Export before leaving. A browser denying storage can prevent recovery after reload. There is no central participant database or automatic upload. Hosting infrastructure can retain ordinary request logs, but typed queries are not put in URLs or sent by app code. No analytics scripts are used.

Result CSV neutralizes leading spreadsheet formula characters. JSON preserves entered query text. Treat exports as study data and avoid personal information. Reloading or resuming a task restarts its timer and flags the trial; exclude or review those trials in timing analyses. Do not pool QA sessions with participant data.

## Status

Version 0.1 is an operational starting point. Search regression checks and a browser walkthrough are included in the development verification. Accessibility features require screen-reader and mobile-device testing. Real participant evaluation, task-difficulty calibration, formal comprehension measures, and a validated usability instrument remain future work. `docs/EVALUATION.md` explains the design limits.
