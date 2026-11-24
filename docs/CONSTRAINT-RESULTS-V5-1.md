# V5.1 regression results

V5.1 is a versioned repair for the singular/plural audience bug identified in local PR #16 testing. Original V5 source, freeze and results remain intact. These reused fixtures test regression behavior; they are not a new independent or blind evaluation.

| Measure | Original V5 | V5.1 |
|---|---:|---:|
| International-student-advising fixture, accepted | 0 / 90 | 90 / 90 |
| Historical sanity split, accepted | 430 / 540 | 520 / 540 |
| Historical development sanity split, accepted | 360 / 360 | 360 / 360 |
| Original directory model completions | 6,414 / 6,480 | 6,414 / 6,480 |
| All 44 challenge fixtures: correct selections | 6,480 | 6,480 |
| All 44 challenge fixtures: correct abstentions | 1,440 | 1,440 |
| All 44 challenge fixtures: wrong selections | 0 | 0 |
| All 44 challenge fixtures: answerable skips | 0 | 0 |

The historical sanity split is restored to V4's 520/540 accepted outcomes. Twenty pre-existing failures remain; this patch does not claim every historical sanity trial succeeds. V5.1 retains every sanity outcome that V4 or V5 previously accepted across five seeds, all six profiles and A/B/C. Every restored advising submission still uses qualifying evidence and a charged detail read.

The full V5/V5.1 challenge comparison has 15,840 rows and 7,920 paired trials; every paired classification is retained. Mean modeled active cost remains identical to V5 on this challenge matrix (35,641 ms). This preserves the earlier V5 tradeoff: approximately 47% higher modeled cost than V4 in the historical evaluation split and approximately 22% higher cost on the directory tasks. Those costs are hypothetical, not measured human time.

All 180 local tests passed, including prepatch V5 session replays and the original V4 references. Independent validators passed both complete challenge comparisons and the directory investigation. The CI browser job now runs the V4/V5.1 configuration and verifies app recording reconciliation plus paid qualifying evidence for each patched-policy submission. See PR #16 checks and the uploaded artifacts for the corresponding actual browser results.

The report now displays a prominent warning whenever accepted historical sanity outcomes regress, plus a case-level table. The independent verifier enforces the same behavior for V5.1; a test confirms it rejects a deliberately regressed result even when artifact hashes and structure are consistent.

[Reproduction commands and version boundaries](CONSTRAINT-POLICY-V5-1.md) · [Machine-readable results](CONSTRAINT-RESULTS-V5-1.json)
