# SearchAssist 1.5 — recover plausible candidates before skipping

Default volunteer policy V4 reads details of plausible candidates before abandoning weak summaries, derives bounded identity cues from attended titles, and prioritizes topical prompt/attended-title rewrites. The original topical eligibility gate, acceptance thresholds and budgets are preserved. A's exact engine and B/C's shared approximate engine are unchanged.

Both earlier policies remain available. V3 is checked against frozen V1.4 full-session hashes; V2 retains its V1.3 reference checks. Investigations explicitly select a reference/candidate pair and add a per-condition skip breakdown. Adapters expose titles only after attendance, with revised adapter version labels.

The original four lost successes are regression cases. Full profile/seed runs, unrelated and absent-answer cases, tagged browser recording checks and paired controls assess tradeoffs without forcing a particular accuracy or skip rate. Results remain synthetic and uncalibrated. See docs/RECOVERY-POLICY-v1.5.md for rerun commands, exact rules, version compatibility and limits.
