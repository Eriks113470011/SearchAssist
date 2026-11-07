# SearchAssist research foundation

SearchAssist investigates transparent, forgiving search in a controlled directory. This first version implements the abstract’s three-condition comparison and uses the supplied survey as the initial formative research, replacing the abstract’s proposed interviews. Surveys and interviews should not be described as interchangeable evidence: the survey supplies self-reported experiences and preferences, with no follow-up probing.

## Source and sample

The source workbook is **Search Behavior, Failures, and Result Transparency (Responses).xlsx**, sheet **Form Responses 1**. It contains 26 timestamped response rows and 53 columns. Responses span October 1–15, 2026. All 26 selected Yes to the combined adult eligibility and consent item. This is a convenience sample; the workbook does not establish demographic representativeness or recruitment-channel composition.

All rows are retained. There has been no formal response-quality exclusion, verification that responses describe genuine search failures, or duplicate-participant screening. The results below describe this submitted sample only. An affirmative survey consent response is not consent for a subsequent usability study.

## Findings and decisions

| Evidence | Count | First design response |
| --- | ---: | --- |
| Irrelevant results selected among top frustrations | 15/26 (57.7%) | Prioritize literal matches, show field evidence, distinguish approximation |
| Only part of the name known, selected among top frustrations | 12/26 (46.2%) | Prefix and partial-word recovery |
| No results returned, selected among top frustrations | 11/26 (42.3%) | Useful empty state and explicit approximate matches |
| Editable suggestion before correction | 15/26 (57.7%) | Editable correction plus Apply and Undo |
| Correct but provide Undo | 14/26 (53.8%) | Undo after user-applied corrections; default does not change the query automatically |
| Highlight matching text | 16/26 (61.5%) | Underlined text with a background highlight |
| Identify whether title, category, or description matched | 14/26 (53.8%) | Field-specific explanation; tags are also disclosed when relevant |
| Short sentence explanation | 13/26 (50.0%) | One short explanation per result by default |
| Short label explanation | 8/26 (30.8%) | Compact match type labels |
| Explanation only on request | 7/26 (26.9%) | Expandable explanation setting |
| Explanation in tooltip or info icon | 6/26 (23.1%) | Interpreted alongside on-request preference; not implemented as hover-only content |
| Approximate results separately | 12/26 (46.2%) | Separate approximate section |
| Approximate results only when requested | 8/26 (30.8%) | Request-only setting |
| Closest matches when no strong result exists | 14/26 (53.8%) | Bounded approximate recovery |
| Related terms when no strong result exists | 14/26 (53.8%) | Explicit curated relationships |
| Smartphone usage | 24/26 (92.3%) | Responsive layout |
| Laptop usage | 21/26 (80.8%) | Keyboard access and desktop layout |

These questions often permit multiple selections, so percentages do not add to 100. The sample is too small and uncontrolled to justify causal or population-wide conclusions. Preferences conflict: 3 respondents rejected the calendar misspelling example, 2 rejected NYC expansion, 4 rejected the laptop synonym example, and one chose no approximate results. Control settings reflect that variation.

The synonym item yielded 9 requiring explicit application-defined synonyms, 6 saying Yes, 5 depending on the application, 4 saying No, and 2 unsure. The relationship-method question also varies: only 5 chose explicitly stored aliases/synonyms. Choosing a curated dictionary is a prototype design decision that supports inspection and reproducibility, not a claimed majority preference for that implementation.

## Data cleaning

- The label `I only knew part of the nam` is treated as the incomplete-name option; presentation corrects the truncation without changing the count.
- A `Search problem` value occurs once in the changing-word-order frequency item (Excel column U) and once in the incorrect-correction frequency item (Y). They are excluded from their item-level distributions, leaving valid n = 25 each. Their response rows remain in other analyses.
- One malformed top-frustrations option is excluded as an option. Its response row remains in the overall denominator of 26.
- Multi-select option text can itself contain commas. The analysis counts known, full option strings rather than naively splitting every comma. This is essential for the field-match explanation option.
- Open comments inform qualitative design interpretation; they have not undergone formal thematic coding. No raw comments or respondent timestamps are embedded in the app.

The aggregate JSON includes the input workbook’s SHA-256 fingerprint for reproducibility. It contains no respondent-level records. Raw sources remain separate.

## Changes to the abstract’s method

The formative phase is completed as an exploratory survey, followed by a working prototype. The proposed within-subject evaluation is prepared but has not been conducted. Confidence, trust, and ease ratings are implemented as three custom seven-point questions; they are not a validated usability scale. Think-aloud observations require facilitator notes and a consistent protocol. Explanation comprehension still needs a dedicated measure.

Expected contributions remain hypotheses until participant results are collected and analyzed. Do not report that SearchAssist has improved speed, trust, or usability based on the survey or developer QA alone.
