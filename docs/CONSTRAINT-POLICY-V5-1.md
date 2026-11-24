# V5.1: restore singular/plural audience equivalence

V5.1 fixes a regression found in the local PR #16 reports. The earlier historical sanity fixture asks for an “international student advising office.” V5 canonicalized its eligibility requirement to “international students” but could not match singular “student” in the attended description. It abstained on all 90 repetitions, where V4 accepted all 90.

The patch treats the complete audience words `student` and `students` as equivalent, including inside qualified phrases such as `international student` and `visiting students`. Evidence snippets retain the actual attended wording. It does not conflate different audiences or accept partial words such as `studentship`. The same equivalence applies to positive evidence and negative exclusions, so “international student is ineligible” still rejects a candidate.

## Versioning and controls

Original `constraints.mjs`, `policy-v5.mjs`, `constraint-freeze.json` and all prior fixtures remain unchanged. A prepatch V5 session reference now also protects the original actions, costs, outcomes and diagnostics. The patch lives in separate `constraints-v5-1.mjs` and `policy-v5-1.mjs` modules. A source-equivalence assertion ensures the decision procedure differs only in its checker import/version name and the checker differs only in its matcher/version. Registry additions are checked by removing only those exact additions before verifying historical source hashes.

V4 remains the default. Select `"policyVersion":"v5.1"` explicitly. The engine, A/B/C interfaces, adapters, profiles, thresholds, timing and hard budgets are unchanged. `constraint-v5-1-freeze.json` fingerprints the patch's policy dependencies. The run manifest identifies the actual source commit and files; a V5.1 run does not incorrectly claim that its source is the original V5 commit.

All existing challenge fixtures, including the historical “evaluation” split, are now reused regression data for this patch. These results are not a new held-out evaluation and are not human observations. The broader lexical/scoping limitations documented for V5 still apply.

## Behavioral CI gates

The historical sanity suite runs across five seeds, all six profiles and A/B/C. V5.1 must retain every accepted outcome from V4 and V5, and the advising fixture must recover all 90 repetitions. Positive and negative singular/plural cases are tested across the five qualified audiences, including mismatched audiences, partial words, missing evidence and location conflicts. Every recovered submission must still have paid detail reading and qualifying evidence.

The independent investigation verifier also checks these behavioral outcomes, beyond structural consistency. Reports surface accepted → failed counts and case-level outcomes rather than hiding them in aggregate split totals. Frozen V5 reports deliberately continue to show their known advising failure.

## Run on a Mac

Requires Node 22+ and Python 3. From the PR #16 branch:

```sh
npm install --no-package-lock --ignore-scripts
npx playwright install chromium
npm run check
npm test

npm run validate:constraints -- --config configs/validation-constraints-v5-1.json --output simulation-runs/constraints-v5-1-mac-001
python3 tests/verify-constraints.py simulation-runs/constraints-v5-1-mac-001
open simulation-runs/constraints-v5-1-mac-001/report.html

npm run investigate -- --config configs/investigation-constraints-v5-1-model.json --output simulation-runs/constraints-v5-1-directory-mac-001
python3 tests/verify-investigation.py simulation-runs/constraints-v5-1-directory-mac-001
open simulation-runs/constraints-v5-1-directory-mac-001/report.html

node tests/constraint-browser.mjs configs/investigation-constraints-v5-1-browser.json simulation-runs/constraints-v5-1-browser-mac-001
python3 tests/verify-investigation.py simulation-runs/constraints-v5-1-browser-mac-001
open simulation-runs/constraints-v5-1-browser-mac-001/report.html
```

Each output directory must be new; increment the run suffix for another attempt. The browser test starts its own server and browser. Its directory comparison runs in the browser; the separate historical sanity fixtures still run in the model. To isolate the patch on all 44 challenge fixtures, run `validate:constraints` with `configs/validation-constraints-patch.json` (V5 versus V5.1).
