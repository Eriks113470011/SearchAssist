# V5: constraint checks before submission

V5 is an explicit, experimental behavior policy. V4 remains the default. Search, records, A/B/C interfaces, adapters, timing, profiles, thresholds and hard budgets are unchanged. B and C still share the approximate engine. V5 cannot access acceptable answers or result IDs; it reads public text through the same charged actions as V4.

## Decision behavior

V5 extracts directional campus locations, common time/day words, student/staff eligibility and open/current/working/onsite/walk-in/public requirements from the public prompt. Each recognized requirement must have affirmative attended evidence. Negated availability, closed/archive/example-only entries, location exclusions and audience restrictions block submission. A matching title or acronym cannot establish qualification: the text beyond the title must also support the requested service. An unrelated campus map cannot satisfy a transport request merely by matching its location.

A candidate must pass both card and detail checks, the unchanged topical gate, and the profile's existing score threshold. Every submission requires a charged detail read, including profiles that previously submitted without further reading. A rejected candidate is not reopened in the same query epoch. If the initial scan yields no qualifying candidate, V5 inspects further alternatives and uses public-prompt rewrites within the existing 24-action / 120-second modeled limits. Profile scan limits still guide the initial scan; extending inspection after rejection is part of the V5 intervention, not a profile parameter change. Reading and inspecting more candidates can cost more modeled time.

## Boundaries

This is a bounded English lexical checker, not general language understanding. Recognized constraints with no positive evidence cause abstention. Unsupported negated prompt requirements are conservatively blocked. Unrecognized locations, complex exceptions, synonyms, references across clauses and arbitrary implicit restrictions remain limitations. Scoped Sunday closure is ignored for a Monday request; “not only staff” and “no appointments required” are not blanket exclusions. These focused rules do not prove correct handling of every negation. Multiple fully qualifying candidates may all be valid.

Traces include recognized requirements, support/contradiction snippets, unknown requirements, service evidence, detail checks, and the submission gate. Rejection observations can repeat after query changes and are not unique rejected records. Terminations distinguish deliberate skips from action/time-budget stops; benchmark correct abstention means no selection on an unanswerable fixture, including budget stops. Modeled costs are hypothetical, not measured human time.

## Reproduce

Requires Node 22+; browser checks also require Playwright and Chromium.

```sh
npm run check
npm test
npm run validate:constraints -- --config configs/validation-development.json --output simulation-runs/constraints-dev-001
npm run validate:constraints -- --config configs/validation-constraints.json --output simulation-runs/constraints-001
python3 tests/verify-constraints.py simulation-runs/constraints-001
npm run investigate -- --config configs/investigation-constraints-model.json --output simulation-runs/constraints-directory-001
python3 tests/verify-investigation.py simulation-runs/constraints-directory-001
node tests/constraint-browser.mjs
python3 tests/verify-investigation.py simulation-runs/ci-constraints-browser
```

Output directories must be fresh. `report.html` includes split-level and case-level outcomes, all paired transitions, costs and trace samples. `validation.json` and CSVs retain every trial and comparison. A manifest fingerprints sources, fixtures and payloads. The independent Python verifier checks full matrix coverage, classifications, paired deltas, CSVs, charged detail evidence and frozen hashes. Source freeze hashes are verified without rewriting the original V4 references; V4's old registry/config bytes are checked after removing only additive V5 registrations.

## Evaluation protocol

Fresh fixtures and the protocol were committed before implementation in `cf648e615b10768d561d1d677e7fb6e0b176fc4d`. `constraint-freeze.json` freezes policy dependencies before inspecting evaluation outcomes. The new 20 cases have separate 10-case development and 10-case evaluation splits. Both were hand-authored by the developer; this is not a blind holdout or independently collected sample. The previous 24 broad challenges remain separately labeled regressions. Each case repeats across five seeds, six profiles, three conditions and two record orders. Repetitions are not independent participants.

Never pool abstentions with correct retrieval or omit answerable skips. Preserve regressions, unknown evidence, wrong choices and budget stops. CI also compares V4/V5 on the unchanged directory using actual browser recordings and checks every V5 browser submission gate. This milestone makes no human-effectiveness, trust or accessibility claim.
