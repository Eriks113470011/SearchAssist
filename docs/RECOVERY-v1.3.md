# SearchAssist interruption and recovery scenarios

V1.3 adds scheduled interruptions to the browser runner and strict restore support for synthetic browser recordings. A successful run verifies preserved query/undo state, completed trials, unavailable human ratings, synthetic provenance, explicit resumption and inactive-time exclusion. These are software recovery checks, not calibrated predictions of how volunteers recover from interruptions.

## Run on your Mac

Use Node.js 22+, install dependencies and Chromium as described in the browser-runner guide, then run:

```bash
npm run simulate:browser -- --config configs/simulator-recovery-smoke.json --output simulation-runs/recovery-001
open simulation-runs/recovery-001/report.html
```

This opens headed Chromium and runs 3 sessions / 36 tasks / 15 scheduled interruptions. It covers three requested assignment cells; it is not a fully balanced study. The full configuration covers all 18 assignment cells for one profile:

```bash
npm run simulate:browser -- --config configs/simulator-recovery-full.json --output simulation-runs/recovery-full-001
```

Expect 18 sessions / 216 tasks / 90 interruptions. The existing browser smoke and six-profile configurations remain available without interruptions. Each output name must be new. Keep the test window available and let the runner control it; unexpected user pauses, navigation, hiding or closing can invalidate the recording checks and fail the run.

Native hidden-tab testing requires a headed Chromium browser and a display. On Linux CI, use Xvfb:

```bash
xvfb-run -a npm run test:recovery-browser
```

There is no additional npm dependency or paid service. The runner continues using an isolated app on an ephemeral loopback server, fresh contexts, tagged exports and blocked external requests. It does not attach to a personal browser profile.

## Configure interruptions

Add an `interruptions` array inside the browser configuration:

```json
{
  "runner": "browser",
  "profiles": ["careful-scanner"],
  "browser": {
    "assignmentSlots": [0],
    "headed": true,
    "pacing": "none",
    "interruptions": [
      {"taskIndex": 1, "afterAction": 1, "kind": "manual", "holdMs": 300},
      {"taskIndex": 2, "afterAction": 1, "kind": "navigation", "holdMs": 300},
      {"taskIndex": 5, "afterAction": 0, "kind": "reload", "holdMs": 300},
      {"taskIndex": 6, "afterAction": 1, "kind": "restore", "holdMs": 300},
      {"taskIndex": 9, "afterAction": 0, "kind": "hidden", "holdMs": 300}
    ]
  }
}
```

`taskIndex` is 1–12 within each session. `afterAction: 0` means after acquiring the public task prompt, before the first search action. Positive values count completed search-policy actions; pause/recovery controls and task acquisition do not consume this counter. An action that submits or skips ends the trial, so an interruption scheduled after that terminal action is unreachable and fails the run. Choose an early action point or another task; required scenarios are never silently omitted.

At most 12 interruptions are permitted per session, one per task/action point. `afterAction` must be below the configured maximum action count. `holdMs` is an integer 200–5,000 ms. Unknown kinds/fields and duplicate points are rejected. The same schedule applies to every selected profile, replicate and assignment. Existing per-trial action/rewrite/modeled-time limits, run wall-time deadline and output bounds still apply. Use fresh output names for comparisons.

| Kind | Browser sequence |
| --- | --- |
| `manual` | Close details if needed, choose Pause, hold, then explicitly Resume. |
| `navigation` | Close details if needed, navigate to Research, verify the navigation pause, hold, return to Study and Resume. |
| `hidden` | Activate a temporary blank tab, observe the app becoming hidden and paused, hold, reactivate the app and Resume. |
| `reload` | Reload the running page, validate the restored synthetic recording, verify it remains paused, hold and Resume. |
| `restore` | Close details if needed, pause and export a tagged checkpoint, hold, clear only the current synthetic session, import that checkpoint and Resume. |

The Pause and navigation controls cannot be clicked through a modal dialog. The controller uses the real close button before those controls and records whether that was necessary. Reload and native hiding exercise the app's own pause/recovery handling. No forced click, synthetic visibility event, or patched production clock is used.

Playwright normally enables focus emulation. Runs containing hidden-tab scenarios launch a fresh owned Chromium process/profile for each assignment and connect with the public `connectOverCDP({noDefaults: true})` option, which leaves focus emulation disabled. The controller opens an actual sibling tab using the page’s normal window-opening API, verifies that both tabs share a native browser window, and observes native document visibility. It activates the original tab again and verifies visibility before explicitly resuming. The debugging endpoint binds only to loopback and is discovered from this newly created profile; no existing browser endpoint or personal profile is accepted. Actual Browser.downloadWillBegin/downloadProgress events identify completed GUID files in the owned temporary download directory (the noDefaults context leaves Playwright's download override off), and the process/profile are closed and removed after the assignment or failure. The known static app has no service workers or prior browser state in that fresh profile. Other runs retain V1.2's isolated-context launcher. Unsupported native transitions fail with a diagnostic; headless configurations containing `hidden` are rejected.

References for the automation mechanisms: [Playwright pages](https://playwright.dev/docs/pages), [bringToFront](https://playwright.dev/docs/api/class-page#page-bring-to-front), [headed CI/Xvfb](https://playwright.dev/docs/ci#running-headed), and [CDP connection and noDefaults](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp).

## What is checked

A separate evaluator reads only this isolated session's synthetic storage checkpoint and downloaded JSON. It never passes the checkpoint, private targets, IDs, outcomes or trial history to the search policy. The policy still receives public DOM observations and attended text.

For each interruption, the evaluator checks assignment and task index, the current query and correction undo value, previously completed trial bytes, synthetic tags and absent human ratings. It verifies the paused state, expected pause reason, one pause/resume increment and the expected reload/import recovery event. Active time must remain exactly constant between the paused checkpoints while wall time includes the measured idle hold, with a small scheduling/clock tolerance. The app must remain paused until the actual Resume control is clicked.

The app also rechecks native visibility in its existing one-second autosave loop. This pauses a running task if a browser exposes hidden state without delivering a visibility-change event. Detection can be delayed by the autosave interval or browser timer throttling; these checks exclude idle time after the observed pause, rather than claiming the exact instant a tab was hidden.

Final recording reconciliation checks the full query-change sequence, selections, result opens, task starts/completions, pause/resume reasons/counts and restore flags. Unexpected pauses, missing injections, state changes, timing failures or browser errors abort the run; they do not become ordinary task skips.

The candidate observation epoch is refreshed after recovery because the app rebuilds the visible result list and closes dialogs. This clears candidate memory and stale handles while retaining the trial's attempted-query history. Additional scanning/opening can increase modeled search costs or change bounded decisions. That reorientation rule is an engineering hypothesis, not empirical evidence of human memory or interruption costs.

## Timing and output

Modeled reading/typing/decision/click costs remain separate from real recorded automation active/wall time. Controlled idle holds are observed wall time and excluded from the app's active time. Recovery-control clicks, validation/export work and driver overhead are observed automation activity where the app clock is running; they are not silently added to the modeled search-action ledger. No human confidence/trust/ease responses are generated.

The HTML report adds an interruption/recovery section when scenarios were requested. `interruptions.csv` contains one row per injection, including its ID, participant/profile/assignment, task/action point, requested and observed idle duration, query/undo values, completed-trial counts, active/wall checkpoints, pause/resume counters, restore events, modal-close evidence and visibility observations. A run without scenarios gets an explicit header-only CSV.

Each trial's `interruptions` array contains the same evidence. Trial CSVs include interruption, pause/resume and restore counts; condition/profile summaries retain interrupted trials rather than dropping failures or changing denominators. The raw tagged app recording remains inside its synthetic session envelope. The manifest fingerprints source/configuration/payloads and records `browser-recovery-v1` plus `recorded-browser-actions-v2` and `guided-dom-v2`. The search policy and modeled operator versions remain unchanged from V1.2; the schedule and recovery behavior have their own identity.

Human study imports continue rejecting synthetic files. Simulation mode accepts only its exact tagged browser-recording format with supported recording schema/protocol, empty human ratings/drafts and validated task/clock/event data. Its restore path sanitizes unknown fields while preserving provenance. It cannot restore ordinary participant recordings. Reload and JSON import restore synthetic tasks paused. Complete sessions and between-block states also restore without adding ratings. The human recording schema, required rating form, validator and timing definition remain compatible with existing recordings; no ordinary workspace format migration is needed.

## Validation and remaining work

```bash
npm run check
npm test
npm run test:browser
npm run test:simulator-browser
xvfb-run -a npm run test:recovery-browser
python3 tests/verify-simulation.py simulation-runs/ci-recovery-full
python3 tests/verify-simulation.py simulation-runs/ci-recovery-profiles
```

On macOS, run `npm run test:recovery-browser` directly. The recovery suite tests all 18 order/rotation assignments for one profile, plus every profile on one assignment: 24 sessions / 288 tasks / 120 scheduled interruptions. Additional UI checks cover correction undo after reload, modal recovery, strict invalid/human import rejection, normal-recording storage isolation, unreachable schedules and desktop/mobile/print reports. Existing full baseline browser regressions remain separate.

These tests use real waits to test inactive-time exclusion; they do not validate human behavior. Abrupt process kills, cross-device transfer, storage quota failures, long-term fatigue/learning, injected network failures and empirical calibration against held-out participant observations remain later work. Browser-run failures retain a tagged failure diagnostic and no successful manifest; use a fresh run name when retrying.
