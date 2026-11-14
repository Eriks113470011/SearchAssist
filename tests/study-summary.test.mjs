import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {assignments,reviewFiles,compareConditions} from '../dist/workspace.mjs';
import {pairedSummary} from '../dist/paired.mjs';
import {studyCoverage} from '../dist/coverage.mjs';
import {exportProject,parseProject} from '../dist/review-project.mjs';
import {createStudySummary,studySummaryAssets,studySummaryHtml} from '../dist/study-summary.mjs';

const plan={prefix:'SECRET_',start:1,count:18},date='2026-11-11T12:00:00Z';
const at=ms=>({wall:Date.UTC(2026,10,11)+ms,mono:ms});
function recording({participant='SECRET_001',order='ABC',setRotation=0,count=12,fail=[],interrupt=[],duration=c=>({A:1000,B:700,C:400})[c]}={}) {
  const s=study.createSession({participant,order,setRotation},at(0));let ms=0;
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(ms));study.setQuery(s,'PRIVATE_QUERY');
    const task=study.taskAt(s),condition=s.order[Math.floor(i/4)],key=`${condition}:${task.type}`,d=duration(condition);
    if(interrupt.includes(key)){study.pauseTrial(s,'manual',at(ms+d/2));study.resumeTrial(s,at(ms+d/2+1000));ms+=1000;}
    ms+=d;study.completeTrial(s,fail.includes(key)?null:task.target,at(ms));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'PRIVATE_OBSERVATION'},at(ms));
  }
  return JSON.stringify(study.snapshot(s,at(ms)));
}
const entries=(...configs)=>reviewFiles(configs.map((config,i)=>({name:`PRIVATE_FILE_${i}.json`,text:recording(config)})));
const project=(e,options={})=>exportProject({entries:e,planConfig:plan,options,notes:{0:'PRIVATE_REVIEW_NOTE'}},date);
const pick=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));

test('empty reports preserve missing values, units, protocol, timestamp, and 18 balance cells',()=>{
  const {summary:r,json,html}=studySummaryAssets([],plan,{},date);
  assert.equal(r.format,'searchassist-study-summary');assert.equal(r.summaryVersion,2);assert.equal(r.applicationVersion,'0.8');
  assert.equal(r.generatedAt,'2026-11-11T12:00:00.000Z');assert.equal(r.protocol.recordingVersion,'0.2');
  assert.equal(r.protocol.recordingSchemaVersion,2);assert.equal(r.protocol.timingDefinition,'active-time-v2');
  assert.equal(r.units.activeTime,'milliseconds');assert.equal(r.units.successRate,'proportion from 0 to 1');
  assert.equal(r.coverage.plannedAssignments,18);assert.equal(r.balance.length,18);
  assert.ok(r.conditions.every(c=>c.meanParticipantSuccessRate===null&&c.meanParticipantActiveMs===null));
  assert.ok(r.paired.every(c=>c.meanSuccessDifferencePp===null&&c.meanActiveDifferenceMs===null));
  assert.deepEqual(JSON.parse(json),r);assert.match(html,/No recordings are included/);assert.match(html,/Not available/);
});
test('report results match canonical calculations across all 18 assignments and analysis filters',()=>{
  const e=entries(...assignments(plan).map(p=>({participant:p.participant,order:p.order,setRotation:p.setRotation,fail:['A:spelling'],interrupt:['B:alias']})));
  for(const options of [{},{excludeInterrupted:true},{pairedSuccessfulOnly:false},{includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false,choices:{2:false}}]) {
    const r=createStudySummary(e,plan,options,date),coverage=studyCoverage(e,plan,options);
    assert.deepEqual(r.conditions,compareConditions(e,options));
    assert.deepEqual(r.paired,pairedSummary(e,options).map(row=>pick(row,Object.keys(r.paired[0]))));
    assert.deepEqual(r.coverage,coverage.summary);assert.deepEqual(r.balance,coverage.balance);
  }
});
test('success signs and timing units survive JSON and printable formatting',()=>{
  const {summary:r,html}=studySummaryAssets(entries({fail:['A:spelling']}),plan,{},date);
  assert.equal(r.paired[0].meanSuccessDifferencePp,25);assert.equal(r.paired[0].meanActiveDifferenceMs,-300);
  assert.equal(r.conditions[0].meanParticipantSuccessRate,0.75);assert.equal(r.conditions[0].meanParticipantActiveMs,1000);
  assert.match(html,/\+25\.00 pp/);assert.match(html,/-0\.30 s/);assert.match(html,/75\.00%/);assert.match(html,/1\.00 s/);
});
test('review counts reflect invalid files, duplicates, conflicts, exclusions, and incomplete selection',()=>{
  const e=entries({}, {participant:'secret_001'}, {participant:'SECRET_002',count:8}, {participant:'OUTSIDE'});
  e.push(...reviewFiles([{name:'PRIVATE_INVALID.json',text:'{'}]).map(row=>({...row,id:4})));
  const r=createStudySummary(e,plan,{includePartial:true,choices:{0:true,1:true,3:false}},date);
  assert.deepEqual(r.review,{importedFiles:5,validRecordings:4,invalidFiles:1,includedRecordings:1,excludedValidRecordings:3,includedComplete:0,includedIncomplete:1,repeatedCodeGroups:1,conflictingSelectionGroups:1});
  assert.equal(r.paired[0].successParticipants,1);assert.equal(r.paired[1].successParticipants,0);
  assert.equal(createStudySummary(e,plan,{},date).review.includedIncomplete,0);
});
test('no eligible timing stays missing while genuine zero timing remains zero',()=>{
  let assets=studySummaryAssets(entries({fail:['A:spelling','A:alias','A:partial','A:reordered']}),plan,{},date);
  assert.equal(assets.summary.paired[0].meanActiveDifferenceMs,null);assert.match(assets.html,/Not available/);
  assets=studySummaryAssets(entries({duration:()=>0}),plan,{},date);
  assert.equal(assets.summary.paired[0].meanActiveDifferenceMs,0);assert.match(assets.html,/>0\.00 s</);
});
test('aggregate JSON and HTML omit every individual identity and free-text source',()=>{
  const e=entries({}),options={notes:{0:'PRIVATE_REVIEW_NOTE'},choices:{0:true},extra:'PRIVATE_UNKNOWN'};
  assert.match(JSON.stringify(e),/PRIVATE_QUERY/);assert.match(JSON.stringify(e),/PRIVATE_OBSERVATION/);
  const {json,html}=studySummaryAssets(e,plan,options,date);
  for(const text of ['SECRET_','PRIVATE_FILE','PRIVATE_QUERY','PRIVATE_OBSERVATION','PRIVATE_REVIEW_NOTE','PRIVATE_UNKNOWN']) {
    assert.ok(!json.includes(text),`JSON leaked ${text}`);assert.ok(!html.includes(text),`HTML leaked ${text}`);
  }
  assert.ok(!json.includes('choices'));assert.ok(!json.includes('participant:'));
});
test('report generation is read-only and deterministic for a supplied timestamp',()=>{
  const e=entries({}, {participant:'SECRET_002'}),options={choices:{1:false},notes:{0:'PRIVATE_REVIEW_NOTE'}};
  const before=JSON.stringify({e,plan,options});const one=studySummaryAssets(e,plan,options,date),two=studySummaryAssets(e,plan,options,date);
  assert.deepEqual(one,two);assert.equal(JSON.stringify({e,plan,options}),before);
});
test('reopened workspaces reproduce the summary from underlying inputs and decisions',()=>{
  const e=entries({}, {participant:'SECRET_002',count:8}),options={includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false,choices:{0:false}};
  const restored=parseProject(project(e,options));
  assert.deepEqual(createStudySummary(restored.entries,restored.planConfig,restored.options,date),createStudySummary(e,plan,options,date));
});
test('HTML escapes dynamic values and blocks scripts, forms, and external requests',()=>{
  const r=createStudySummary([],plan,{},date);r.scope='<script>alert("x")</script>';r.protocol.datasetVersion='" onload="x';
  const html=studySummaryHtml(r);
  assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);assert.ok(!html.includes('<script'));
  assert.match(html,/default-src 'none'/);assert.match(html,/form-action 'none'/);
  assert.ok(!/<(?:script|link|img|iframe|form)\b/i.test(html));assert.ok(!/https?:\/\//.test(html));
  assert.equal((html.match(/<section>/g)||[]).length,4);assert.match(html,/@page\{size:letter/);
});
test('invalid timestamps fail before report generation',()=>{
  for(const bad of [null,'not-a-date','x'.repeat(100)])assert.throws(()=>createStudySummary([],plan,{},bad),/date is invalid/);
});
