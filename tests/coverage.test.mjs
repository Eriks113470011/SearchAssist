import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {assignments,reviewFiles} from '../dist/workspace.mjs';
import {studyCoverage,coverageCsv,balanceCsv,assignmentChecksCsv} from '../dist/coverage.mjs';
import {exportProject,parseProject} from '../dist/review-project.mjs';

const at=ms=>({wall:Date.UTC(2026,10,11)+ms,mono:ms});
const plan={prefix:'P',start:1,count:4};
function recording({participant='P001',order='ABC',setRotation=0,count=12}={}) {
  const s=study.createSession({participant,order,setRotation},at(0));
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(i*1000));study.completeTrial(s,study.taskAt(s).target,at(i*1000+500));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'Private observation'},at(i*1000+500));
  }
  return JSON.stringify(study.snapshot(s,at(count*1000)));
}
const entries=(...configs)=>reviewFiles(configs.map((config,i)=>({name:`source-${i}.json`,text:recording(config)})));

test('empty batches show planned codes as not imported without inferring participation',()=>{
  const report=studyCoverage([],plan);
  assert.equal(report.summary.plannedAssignments,4);assert.equal(report.summary.plannedCodesNotImported,4);
  assert.equal(report.summary.plannedCodesWithoutIncluded,4);assert.equal(report.summary.includedRecordings,0);
  assert.ok(report.progress.every(r=>r.status==='Not imported in this batch'&&r.matchesPlan===null));
  assert.equal(report.balance.length,18);assert.equal(report.balance.reduce((n,r)=>n+r.plannedAssignments,0),4);
});
test('18 scheduled recordings cover every order/rotation cell with matching plan counts',()=>{
  const config={prefix:'Q_',start:7,count:18};
  const e=entries(...assignments(config).map(p=>({participant:p.participant,order:p.order,setRotation:p.setRotation})));
  const report=studyCoverage(e,config);
  assert.equal(report.summary.matchingPlanIncluded,18);assert.equal(report.summary.flaggedFiles,0);
  assert.ok(report.balance.every(r=>r.plannedAssignments===1&&r.includedRecordings===1&&r.completeIncludedRecordings===1&&r.matchingPlanIncludedRecordings===1));
});
test('valid but excluded recordings are imported rather than missing',()=>{
  const report=studyCoverage(entries({}),plan,{choices:{0:false}});
  assert.equal(report.progress[0].importedFiles,1);assert.equal(report.progress[0].included,false);
  assert.equal(report.progress[0].status,'No included recording');assert.equal(report.summary.plannedCodesNotImported,3);
  assert.equal(report.summary.plannedCodesWithoutIncluded,4);
});
test('mismatches and unplanned codes are reported without changing inclusion',()=>{
  const e=entries({}, {participant:'P002',order:'ABC'}, {participant:'P003',order:'BAC',setRotation:1}, {participant:'EXTRA',order:'CBA',setRotation:2});
  const before=JSON.stringify(e),report=studyCoverage(e,plan);
  assert.equal(JSON.stringify(e),before);assert.equal(report.summary.includedRecordings,4);
  assert.equal(report.summary.matchingPlanIncluded,1);assert.equal(report.summary.mismatchedPlanIncluded,2);assert.equal(report.summary.unplannedIncluded,1);
  assert.equal(report.files[1].flags,'Order differs from plan');assert.equal(report.files[2].flags,'Rotation differs from plan');
  assert.equal(report.files[3].flags,'Code not in plan');assert.equal(report.files[3].orderMatches,null);
  assert.equal(report.progress[1].status,'Assignment mismatch');assert.equal(report.summary.plannedCodesNotImported,1);
  assert.equal(report.balance.reduce((n,r)=>n+r.includedRecordings,0),4);
  assert.equal(report.balance.reduce((n,r)=>n+r.matchingPlanIncludedRecordings,0),1);
});
test('matching is case-insensitive while participant code spelling remains exact',()=>{
  const report=studyCoverage(entries({participant:'p001'},{participant:'P1'}),plan);
  assert.equal(report.progress[0].matchesPlan,true);assert.equal(report.progress[0].importedFiles,1);
  assert.equal(report.files[1].plannedCode,false);assert.equal(report.summary.unplannedIncluded,1);
});
test('duplicate choices and conflicts follow the existing review decisions',()=>{
  const e=entries({}, {participant:'p001',order:'CBA',setRotation:2});
  let report=studyCoverage(e,plan);
  assert.equal(report.progress[0].importedFiles,2);assert.equal(report.progress[0].included,false);
  report=studyCoverage(e,plan,{choices:{0:true}});assert.equal(report.progress[0].matchesPlan,true);
  assert.match(report.files[1].flags,/Order differs.*Rotation differs/);assert.equal(report.files[1].included,false);
  report=studyCoverage(e,plan,{choices:{0:true,1:true}});assert.equal(report.progress[0].status,'Conflicting selections');
  assert.equal(report.summary.includedRecordings,0);
});
test('incomplete inclusion changes actual counts without changing plan or imported coverage',()=>{
  const e=entries({count:4});const completeOnly=studyCoverage(e,plan),withPartial=studyCoverage(e,plan,{includePartial:true});
  assert.equal(completeOnly.progress[0].status,'No included recording');assert.equal(withPartial.progress[0].status,'Included incomplete');
  assert.equal(withPartial.progress[0].includedTrials,4);assert.equal(withPartial.summary.includedComplete,0);
  assert.equal(withPartial.summary.plannedCodesImported,completeOnly.summary.plannedCodesImported);
  assert.deepEqual(withPartial.balance.map(r=>r.plannedAssignments),completeOnly.balance.map(r=>r.plannedAssignments));
  assert.equal(withPartial.balance[0].includedRecordings,1);assert.equal(withPartial.balance[0].completeIncludedRecordings,0);
});
test('invalid files do not acquire participant identities from their file names',()=>{
  const e=reviewFiles([{name:'P001.json',text:'Private invalid content'}]);const report=studyCoverage(e,plan);
  assert.equal(report.files[0].participant,'');assert.equal(report.files[0].plannedCode,null);
  assert.equal(report.summary.invalidFiles,1);assert.equal(report.summary.plannedCodesImported,0);
  assert.equal(report.summary.plannedCodesNotImported,4);assert.equal(report.files[0].flags,'Invalid recording');
});
test('coverage recomputes when the generated plan changes and ignores timing-only filters',()=>{
  const e=entries({participant:'P019',order:'ABC',setRotation:0});
  assert.equal(studyCoverage(e,plan).summary.unplannedIncluded,1);
  const config={prefix:'P',start:19,count:18};const report=studyCoverage(e,config);
  assert.equal(report.summary.matchingPlanIncluded,1);
  assert.deepEqual(studyCoverage(e,config,{excludeInterrupted:true,pairedSuccessfulOnly:false}),report);
});
test('coverage survives workspace version-2 round-trips without storing derived reports',()=>{
  const e=entries({}, {participant:'P002',order:'ACB'}),options={includePartial:false,excludeInterrupted:false,pairedSuccessfulOnly:true,choices:{1:false}};
  const data=exportProject({entries:e,planConfig:plan,options,notes:{0:'Keep this'}},'2026-11-11T12:00:00Z');
  const restored=parseProject(data);assert.equal(JSON.parse(data).projectVersion,2);
  assert.deepEqual(studyCoverage(restored.entries,restored.planConfig,restored.options),studyCoverage(e,plan,options));
  assert.ok(!data.includes('coverage-v1'));
});
test('coverage CSVs retain plan context and decisions without raw queries or notes',()=>{
  const e=entries({});e[0].name='=formula.json';
  const progress=coverageCsv(e,plan),balance=balanceCsv(e,plan),checks=assignmentChecksCsv(e,plan);
  assert.equal(progress.split('\r\n').length,5);assert.equal(balance.split('\r\n').length,19);assert.equal(checks.split('\r\n').length,2);
  for(const output of [progress,balance,checks]) {assert.match(output,/"reportVersion","planPrefix","planStart","planCount","includePartial"/);assert.ok(!output.includes('calender'));assert.ok(!output.includes('Private observation'));}
  assert.ok(checks.includes('"\'=formula.json"'));assert.throws(()=>assignmentChecksCsv([],plan),/Import/);
});
