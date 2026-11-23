# SearchAssist 1.4 — failure diagnosis and policy investigation

V1.4 adds an offline failure inspector and failures.csv to ordinary model/browser runs. Query replays, target availability, attended text and score components distinguish recorded unsuccessful outcomes while keeping evaluator targets outside policy decisions. Availability is a post-trial engine replay, not proof of browser visibility or causation.

The legacy V2 policy remains selectable and is checked against frozen V1.3 outcome/action/cost hashes. Default V3 downweights generic instruction wording, requires topical evidence before rank/noise can support selection and evaluates details independently. A's exact-search matching and B/C's shared approximate matching are preserved.

A bounded investigation command compares both policies across seeds and one-setting controls for recognition noise, typing errors and browser interruptions. Reports retain wrong answers, skips, budgets, rewrites, modeled costs and separate automation timing. Separate development/held-out synthetic fixtures include absent and ambiguous targets; these remain software checks rather than human validation.

See docs/INVESTIGATION-v1.4.md for commands, pairing definitions, configuration, artifact fingerprints and limitations. Existing recovery, recording provenance, rating isolation and app/workspace regression checks remain part of CI.
