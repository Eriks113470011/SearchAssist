import {compareConditions, selectSessions} from './workspace.mjs';
import {studyCoverage} from './coverage.mjs';
import {pairedSummary} from './paired.mjs';
import {ratingSummary, pairedRatingSummary, RATING_ITEMS, RATING_DEFINITION} from './ratings.mjs';
import {VERSION} from './study.mjs';

export const SUMMARY_FORMAT = 'searchassist-study-summary';
export const SUMMARY_VERSION = 2;
const pick = (source, keys) => Object.fromEntries(keys.map(key=>[key,source[key]]));
const coverageKeys = ['plannedAssignments','plannedCodesImported','plannedCodesNotImported','plannedCodesWithoutIncluded','includedRecordings','includedComplete','matchingPlanIncluded','mismatchedPlanIncluded','unplannedIncluded','invalidFiles','flaggedFiles'];
const conditionKeys = ['condition','contributingSessions','attempted','successes','meanParticipantSuccessRate','timedSessions','meanParticipantActiveMs'];
const pairedKeys = ['comparison','referenceCondition','comparatorCondition','selectedSessions','successParticipants','incompleteBlockSessions','meanSuccessDifferencePp','timingParticipants','timedTaskPairs','meanActiveDifferenceMs'];
const ratingKeys = ['condition','measure','includedSessions','submittedRatings','missingRatings','median',...Array.from({length:7},(_,i)=>`count${i+1}`)];
const matchedRatingKeys = ['comparison','referenceCondition','comparatorCondition','measure','includedSessions','pairedParticipants','unpairedParticipants','higher','same','lower'];
const balanceKeys = ['conditionOrder','setRotation','taskRotation','plannedAssignments','includedRecordings','completeIncludedRecordings','matchingPlanIncludedRecordings'];

// Only aggregate fields are copied. Never serialize entries, choices, plan prefixes, or notes.
export function createStudySummary(entries, planConfig, options={}, generatedAt=new Date().toISOString()) {
  if(typeof generatedAt!=='string'||generatedAt.length>64||!Number.isFinite(Date.parse(generatedAt)))throw new Error('The summary date is invalid.');
  const selected=selectSessions(entries,options),coverage=studyCoverage(entries,planConfig,options);
  const codes=new Map();
  for(const e of entries)if(e.session){const code=e.session.participant.toUpperCase();codes.set(code,(codes.get(code)??0)+1);}
  const valid=entries.filter(e=>e.session).length;
  return {format:SUMMARY_FORMAT,summaryVersion:SUMMARY_VERSION,applicationVersion:'0.8',generatedAt:new Date(generatedAt).toISOString(),scope:'Current generated plan and imported review batch',
    protocol:{recordingVersion:VERSION,recordingSchemaVersion:2,datasetVersion:'synthetic-directory-v1',protocolVersion:'controlled-tasks-v1',timingDefinition:'active-time-v2'},
    units:{successRate:'proportion from 0 to 1',successDifference:'percentage points',activeTime:'milliseconds',activeDifference:'milliseconds',rating:'ordinal scale from 1 to 7'},
    ratingScale:{definition:RATING_DEFINITION,min:1,max:7,questions:RATING_ITEMS.map(item=>pick(item,['measure','label','low','high']))},
    ratings:ratingSummary(entries,options).map(row=>pick(row,ratingKeys)),pairedRatings:pairedRatingSummary(entries,options).map(row=>pick(row,matchedRatingKeys)),
    settings:{includePartial:!!options.includePartial,excludeInterrupted:!!options.excludeInterrupted,pairedSuccessfulOnly:options.pairedSuccessfulOnly!==false},
    review:{importedFiles:entries.length,validRecordings:valid,invalidFiles:entries.length-valid,includedRecordings:selected.sessions.length,
      excludedValidRecordings:valid-selected.sessions.length,includedComplete:selected.sessions.filter(e=>e.session.phase==='complete').length,
      includedIncomplete:selected.sessions.filter(e=>e.session.phase!=='complete').length,repeatedCodeGroups:[...codes.values()].filter(n=>n>1).length,conflictingSelectionGroups:selected.conflicts.length},
    coverage:pick(coverage.summary,coverageKeys),conditions:compareConditions(entries,options).map(row=>pick(row,conditionKeys)),
    paired:pairedSummary(entries,options).map(row=>pick(row,pairedKeys)),balance:coverage.balance.map(row=>pick(row,balanceKeys))};
}
export function studySummaryJson(summary){return JSON.stringify(summary,null,2);}

const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value,digits=0)=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(digits):'Not available';
const signed = (value,scale=1,suffix='')=>typeof value==='number'&&Number.isFinite(value)?`${value>0?'+':''}${(value/scale).toFixed(2)}${suffix}`:'Not available';
const table = (caption,headers,rows,className='')=>`<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="${esc(className)}"><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<${i===0?'th scope="row"':'td'}>${esc(v)}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const bool = value=>value?'Yes':'No';
const labels={A:'A · Exact',B:'B · Fuzzy',C:'C · SearchAssist'};

export function studySummaryHtml(r) {
  const settings=table('Analysis settings',['Setting','Enabled','Effect'],[
    ['Include incomplete sessions',bool(r.settings.includePartial),'Controls the selected recording set.'],
    ['Exclude interrupted trials',bool(r.settings.excludeInterrupted),'Removes interrupted timing trials; paired timing removes the type from both sides.'],
    ['Successful-only paired timing',bool(r.settings.pairedSuccessfulOnly),'Requires correct selections in both conditions for paired timing only.']]);
  const metrics=[['Imported files',r.review.importedFiles],['Included recordings',r.review.includedRecordings],['Included complete',r.review.includedComplete],['Included incomplete',r.review.includedIncomplete],['Invalid files',r.review.invalidFiles],['Excluded valid recordings',r.review.excludedValidRecordings],['Repeated-code groups',r.review.repeatedCodeGroups],['Conflicting-selection groups',r.review.conflictingSelectionGroups]];
  const coverage=table('Plan coverage in this batch',['Measure','Count'],[
    ['Planned assignments',r.coverage.plannedAssignments],['Planned codes imported',r.coverage.plannedCodesImported],['Planned codes not imported',r.coverage.plannedCodesNotImported],['Planned codes without an included recording',r.coverage.plannedCodesWithoutIncluded],
    ['Included recordings matching plan',r.coverage.matchingPlanIncluded],['Included assignment mismatches',r.coverage.mismatchedPlanIncluded],['Included codes outside plan',r.coverage.unplannedIncluded],['Flagged imported files, including excluded copies',r.coverage.flaggedFiles]]);
  const conditions=table('Descriptive condition results',['Condition','Participants with trials','Correct / attempted','Mean participant success','Participants with timing','Mean active time'],r.conditions.map(c=>[
    labels[c.condition]??c.condition,c.contributingSessions,`${c.successes} / ${c.attempted}`,c.meanParticipantSuccessRate===null?'Not available':`${number(c.meanParticipantSuccessRate*100,2)}%`,c.timedSessions,c.meanParticipantActiveMs===null?'Not available':`${number(c.meanParticipantActiveMs/1000,2)} s`]));
  const paired=table('Within-participant differences',['Comparison','Success participants','Mean success difference','Timing participants','Matched type pairs','Mean active-time difference'],r.paired.map(p=>[
    p.comparison,p.successParticipants,signed(p.meanSuccessDifferencePp,1,' pp'),p.timingParticipants,p.timedTaskPairs,signed(p.meanActiveDifferenceMs,1000,' s')]));
  const balance=table('All 18 condition-order and task-rotation combinations',['Order','Task rotation','Planned','Included','Included complete','Included matching plan'],r.balance.map(b=>[
    b.conditionOrder,b.taskRotation.replaceAll('→','>'),b.plannedAssignments,b.includedRecordings,b.completeIncludedRecordings,b.matchingPlanIncludedRecordings]));
  const question=measure=>RATING_ITEMS.find(item=>item.measure===measure)?.label??measure;
  const ratings=table('Submitted ratings by condition and question',['Condition / question','Submitted','Missing','Median / 7','Score 1 / 2 / 3 / 4 / 5 / 6 / 7 counts'],r.ratings.map(row=>[
    `${row.condition} / ${question(row.measure)}`,row.submittedRatings,row.missingRatings,number(row.median,1),Array.from({length:7},(_,i)=>row['count'+(i+1)]).join(' / ')]),'rating-distributions');
  const matchedRatings=table('Reported rating direction within the same participants',['Comparison / question','Matched','Unpaired','Higher','Same','Lower'],r.pairedRatings.map(row=>[
    `${row.comparison} / ${question(row.measure)}`,row.pairedParticipants,row.unpairedParticipants,row.higher,row.same,row.lower]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>SearchAssist study summary</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eff4ef;color:#173b35;font:13px/1.5 Arial,Helvetica,sans-serif}.report{max-width:940px;margin:32px auto;padding:38px;background:white;border:1px solid #d6e1d8;border-radius:10px}.eyebrow{text-transform:uppercase;letter-spacing:1.6px;font-size:10px;font-weight:bold;color:#49675d}h1{font-size:34px;letter-spacing:-1px;margin:12px 0 8px}h2{font-size:24px;margin:8px 0 14px}p{margin:10px 0}.meta,.note{font-size:11px;color:#526a61}.screen-note{max-width:940px;margin:24px auto;padding:12px 20px;background:#e3eee6;border:1px solid #c6d7ca;border-radius:6px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0}.metric{border:1px solid #d7e2da;padding:13px;border-radius:5px}.metric strong{display:block;font-size:24px}.metric span{display:block;font-size:11px;margin-top:3px}.table-wrap{overflow-x:auto;margin:18px 0}.table-wrap:focus-visible{outline:2px solid #197d68;outline-offset:4px}table{border-collapse:collapse;width:100%;font-size:11px}caption{text-align:left;font-weight:bold;font-size:13px;padding:0 0 8px}th,td{padding:8px 9px;border:1px solid #d5e0d8;text-align:left;vertical-align:top;overflow-wrap:anywhere}thead th{background:#edf3ed;font-size:10px;overflow-wrap:normal}tbody th{font-weight:normal}section+section{border-top:2px solid #d5e0d8;padding-top:26px;margin-top:30px}.notice{padding:12px 15px;background:#f2f6ef;border-left:3px solid #799882}.footer{margin-top:24px;font-size:10px;color:#526a61}li{margin:5px 0}@media(max-width:640px){.report{margin:12px;padding:20px}.screen-note{margin:12px}.metrics{grid-template-columns:repeat(2,1fr)}table{min-width:620px}h1{font-size:29px}}@page{size:letter;margin:14mm}@media print{body{background:white;font-size:10pt;line-height:1.35}.screen-note{display:none}.report{max-width:none;margin:0;padding:0;border:0;border-radius:0}h1{font-size:27pt}h2{font-size:20pt}.metrics{margin:16px 0;gap:8px}.metric{padding:9px}.metric strong{font-size:19pt}.metric span,.meta,.note{font-size:8pt}.table-wrap{overflow:visible;margin:14px 0}table{min-width:0;font-size:8pt;table-layout:fixed}.rating-distributions th:first-child{width:26%}.rating-distributions th:last-child{width:38%}caption{font-size:10pt}th,td{padding:6px 7px}thead th{font-size:7pt}tr,.metric{break-inside:avoid}thead{display:table-header-group}section+section{break-before:page;border-top:0;margin-top:0;padding-top:0}.notice{padding:9px 12px}.footer{font-size:8pt}}
  </style></head><body><aside class="screen-note">Use your browser's Print command to print this report or save it as PDF. The print layout uses US Letter paper. This file works offline. Tables scroll horizontally on narrow screens.</aside><main class="report"><section>
    <div class="eyebrow">SearchAssist / Current workspace batch</div><h1>Study summary</h1><p>Exploratory, descriptive results for the current review decisions.</p><p class="meta">Generated ${esc(r.generatedAt)} · Application ${esc(r.applicationVersion)} · Summary version ${esc(r.summaryVersion)}</p>
    <div class="metrics">${metrics.map(([label,value])=>`<div class="metric"><strong>${esc(number(value))}</strong><span>${esc(label)}</span></div>`).join('')}</div>${settings}${coverage}
    <p class="note">Coverage is limited to this generated plan and imported batch. A code not imported here does not establish non-participation or dropout. Invalid files are not assigned identities from their names. Checks do not change inclusion decisions.</p>
    <p class="note">This aggregate report omits participant codes, source file names, plan prefixes, recorded queries, participant observations, and reviewer notes. Counts may still describe small groups; it is not a guarantee of anonymity.</p>
  </section><section><div class="eyebrow">SearchAssist / Outcomes</div><h2>Search conditions and paired comparisons</h2>
    ${r.review.includedRecordings===0?'<p class="notice">No recordings are included. There are no included-session results to interpret; unavailable values are shown explicitly.</p>':''}${conditions}
    <p class="note">Condition success and timing are means of participant-level condition results, with equal participant weight. Incomplete sessions can contribute different participants by condition. Timing means can include unsuccessful trials and skips; only the interruption setting affects this table.</p>${paired}
    <p class="note">B - A is Fuzzy minus Exact; C is SearchAssist. Positive success differences mean higher success in the comparison condition. Negative timing differences mean less active time. Success differences use percentage points (pp); timing differences are shown in seconds.</p>
    <p class="note">Each pair requires both four-task blocks. Paired timing matches task types within participants and uses the settings on the first page. Eligible type differences are averaged within each participant, then participant means receive equal weight. Counts and eligible type coverage can differ between comparisons. Missing values are not zero.</p>
    <ul class="note"><li>Successful-only paired timing describes the jointly successful subset, not all tasks.</li><li>Matching task type does not establish equal difficulty of the actual tasks.</li><li>These are descriptive differences, without significance tests, confidence intervals, or causal claims. B and C differ in an interface bundle; effects cannot be attributed to explanations alone.</li></ul>
  </section><section><div class="eyebrow">SearchAssist / Assignment coverage</div><h2>Condition order and task rotation</h2><p class="note">Included counts use actual recorded assignments and may include mismatches or codes outside the plan. Matching-plan counts require the planned code, order, and rotation to agree. Each included code contributes once after duplicate resolution. Counts do not determine recruitment targets, power, or statistical balance.</p>${balance}
    <p class="note">A generated plan can exceed the review's 60-file batch limit. Retain the workspace and detailed CSVs for the underlying inclusion and assignment audit. This report neither stores those identities nor replaces the original recordings.</p><p class="footer">Recording ${esc(r.protocol.recordingVersion)} / schema ${esc(r.protocol.recordingSchemaVersion)} · ${esc(r.protocol.timingDefinition)} · ${esc(r.protocol.datasetVersion)} · ${esc(r.protocol.protocolVersion)}<br>SearchAssist study summary ${esc(r.summaryVersion)} · ${esc(r.scope)}</p>
  </section><section><div class="eyebrow">SearchAssist / Post-block ratings</div><h2>Confidence, trust, and ease</h2>
    <p class="note">Separate custom ordinal questions, not a validated usability scale or a combined score. Confidence: 1 = Not at all confident, 7 = Very confident. Trust: 1 = Not at all, 7 = Very much. Ease: 1 = Very difficult, 7 = Very easy.</p>${ratings}
    <p class="note">Only submitted block ratings from included recordings count. Unfinished drafts stay missing. Timing exclusions and successful-only paired timing do not affect ratings. Condition rows can contain different participants. With an even number of responses, the median can lie between two scale points.</p>${matchedRatings}
    <p class="note">Matched counts require submitted ratings in both conditions. Unpaired counts are included recordings missing either rating. Higher, same, and lower refer to the comparison condition's rating (B - A = Fuzzy compared with Exact; C = SearchAssist). They show direction, not the size or statistical significance of a difference, or a causal benefit. Different pairs can contain different participants. Missing ratings are not zero.</p><p class="footer">${esc(r.ratingScale.definition)} · Ordinal responses 1-7 · Summary version ${esc(r.summaryVersion)}</p>
  </section></main></body></html>`;
}
export function studySummaryAssets(entries, planConfig, options={}, generatedAt=new Date().toISOString()) {
  const summary=createStudySummary(entries,planConfig,options,generatedAt);
  return {summary,json:studySummaryJson(summary),html:studySummaryHtml(summary)};
}
