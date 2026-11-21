import {csv} from '../dist/study.mjs';
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const median=a=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const origin={dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model'};
export function trialRows(run) {
  return run.sessions.flatMap(s=>s.trials.map(t=>({...origin,participant:s.participant,profile:s.profile,replicate:s.replicate,order:s.order,setRotation:s.setRotation,
    taskIndex:t.taskIndex,condition:t.condition,taskSet:t.taskSet,taskType:t.taskType,success:t.success,incorrectSelection:t.incorrectSelection,skipped:t.skipped,termination:t.termination,
    modeledActiveMs:t.modeledActiveMs,observedBrowserActiveMs:null,observedBrowserWallMs:null,manualRewrites:t.manualRewrites,modeledQueryChanges:t.modeledQueryChanges,suggestionsApplied:t.suggestionsApplied,suggestionsUndone:t.suggestionsUndone,explanationsRead:t.explanationsRead,resultOpens:t.resultOpens,incorrectResultOpens:t.incorrectResultOpens,actions:t.actions,initialQuery:t.initialQuery,finalQuery:t.finalQuery})));
}
function summarize(trials,sessions) {
  const timed=trials.map(t=>t.modeledActiveMs);
  return {simulatedSessions:sessions,trials:trials.length,successes:trials.filter(t=>t.success).length,incorrectSelections:trials.filter(t=>t.incorrectSelection).length,
    skips:trials.filter(t=>t.skipped).length,timeBudgetStops:trials.filter(t=>t.termination==='time-budget').length,actionBudgetStops:trials.filter(t=>t.termination==='action-budget').length,
    meanModeledActiveMs:mean(timed),medianModeledActiveMs:median(timed),meanSuccessfulModeledActiveMs:mean(trials.filter(t=>t.success).map(t=>t.modeledActiveMs)),
    manualRewrites:trials.reduce((n,t)=>n+t.manualRewrites,0),modeledQueryChanges:trials.reduce((n,t)=>n+t.modeledQueryChanges,0),suggestionsApplied:trials.reduce((n,t)=>n+t.suggestionsApplied,0),suggestionsUndone:trials.reduce((n,t)=>n+t.suggestionsUndone,0),explanationsRead:trials.reduce((n,t)=>n+t.explanationsRead,0),resultOpens:trials.reduce((n,t)=>n+t.resultOpens,0),incorrectResultOpens:trials.reduce((n,t)=>n+t.incorrectResultOpens,0)};
}
export function summarizeRun(run) {
  const conditions=['A','B','C'].map(condition=>({...origin,condition,...summarize(run.sessions.flatMap(s=>s.trials.filter(t=>t.condition===condition)),run.sessions.length)}));
  const profiles=run.config.profiles.flatMap(profile=>['A','B','C'].map(condition=>{const s=run.sessions.filter(s=>s.profile===profile);return {...origin,profile,condition,...summarize(s.flatMap(s=>s.trials.filter(t=>t.condition===condition)),s.length)};}));
  const coverage=run.config.profiles.flatMap(profile=>Array.from({length:18},(_,slot)=>{
    const orders=['ABC','ACB','BAC','BCA','CAB','CBA'],order=orders[slot%6],setRotation=Math.floor(slot/6);
    return {...origin,profile,order,setRotation,expectedSessions:run.config.replicates,actualSessions:run.sessions.filter(s=>s.profile===profile&&s.order===order&&s.setRotation===setRotation).length};
  }));
  return {dataOrigin:'synthetic',calibrationStatus:'uncalibrated',simulatedSessions:run.sessions.length,totalTrials:run.sessions.reduce((n,s)=>n+s.trials.length,0),humanRatings:null,conditions,profiles,coverage};
}
const toCsv=rows=>csv(rows,Object.keys(rows[0]));
export function renderSimulationReport(run) {
  const summary=summarizeRun(run),fmt=n=>n===null?'Unavailable':n.toFixed(1);
  const table=(caption,headers,rows)=>`<div class="scroll" role="region" tabindex="0" aria-label="${esc(caption)}"><table><caption>${esc(caption)}</caption><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<${i?'td':'th scope="row"'}>${esc(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const rows=items=>items.map(r=>[r.profile?`${r.profile} / ${r.condition}`:r.condition,r.trials,`${r.successes} / ${r.trials}`,r.incorrectSelections,r.skips,fmt(r.meanModeledActiveMs),fmt(r.meanSuccessfulModeledActiveMs)]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>SIMULATED / UNCALIBRATED — SearchAssist</title><style>
*{box-sizing:border-box}body{margin:0;background:#f0f4ed;color:#203b36;font:15px/1.6 Arial,sans-serif}main{max-width:1100px;margin:30px auto;padding:30px;background:white;border:1px solid #d8e1d7;border-radius:8px}.badge{background:#fff0cf;color:#604300;padding:10px;font-weight:bold;letter-spacing:1px}h1{font-size:30px;line-height:1.2}.meta{font-size:12px;overflow-wrap:anywhere}.scroll{overflow-x:auto;max-width:100%;margin:24px 0}.scroll:focus-visible{outline:3px solid #197d68}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:9px;border:1px solid #d8e1d7;text-align:left}thead th{background:#edf3ed}tbody th{font-weight:normal}caption{text-align:left;font-weight:bold;font-size:16px;padding-bottom:10px}section+section{margin-top:35px;border-top:1px solid #d8e1d7;padding-top:25px}@media(max-width:650px){main{margin:12px;padding:18px}table{min-width:760px}h1{font-size:25px}}@page{size:letter;margin:14mm}@media print{body{background:white;font-size:10pt}main{border:0;margin:0;padding:0}.scroll{overflow:visible}table{font-size:8pt}th,td{padding:6px}tr{break-inside:avoid}section+section{break-before:page;border:0;margin:0;padding:0}}
</style></head><body><main><section><div class="badge">SIMULATED / UNCALIBRATED</div><h1>SearchAssist behavior-model run</h1><p>${summary.simulatedSessions} simulated sessions · ${summary.totalTrials} tasks · seed ${run.config.masterSeed}</p><p>These are software scenarios under declared assumptions, not observations of volunteers. They do not validate human effectiveness, trust, ease, comprehension, or accessibility. Human ratings are unavailable.</p><p class="meta">Model: ${esc(run.modelVersion)} · Adapter: ${esc(run.adapterVersion)} · RNG: ${esc(run.rngVersion)} · Timing: ${esc(run.timingVersion)}. Full resolved parameters and source fingerprints are in config.json and manifest.json.</p>
${table('Condition outcomes under model assumptions',['Condition','Tasks','Correct','Wrong','Skipped / stopped','Mean modeled active ms','Mean successful modeled ms'],rows(summary.conditions))}
<p>Active costs sum reading, decisions, typing, clicks, and hypothetical system waits. All-task means include failed, skipped and budget-stopped work; they are not time-to-success estimates. Successful-only means use different subsets. Browser measurements are unavailable: this fast runner does not operate the real DOM or measure people.</p><p>Task sets are matched by type, not validated difficulty. B/C share the matching engine. Extra reading can help, tie, or hurt the model; no condition is given a success bonus. There are no inferential tests or winner labels.</p></section><section><h2>Behavior scenarios and coverage</h2>
${table('Each profile and condition',['Profile / condition','Tasks','Correct','Wrong','Skipped / stopped','Mean modeled active ms','Mean successful modeled ms'],rows(summary.profiles))}
<p>Coverage: ${summary.coverage.filter(c=>c.actualSessions===c.expectedSessions).length} / ${summary.coverage.length} profile × order × rotation cells have their expected number of sessions. See coverage.csv for every cell. Skips include voluntary skips and action/time-budget stops; trials.csv distinguishes them. No failed scenario is removed from the denominators.</p><p>The six templates are hypothetical behavior settings, not population groups or validated psychological types. Reading and motor costs, recognition noise, vocabulary and stopping rules require empirical calibration. Reproduce the run with config.json; inspect session traces and operator ledgers before interpreting a result.</p></section></main></body></html>`;
}
export function simulationPayloads(run) {
  const summary=summarizeRun(run),files=new Map();
  files.set('config.json',JSON.stringify(run.config,null,2)+'\n');
  const {sessions,...metadata}=run;
  files.set('run.json',JSON.stringify({...metadata,summary,sessionFiles:sessions.map(s=>`sessions/${s.participant}.simulation.json`)},null,2)+'\n');
  files.set('trials.csv',toCsv(trialRows(run)));files.set('conditions.csv',toCsv(summary.conditions));files.set('profiles.csv',toCsv(summary.profiles));files.set('coverage.csv',toCsv(summary.coverage));
  files.set('report.html',renderSimulationReport(run));
  files.set('readme.txt','SIMULATED / UNCALIBRATED\nThese are synthetic model runs, not volunteer observations. Do not import them into a participant study or pool them with human data. The normal importer rejects these formats.\nOpen report.html offline. Reproduce with config.json; inspect manifest.json source fingerprints, session action traces and operator costs. Human confidence/trust/ease ratings and browser timing are unavailable.\nModeled times use milliseconds. The fast adapter approximates public interface behavior without running its DOM, timers, or human perception. Profiles and all numeric parameters are uncalibrated engineering hypotheses.\n');
  for(const session of sessions)files.set(`sessions/${session.participant}.simulation.json`,JSON.stringify(session,null,2)+'\n');
  return files;
}
