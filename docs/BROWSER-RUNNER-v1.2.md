# SearchAssist browser participant runner

V1.2 connects the seeded behavior policies to the actual guided SearchAssist interface. Playwright operates a shipped local copy of the app in Chromium, then downloads and verifies each synthetic app recording. The fast Node model remains available through `npm run simulate`.

All sessions remain **SIMULATED / UNCALIBRATED**. Recorded browser time measures automation, not human performance. The runner does not infer confidence, trust or ease.

## Run the browser baseline

From the repository root, use Node.js 22 or later and install the pinned development dependency and Chromium:

```bash
npm install
npx playwright install chromium
npm run simulate:browser -- --config configs/simulator-browser-smoke.json --output simulation-runs/browser-001
open simulation-runs/browser-001/report.html
```

The `open` command is for macOS; elsewhere open the HTML file using a browser. The smoke configuration runs one careful-scanner profile through all 18 order/rotation assignments: 18 sessions and 216 tasks. The six-profile configuration runs 108 sessions and 1,296 tasks:

```bash
npm run simulate:browser -- --config configs/simulator-browser-profiles.json --output simulation-runs/browser-profiles-001
```

Progress is printed to stderr and a final JSON status to stdout. A successful status includes `recordingVerified: true`. Choose a new output name for every run; existing files are never overwritten. Output remains limited to a new `simulation-runs/<safe-name>` directory and 64 MB, with the final manifest written last.

To watch the accelerated smoke run, append `--headed`. The runner starts its own Chromium process and a new context per assignment. It does not attach to an existing Chrome tab or use your personal browser profile. If an installed Chromium is needed instead of Playwright's downloaded build, set `SEARCHASSIST_CHROMIUM_PATH` to its executable path. The actual browser version is recorded; using a different binary can change automation behavior and timing.

## Pacing and small demonstrations

| Pacing | Execution | Meaning of recorded browser time |
| --- | --- | --- |
| `none` (default) | Operates controls as soon as they are available. Reading is an explicit policy action; the process does not wait the modeled reading duration. | Browser/driver execution and real app timing for accelerated automation. |
| `modeled` | Waits each sampled operator cost before the corresponding action. | Assumed waits plus browser/driver overhead, still not a measurement of people. |

The visible paced demo runs one 12-task session and may take several minutes:

```bash
npm run simulate:browser -- --config configs/simulator-browser-demo.json --output simulation-runs/browser-demo-001
```

Keep the demo tab visible. The app retains its real hidden-tab and navigation pause behavior; an unexpected pause causes the runner to fail rather than quietly resume or manipulate the clock. No production timers, `performance.now`, or wall clocks are patched.

Override pacing without changing a config using `--pacing none` or `--pacing modeled`. Common `--seed` and `--profile` options work as in the fast CLI. Standalone `--help` lists the browser command. There is no arbitrary target URL, existing-browser connection, user-data-directory, or automation API-key setting.

Browser configuration adds a `browser` object:

```json
{
  "runner": "browser",
  "masterSeed": 42,
  "profiles": ["careful-scanner"],
  "browser": {
    "assignmentSlots": [0, 7, 14],
    "pacing": "none",
    "headed": false,
    "actionTimeoutMs": 10000,
    "maxRunWallMs": 600000
  }
}
```

Assignment slots are unique integers 0–17. Slot `i` uses order `orders[i % 6]` and rotation `floor(i / 6)`, exactly as the fast runner. Omit the list to request every slot. A reduced list is partial engineering coverage; the HTML counts only requested cells, while coverage.csv lists all 18 cells per profile with zero expected sessions for omitted cells. Session IDs restart for each run; seed keys use the assignment slot, not the generated session ID, so selecting fewer slots does not change the retained sessions' policy randomness.

`actionTimeoutMs` is 1,000–60,000 ms; `maxRunWallMs` is 1,000–3,600,000 ms (default 10 minutes; the supplied full six-profile configuration allows 15 minutes). Long paced runs need a small assignment list and an appropriate wall limit. Per-trial modeled-time, action and rewrite limits and all profile/timing overrides retain the documented fast-runner bounds. A modeled budget stop uses the public Skip task control to complete the recorded trial. Any required modal close/skip cleanup is explicitly identified in the trace; its real overhead is observed rather than added to the modeled policy ledger.

## Observation and action boundary

The DOM adapter observes the public task prompt, current query, visible result positions, grouping and available controls. Candidates use temporary opaque handles; the policy receives text only when it chooses to inspect it. It cannot read storage, the engine, answer keys, private result IDs, app state or evaluator outcomes. The existing seeded policy and text helpers make decisions.

Supported actions read cards, explanations and open details; open/close details; replace a query; read/apply/undo corrections; request more results; submit through the real dialog; and skip. Query replacements use the public input plus Enter, which flushes the app's editing episode before another rewrite. The runner does not claim to model physical keystroke trajectories, geometry-based pointing, visual attention, assistive technology or natural human comprehension.

Opening and reading details are separate actions in V1.2. This permits the DOM runner to read only after the real dialog exists and to check the modeled budget before the read. The model version is `bounded-search-policies-v2`; the fast adapter is `guided-public-model-v2`, and the DOM adapter is `guided-dom-v1`. The fast adapter now includes C's detail explanation in its attended text. Therefore V1.1 model outputs are not numerically interchangeable with V1.2 outputs; keep their original manifests and configuration when comparing versions.

## Synthetic recording isolation

The local app is loaded with `?simulation=1`, which visibly labels the entire session and tags its recordings from creation. It saves to `searchassist-simulation-browser-v1`, separate from ordinary participant recordings. Synthetic JSON and CSV exports retain their provenance, including `runner: browser`, `dataOrigin: synthetic` and `calibrationStatus: uncalibrated`.

After each block, a synthetic-only button continues without collecting or inventing ratings. Raw browser recordings have `ratings: []` and `humanRatings: null`; ordinary participant sessions retain their required rating form. Simulation mode has no participant import panel or ordinary condition-summary CSV export. The normal app's recording/review/workspace import validation continues to reject synthetic formats and tags.

Simulation reload recovery is deliberately not implemented in this milestone. A reload starts a new simulation and clears only its synthetic storage key; the visible banner says to export first. Browser fault injection and controlled pause/reload/resume scenarios are future work. Ordinary participant restoration remains unchanged.

The browser runner serves only allowlisted app assets over a temporary server bound to 127.0.0.1. It blocks requests outside that exact origin, blocks service workers, uses fresh isolated contexts, and closes the server and browser when finished or failed. Blocked external origins are listed in each session. The app's optional Google Fonts request is blocked too, so local fallback fonts are used; this is not a test of remote font loading. It never serves repository files or previously generated outputs. Human authentication/session data are not loaded into this browser.

## Outputs and checks

Open report.html for modeled outcomes and a separate table of recorded browser automation active/wall time. Do not subtract these values to infer human cognition or compare accelerated automation speed with volunteer task time. Model costs can repeat exactly for fixed source/configuration/runtime; browser timings, dates and environment metadata naturally vary.

The usual synthetic run files remain: config.json, run.json, trials/conditions/profiles/coverage CSVs, report.html, readme.txt, manifest.json and simulation session files. Browser session envelopes also contain `browserRecording`, the tagged JSON downloaded from the app after all 12 policy decisions. No ordinary untagged participant recording is exported as a separate payload. The manifest records source/payload SHA-256, runtime, actual browser version, pacing and the reconciliation definition. Hashes verify bytes, not behavioral validity or authenticity.

The evaluator reconciles assignments, final selections and queries, result opens, query-change sequences, suggestion apply/undo counts, task starts/completions, absence of pauses/restores, and observed timing. Correctness is checked only after decisions. A mismatch, page error, unexpected pause, browser failure or run timeout aborts the run; it is never counted as an ordinary participant skip. When browser execution fails, the CLI exits nonzero and writes a distinctly tagged failure.json with completed-session count, assignment/task context when available, and the failure reason. That directory is not a successful report and has no completed manifest; retry using a fresh name. Do not pool partial or failed runs with successful ones.

Validation commands:

```bash
npm run check
npm test
npm run test:browser
npm run test:simulator-browser
python3 tests/verify-simulation.py simulation-runs/ci-browser-profiles
```

The browser-runner suite uses a fresh output name and therefore should run in a fresh checkout or with its previous artifacts moved aside. CI retains both the full synthetic outputs and UI/report screenshots plus a printable PDF. Tests cover the real controls, synthetic-versus-participant storage/export/import boundaries, all six profiles and 18 assignments, trace/cost replay, paced waiting, modeled-budget cleanup, wall-time failure and real recorder reconciliation. They test software behavior; empirical calibration and validation against held-out human data remain future work.
