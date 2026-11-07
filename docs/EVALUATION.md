# SearchAssist evaluation protocol

The prototype supports a formative within-subject comparison of A Exact, B Fuzzy, and C SearchAssist. Every participant uses all three. The app evaluates a search and recovery interface bundle; it cannot isolate the causal effect of explanations because C also adds grouping, highlighting, and correction controls.

## Preparation

Use an anonymous code such as P001. Explain the local recording and exports; obtain the consent and course or institutional review appropriate to your project. The in-app acknowledgement explains recording but is not a replacement for a study information sheet or any required formal approval.

Provide an unrecorded practice task using the Explore view: find Wireless Network Setup with a query of your choice. Introduce opening results, changing a query, and submitting a result. Avoid demonstrating the study answers. Decide whether to use think-aloud; keep that decision and instructions identical across conditions. If timing is a priority, use retrospective discussion instead or interpret think-aloud times accordingly.

## Assignment and tasks

Use ABC, ACB, BAC, BCA, CAB, and CBA evenly across participants. Independently balance task rotations 123, 231, and 312. An 18-cell assignment schedule covers all six orders × all three rotations once; this describes balance, not a sample-size or power recommendation. Larger or smaller recruitment requires an explicit sampling and analysis plan.

Every condition receives one task set of four trials: spelling, alias, partial wording, and reordered words. Initial queries are supplied consistently. Participants may edit the query and can submit any result or skip. Result details are synthetic and do not navigate to external sites. The app does not reveal whether a choice is correct until the session summary, although the entry contents can help participants judge relevance.

| Set | Type | Initial query | Predefined target |
| --- | --- | --- | --- |
| 1 | Spelling | calender | Calendar Settings |
| 1 | Alias | NYC | New York City |
| 1 | Partial | official trans | Official Transcript Request |
| 1 | Reordered | portal tuition | Tuition Payment Portal |
| 2 | Spelling | libary research | Library Research Database |
| 2 | Alias | DMV | Department of Motor Vehicles |
| 2 | Partial | student hous | Student Housing Application |
| 2 | Reordered | settings email | Email Account Settings |
| 3 | Spelling | scholrship | Scholarship Directory |
| 3 | Alias | MIT | Massachusetts Institute of Technology |
| 3 | Partial | intern opp | Internship Opportunities |
| 3 | Reordered | schedule examination | Examination Schedule |

These task sets are matched by type, not validated difficulty. Literal prefix containment can succeed in A for some partial queries. Titles, expected targets, and distractors differ. Pilot the tasks and assess floor/ceiling effects before making comparative claims. Revise and freeze the dataset and task definitions before recruitment; never change them mid-study without versioning and a documented reason.

## Conditions held constant

All 48 entries, all fields, all categories, and curated relationships enabled are fixed in guided trials. Category and mode controls are hidden. B and C share the exact same search engine, evidence, and score order. A bypasses approximate matching. C uses short explanations and separate approximate results; customization is available in Explore, outside the standardized trials.

## Measurements

| Measure | Operational definition |
| --- | --- |
| Task success | Submitted entry ID equals the predefined target ID |
| Incorrect final selection | A non-target entry was submitted; skips recorded separately |
| Task time | Monotonic milliseconds from rendering the supplied query to Submit or Skip |
| Query reformulations | Consecutive changes from the supplied starting query, coalesced after 300 ms idle; suggestion applications and undo included |
| Result opens | Count of opened entry dialogs; incorrect opens are distinguished from incorrect final selection |
| Confidence | Seven-point custom rating after each condition block |
| Trust | Seven-point custom rating after each block |
| Ease | Seven-point custom rating after each block; not a validated usability scale |
| Recovery actions | Event log records suggestion use, undo, and requested approximate results when available |
| Explanation use | Expansion events when on-demand explanations are used outside the fixed short-explanation study configuration |

The app saves final query state at submission even if the 300 ms edit timer has not fired. Query counts are editing episodes, not keystrokes, semantic reformulations, or an independent count of submitted searches. Single-word and multi-word queries are limited by the matching rules documented in the README. There is no task timeout.

Reloading or resuming a trial restarts its timer and sets `restarted: true`; repeated attempts stay in the event log. Review or exclude these timing values. Switching away from the tab can inflate time; the current version does not measure active-focus time. A stopped session can be exported before clearing. Partial sessions may have incomplete block ratings.

## Session workflow

1. Complete the practice task and explain recording.
2. Open Run a study, choose participant code, condition order, and rotation.
3. Start after the recording acknowledgement.
4. For each task, modify the supplied query as needed and open a result. Submit a choice or Skip.
5. Complete confidence, trust, and ease ratings after each four-task block. Add optional observations without personal information.
6. Export both the JSON session and CSV trials at completion. Store them under your study’s data-handling plan. Data are only held in the current browser tab by default.
7. Clear the tab’s session before the next participant. Label developer QA exports separately and exclude them from research.

## Analysis and reporting

Use participant-level paired comparisons, rather than treating every trial as an independent participant. Report success numerator and denominator, skips and wrong final choices separately, timing distributions, task types, condition order, task rotation, and restarted trials. Report task time for successes and failures separately where useful. Ordinal rating summaries should retain their scale definitions. Do not select only favorable tasks or exclude failures after seeing the results without a predefined rule.

Pilot first. Set a recruitment target and analysis plan before formal collection, with instructor guidance. The survey sample size does not determine the usability-study sample size. Add comprehension questions if understanding is a primary outcome, and use a validated usability instrument if that is part of the final claim. Screen-reader and mobile testing require additional observation; keyboard support alone does not establish accessibility conformance.

Report this version as a prototype with exploratory findings. Current developer checks demonstrate operation, not participant benefit.
