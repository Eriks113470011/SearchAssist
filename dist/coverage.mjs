import {assignments, selectSessions} from './workspace.mjs';
import {orders, csv} from './study.mjs';

const code = value => value.toUpperCase();
const rotationLabel = rotation => [1,2,3].map(n=>(n+rotation-1)%3+1).join(' → ');

// Reports describe only this generated plan and imported batch; they never change inclusion.
export function studyCoverage(entries, planConfig, options = {}) {
  const plan = assignments(planConfig), planned = new Map(plan.map(p=>[code(p.participant),p]));
  const selected = selectSessions(entries, options), includedIds = new Set(selected.sessions.map(e=>e.id));
  const chosenByCode = new Map(selected.sessions.map(e=>[code(e.session.participant),e]));
  const conflicted = new Set(selected.conflicts);
  const files = entries.map(e=>{
    const s=e.session, expected=s ? planned.get(code(s.participant)) : null;
    const orderMatches=expected ? s.order===expected.order : null, rotationMatches=expected ? s.setRotation===expected.setRotation : null;
    const flags=!s ? ['Invalid recording'] : !expected ? ['Code not in plan'] : [!orderMatches?'Order differs from plan':'',!rotationMatches?'Rotation differs from plan':''].filter(Boolean);
    return {fileIndex:e.id+1,fileName:e.name,participant:s?.participant??'',recordedOrder:s?.order??'',recordedRotation:s?.setRotation??null,recordedTaskRotation:s?rotationLabel(s.setRotation):'',
      phase:s?.phase??'',trials:s?.trials.length??null,plannedCode:s?!!expected:null,plannedOrder:expected?.order??'',plannedRotation:expected?.setRotation??null,plannedTaskRotation:expected?rotationLabel(expected.setRotation):'',
      orderMatches,rotationMatches,included:includedIds.has(e.id),flags:flags.join(' | '),status:flags.length?'Check recording':'Matches plan'};
  });
  const progress = plan.map(p=>{
    const key=code(p.participant), imported=entries.filter(e=>e.session && code(e.session.participant)===key), chosen=chosenByCode.get(key), s=chosen?.session;
    const matches=s ? s.order===p.order && s.setRotation===p.setRotation : null;
    const status=!imported.length?'Not imported in this batch':conflicted.has(key)?'Conflicting selections':!s?'No included recording':!matches?'Assignment mismatch':s.phase==='complete'?'Included complete':'Included incomplete';
    return {participant:p.participant,position:p.position,plannedOrder:p.order,plannedRotation:p.setRotation,plannedTaskRotation:rotationLabel(p.setRotation),
      importedFiles:imported.length,completeImportedFiles:imported.filter(e=>e.session.phase==='complete').length,
      included:!!s,includedFile:s?chosen.name:'',includedOrder:s?.order??'',includedRotation:s?.setRotation??null,includedPhase:s?.phase??'',includedTrials:s?.trials.length??null,matchesPlan:matches,status};
  });
  const balance = orders.flatMap(order=>[0,1,2].map(rotation=>{
    const included=selected.sessions.filter(e=>e.session.order===order&&e.session.setRotation===rotation);
    return {conditionOrder:order,setRotation:rotation,taskRotation:rotationLabel(rotation),plannedAssignments:plan.filter(p=>p.order===order&&p.setRotation===rotation).length,
      includedRecordings:included.length,completeIncludedRecordings:included.filter(e=>e.session.phase==='complete').length,
      matchingPlanIncludedRecordings:included.filter(e=>{const p=planned.get(code(e.session.participant));return p?.order===order&&p?.setRotation===rotation;}).length};
  }));
  const summary={plannedAssignments:plan.length,plannedCodesImported:progress.filter(p=>p.importedFiles>0).length,plannedCodesNotImported:progress.filter(p=>p.importedFiles===0).length,
    plannedCodesWithoutIncluded:progress.filter(p=>!p.included).length,includedRecordings:selected.sessions.length,includedComplete:selected.sessions.filter(e=>e.session.phase==='complete').length,
    matchingPlanIncluded:progress.filter(p=>p.matchesPlan===true).length,mismatchedPlanIncluded:progress.filter(p=>p.matchesPlan===false).length,
    unplannedIncluded:files.filter(f=>f.included&&f.plannedCode===false).length,invalidFiles:entries.filter(e=>!e.session).length,flaggedFiles:files.filter(f=>f.flags).length};
  return {summary,progress,balance,files};
}
function reportRows(rows, planConfig, options) {
  return rows.map(row=>({reportVersion:'coverage-v1',planPrefix:planConfig.prefix,planStart:planConfig.start,planCount:planConfig.count,includePartial:!!options.includePartial,...row}));
}
function reportCsv(rows, planConfig, options) {const output=reportRows(rows,planConfig,options);return csv(output,Object.keys(output[0]));}
export function coverageCsv(entries, planConfig, options={}) {return reportCsv(studyCoverage(entries,planConfig,options).progress,planConfig,options);}
export function balanceCsv(entries, planConfig, options={}) {return reportCsv(studyCoverage(entries,planConfig,options).balance,planConfig,options);}
export function assignmentChecksCsv(entries, planConfig, options={}) {
  if(!entries.length)throw new Error('Import at least one recording before exporting assignment checks.');
  return reportCsv(studyCoverage(entries,planConfig,options).files,planConfig,options);
}
