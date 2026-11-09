import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {reviewFiles, reviewCsv, auditCsv, selectSessions} from '../dist/workspace.mjs';
import {exportProject, parseProject, MAX_PROJECT_BYTES} from '../dist/review-project.mjs';

const at = ms => ({wall:Date.UTC(2026,10,9)+ms,mono:ms});
function recording(participant, complete = true) {
  const s = study.createSession({participant,order:'ABC',setRotation:0},at(0));
  for (let i=0;i<(complete ? 12 : 1);i++) {
    study.startTrial(s,at(i*1000));
    study.completeTrial(s,study.taskAt(s).target,at(i*1000+500));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'Private participant observation'},at(i*1000+500));
  }
  if(!complete) {study.startTrial(s,at(2000));study.setQuery(s,'Unfinished participant query');}
  return JSON.stringify(study.snapshot(s,at(2500)));
}
const savedAt = '2026-11-09T17:00:00.000Z';
function state() {
  const entries = reviewFiles([
    {name:'one.json',text:recording('P001')}, {name:'copy.json',text:recording('p001')},
    {name:'partial.json',text:recording('P002',false)}, {name:'invalid.json',text:'Private invalid raw content'}
  ]);
  return {planConfig:{prefix:'TEST_',start:19,count:36},entries,options:{includePartial:true,excludeInterrupted:true,choices:{0:true,1:false,2:false}},notes:{0:'Preferred completed export',1:'Duplicate excluded',2:'Pause for follow-up',3:'Invalid recording'}};
}
const project = () => JSON.parse(exportProject(state(),savedAt));

test('workspace round-trip preserves assignments, explicit/default choices, notes, and analysis results',()=>{
  const original=state(), restored=parseProject(exportProject(original,savedAt));
  assert.deepEqual(restored.planConfig,original.planConfig);assert.deepEqual(restored.options,original.options);assert.deepEqual(restored.notes,original.notes);
  assert.deepEqual(restored.entries,original.entries);assert.equal(restored.savedAt,savedAt);
  assert.equal(reviewCsv(restored.entries,restored.options),reviewCsv(original.entries,original.options));
  assert.equal(auditCsv(restored.entries,{...restored.options,notes:restored.notes}),auditCsv(original.entries,{...original.options,notes:original.notes}));
  assert.deepEqual(selectSessions(restored.entries,restored.options).sessions.map(e=>e.id),[0]);
});
test('saving and reopening never resumes or adds time or events to embedded recordings',()=>{
  const original=state(), before=JSON.stringify(original.entries), restored=parseProject(exportProject(original,savedAt));
  assert.equal(JSON.stringify(original.entries),before);
  const current=restored.entries[2].session.currentTrial;
  assert.equal(current.restored,false);assert.equal(current.pauseCount,0);assert.equal(current.runningAtSave,true);
  assert.deepEqual(restored.entries[2].session.events,original.entries[2].session.events);
});
test('projects contain full validated recordings but omit invalid source bytes',()=>{
  const data=exportProject(state(),savedAt);
  assert.ok(data.includes('Private participant observation'));assert.ok(data.includes('Unfinished participant query'));
  assert.ok(!data.includes('Private invalid raw content'));
  const restored=parseProject(data);assert.match(restored.entries[3].error,/JSON/);
});
test('unknown metadata and forged duplicate flags do not alter restored decisions',()=>{
  const p=project();p.summary={success:900};p.storageKey='other';p.assignment.extra='discard';
  p.files[0].duplicate=false;p.files[0].session.extra='discard';p.files[0].session.trials[0].extra='discard';
  const restored=parseProject(JSON.stringify(p));
  assert.equal(restored.entries[0].duplicate,true);assert.equal(restored.summary,undefined);
  assert.equal(restored.entries[0].session.extra,undefined);assert.equal(restored.entries[0].session.trials[0].extra,undefined);
  assert.deepEqual(Object.keys(restored.planConfig),['prefix','start','count']);
});
test('invalid embedded recording rejects the whole project',()=>{
  const p=project();p.files[1].session.trials[0].success=false;
  assert.throws(()=>parseProject(JSON.stringify(p)),/Recording 2 is invalid/);
  const original=state();assert.equal(original.options.choices[0],true);
});
test('malformed, wrong-format, future-version, and oversized projects are rejected',()=>{
  assert.throws(()=>parseProject('{'),/valid JSON/);
  assert.throws(()=>parseProject(recording('P001')),/workspace project/);
  const p=project();p.projectVersion=99;assert.throws(()=>parseProject(JSON.stringify(p)),/workspace project/);
  assert.throws(()=>parseProject('x'.repeat(MAX_PROJECT_BYTES+1)),/12 MB/);
  assert.throws(()=>parseProject('é'.repeat(MAX_PROJECT_BYTES/2+1)),/12 MB/);
});
test('damaged plans, settings, choices, names, notes, and validation records reject imports',()=>{
  const mutate=change=>{const p=project();change(p);return JSON.stringify(p);};
  for(const change of [p=>delete p.assignment.count,p=>p.assignment.start=0,p=>p.analysis.includePartial='yes',p=>delete p.analysis.excludeInterrupted,p=>p.files[0].choice=1,p=>p.files[0].decisionNote='x'.repeat(1001),p=>p.files[0].name='',p=>p.files[0].error='invalid',p=>p.files[3].error=null,p=>p.savedAt='not a date',p=>p.files=Array(61).fill(p.files[0])]) assert.throws(()=>parseProject(mutate(change)));
});
test('empty workspaces support saving just the assignment plan',()=>{
  const restored=parseProject(exportProject({planConfig:{prefix:'P',start:1,count:18},entries:[]},savedAt));
  assert.deepEqual(restored.entries,[]);assert.deepEqual(restored.options,{includePartial:false,excludeInterrupted:false,choices:{}});
});
test('inclusion notes are CSV-escaped while raw query and participant observation remain omitted',()=>{
  const s=state();s.notes[0]=' =HYPERLINK("example")';s.notes[1]='Line one\n"Line two"';
  const report=auditCsv(s.entries,{...s.options,notes:s.notes});
  assert.match(report,/"decisionNote"/);assert.ok(report.includes('"\' =HYPERLINK(""example"")"'));
  assert.ok(report.includes('Line one\n""Line two""'));assert.ok(!report.includes('Private participant observation'));assert.ok(!report.includes('Unfinished participant query'));
});
test('unresolved duplicate conflicts remain unresolved after reopening',()=>{
  const s=state();s.options.choices={0:true,1:true};
  const restored=parseProject(exportProject(s,savedAt));
  assert.deepEqual(selectSessions(restored.entries,restored.options).conflicts,['P001']);
});
