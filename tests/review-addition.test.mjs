import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {reviewFiles,appendReview,undoReviewAddition,reviewBatchBytes,selectSessions,MAX_BATCH_BYTES} from '../dist/workspace.mjs';
import {exportProject,parseProject} from '../dist/review-project.mjs';
import {studyCoverage} from '../dist/coverage.mjs';
import {pairedSummary} from '../dist/paired.mjs';
import {ratingSummary} from '../dist/ratings.mjs';
import {createStudySummary} from '../dist/study-summary.mjs';

const plan={prefix:'P',start:1,count:18},date='2026-11-17T12:00:00Z';
const at=ms=>({wall:Date.UTC(2026,10,17)+ms,mono:ms});
function file(participant='P001',count=12) {
  const s=study.createSession({participant,order:'ABC',setRotation:0},at(0));
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(i*1000));study.setQuery(s,'PRIVATE_QUERY');
    study.completeTrial(s,study.taskAt(s).target,at(i*1000+500));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'PRIVATE_OBSERVATION'},at(i*1000+500));
  }
  return {name:participant+'.json',text:JSON.stringify(study.snapshot(s,at(count*1000)))};
}
const selected=(state,options={})=>selectSessions(state.entries,{...options,choices:state.choices}).sessions.map(e=>e.session.participant);

test('additions preserve existing file positions, explicit choices and notes without changing inputs',()=>{
  const e=reviewFiles([file(),file('P002')]),options={choices:{0:false,1:true},notes:{0:'Excluded',1:'Keep note'},includePartial:true};
  const before=JSON.stringify({e,options}),r=appendReview(e,[file('P003')],options);
  assert.equal(JSON.stringify({e,options}),before);assert.deepEqual(r.entries.map(e=>e.id),[0,1,2]);
  assert.deepEqual(r.choices,{0:false,1:true});assert.deepEqual(r.notes,options.notes);
  assert.deepEqual(selected(r),['P002','P003']);assert.deepEqual(r.entries[0].session,e[0].session);
});
test('new case-insensitive duplicate groups require explicit selection for formerly default-included files',()=>{
  const e=reviewFiles([file()]),r=appendReview(e,[file('p001')]);
  assert.ok(r.entries.every(e=>e.duplicate));assert.deepEqual(selected(r),[]);
  assert.deepEqual(selected({...r,choices:{1:true}}),['p001']);
  assert.deepEqual(selected({...r,choices:{0:true,1:true}}),[]);
});
test('explicit previous choices and unresolved duplicate conflicts retain their meanings after addition',()=>{
  const e=reviewFiles([file(),file('p001')]);
  let r=appendReview(e,[file('P002')],{choices:{0:true,1:false}});assert.deepEqual(selected(r),['P001','P002']);
  r=appendReview(e,[file('P002')],{choices:{0:true,1:true}});
  assert.deepEqual(selectSessions(r.entries,{choices:r.choices}).conflicts,['P001']);assert.deepEqual(selected(r),['P002']);
  const original=reviewFiles([file()]);r=appendReview(original,[file('p001')],{choices:{0:true}});assert.deepEqual(selected(r),['P001']);
});
test('invalid file errors remain isolated and old invalid source bytes are never reconstructed',()=>{
  const e=reviewFiles([{name:'old.json',text:'PRIVATE_INVALID_SOURCE'}]);e[0].error='Original detailed error';
  const r=appendReview(e,[{name:'new.json',text:'{'},file()]);
  assert.equal(r.entries[0].error,'Original detailed error');assert.equal(r.entries[0].session,null);
  assert.match(r.entries[1].error,/not valid JSON/);assert.deepEqual(selected(r),['P001']);
  assert.equal(reviewBatchBytes(e),0);assert.ok(!JSON.stringify(r).includes('PRIVATE_INVALID_SOURCE'));
});
test('incomplete-session and timing settings remain caller-controlled after addition',()=>{
  const r=appendReview(reviewFiles([file()]),[file('P002',4)],{choices:{0:false},notes:{0:'Keep this'}});
  assert.deepEqual(selected(r),[]);assert.deepEqual(selected(r,{includePartial:true}),['P002']);
  assert.deepEqual(r.choices,{0:false});assert.deepEqual(r.notes,{0:'Keep this'});
});
test('identical files are kept as separate candidates rather than silently deduplicated',()=>{
  const f=file(),r=appendReview(reviewFiles([f]),[f]);assert.equal(r.entries.length,2);assert.deepEqual(selected(r),[]);
  assert.deepEqual(r.entries.map(e=>e.name),['P001.json','P001.json']);
});
test('combined file and serialized-byte limits reject additions atomically',()=>{
  const e=reviewFiles(Array.from({length:60},(_,i)=>file('P'+i,0))),before=JSON.stringify(e);
  assert.throws(()=>appendReview(e,[file('EXTRA',0)]),/at most 60/);assert.equal(JSON.stringify(e),before);
  const small=reviewFiles([file()]),smallBefore=JSON.stringify(small);
  assert.equal(reviewBatchBytes(small),new TextEncoder().encode(JSON.stringify(small[0].session)).length);
  assert.throws(()=>appendReview(small,[{name:'too-large.json',text:' '.repeat(MAX_BATCH_BYTES)}]),/10 MB/);
  assert.equal(JSON.stringify(small),smallBefore);
  const accepted=appendReview(reviewFiles(Array.from({length:59},(_,i)=>file('Q'+i,0))),[file('LAST',0)]);assert.equal(accepted.entries.length,60);
});
test('empty additions and inconsistent current indices reject before any mutation',()=>{
  assert.throws(()=>appendReview([],[]),/at least one/);assert.throws(()=>appendReview([{id:2}], [file()]),/indices/);
  const r=appendReview([],[file()]);assert.equal(r.entries.length,1);assert.deepEqual(selected(r),['P001']);
});
test('undo removes only the latest suffix and keeps subsequent decisions on earlier files',()=>{
  const e=reviewFiles([file(),file('P002')]),r=appendReview(e,[file('P003')],{notes:{0:'Before'}});
  const current={choices:{0:false,1:true,2:false},notes:{0:'Edited after addition',1:'New old-file note',2:'Discard new-file note'}};
  const before=JSON.stringify(current),undo=undoReviewAddition(e,current);
  assert.equal(JSON.stringify(current),before);assert.deepEqual(undo.entries,e);
  assert.deepEqual(undo.choices,{0:false,1:true});assert.deepEqual(undo.notes,{0:'Edited after addition',1:'New old-file note'});
  assert.deepEqual(selected(undo),['P002']);assert.equal(r.entries.length,3);
});
test('undo recomputes defaults through the previous duplicate flags and supports an initially empty review',()=>{
  const e=reviewFiles([file()]),r=appendReview(e,[file('p001')]);assert.deepEqual(selected(r),[]);
  assert.deepEqual(selected(undoReviewAddition(e,r)),['P001']);
  assert.deepEqual(selected(undoReviewAddition(e,{choices:{0:false,1:true}})),[]);
  assert.deepEqual(undoReviewAddition([],{choices:{0:true},notes:{0:'Removed'}}),{entries:[],choices:{},notes:{}});
});
test('multiple additions permit an undo of the latest one without dropping earlier additions',()=>{
  const a=appendReview([],[file()]),b=appendReview(a.entries,[file('P002')],a),c=appendReview(b.entries,[file('P003')],b);
  const undo=undoReviewAddition(b.entries,c);assert.equal(undo.entries.length,2);assert.deepEqual(selected(undo),['P001','P002']);
});
test('added batches and their decisions round-trip through unchanged workspace schemas and derived reports',()=>{
  const r=appendReview(reviewFiles([file(),file('P002',4)]),[file('P003'),{name:'bad.json',text:'{'}],{choices:{0:false},notes:{0:'Keep reason'}});
  const options={includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false,choices:r.choices};
  const restored=parseProject(exportProject({entries:r.entries,planConfig:plan,options,notes:r.notes},date));
  assert.deepEqual(restored.notes,{0:'Keep reason',1:'',2:'',3:''});assert.equal(JSON.parse(exportProject({entries:r.entries,planConfig:plan,options,notes:r.notes},date)).projectVersion,2);
  assert.deepEqual(studyCoverage(restored.entries,plan,restored.options),studyCoverage(r.entries,plan,options));
  assert.deepEqual(pairedSummary(restored.entries,restored.options),pairedSummary(r.entries,options));
  assert.deepEqual(ratingSummary(restored.entries,restored.options),ratingSummary(r.entries,options));
  assert.deepEqual(createStudySummary(restored.entries,plan,restored.options,date),createStudySummary(r.entries,plan,options,date));
});
