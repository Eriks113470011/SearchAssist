import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {reviewFiles} from '../dist/workspace.mjs';
import {pairedRows, pairedSummary, pairedCsv, pairedSummaryCsv} from '../dist/paired.mjs';

const at = ms => ({wall:Date.UTC(2026,10,10)+ms,mono:ms});
function recording({participant='P001',order='ABC',rotation=0,count=12,fail=[],interrupt=[],duration=(condition)=>({A:1000,B:700,C:400})[condition]}={}) {
  const s = study.createSession({participant,order,setRotation:rotation},at(0));let ms=0;
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(ms));const task=study.taskAt(s),condition=s.order[Math.floor(i/4)],key=`${condition}:${task.type}`,d=duration(condition,task.type);
    const selected=fail.includes(key)?null:task.target;
    if(interrupt.includes(key)) {study.pauseTrial(s,'manual',at(ms+d/2));study.resumeTrial(s,at(ms+d/2+1000));ms+=1000;}
    ms+=d;study.completeTrial(s,selected,at(ms));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'Participant observation omitted from paired reports'},at(ms));
  }
  return JSON.stringify(study.snapshot(s,at(ms)));
}
const entries = (...configs) => reviewFiles(configs.map((config,i)=>({name:`session-${i}.json`,text:recording(config)})));

test('paired differences use condition labels across all 18 orders and rotations',()=>{
  for(const order of study.orders)for(const rotation of [0,1,2]) {
    const rows=pairedRows(entries({order,rotation}));
    assert.deepEqual(rows.map(r=>r.comparison),['B - A','C - A','C - B']);
    assert.deepEqual(rows.map(r=>r.activeDifferenceMs),[-300,-600,-300]);
    assert.deepEqual(rows.map(r=>r.successDifferencePp),[0,0,0]);
    assert.deepEqual(rows.map(r=>r.timedTaskPairs),[4,4,4]);
  }
});
test('success differences have explicit comparator-minus-reference signs and percentage-point units',()=>{
  const row=pairedRows(entries({fail:['A:spelling']}))[0];
  assert.equal(row.referenceSuccesses,3);assert.equal(row.comparatorSuccesses,4);
  assert.equal(row.successDifferencePp,25);assert.equal(row.timedTaskPairs,3);
  const opposite=pairedRows(entries({fail:['B:spelling']}))[0];assert.equal(opposite.successDifferencePp,-25);
});
test('successful-only timing matches correct task types on both sides and remains configurable',()=>{
  const e=entries({fail:['A:spelling'],duration:(c,t)=>c==='A'&&t==='spelling'?10000:{A:1000,B:700,C:400}[c]});
  const successful=pairedRows(e)[0], all=pairedRows(e,{pairedSuccessfulOnly:false})[0];
  assert.equal(successful.pairedTaskTypes,'alias|partial|reordered');assert.equal(successful.activeDifferenceMs,-300);
  assert.equal(all.timedTaskPairs,4);assert.equal(all.activeDifferenceMs,-2550);
  assert.equal(all.successDifferencePp,successful.successDifferencePp);
});
test('an interruption on either side removes the task type from both timing means',()=>{
  const e=entries({fail:['A:spelling'],interrupt:['A:alias','B:partial'],duration:(c,t)=>c==='A'&&t==='alias'?10000:c==='B'&&t==='partial'?50000:{A:1000,B:700,C:400}[c]});
  const row=pairedRows(e,{excludeInterrupted:true})[0];
  assert.equal(row.pairedTaskTypes,'reordered');assert.equal(row.timedTaskPairs,1);
  assert.equal(row.referenceMeanActiveMs,1000);assert.equal(row.comparatorMeanActiveMs,700);
  assert.equal(row.activeDifferenceMs,-300);assert.equal(row.excludedInterruptedTypes,'alias|partial');
  assert.equal(row.excludedUnsuccessfulTypes,'spelling');assert.equal(row.successDifferencePp,25);
});
test('full condition blocks are required and partial sessions remain opt-in',()=>{
  const e=entries({count:8});assert.equal(pairedRows(e).length,0);
  const rows=pairedRows(e,{includePartial:true});assert.equal(rows.length,3);
  assert.deepEqual(rows.map(r=>r.successEligible),[true,false,false]);
  assert.equal(rows[1].successDifferencePp,null);assert.equal(rows[1].activeDifferenceMs,null);
  assert.equal(rows[1].timingStatus,'Incomplete condition block');
  assert.deepEqual(pairedRows(entries({order:'CAB',count:8}),{includePartial:true}).map(r=>r.successEligible),[false,true,false]);
  assert.ok(pairedRows(entries({count:6}),{includePartial:true}).every(r=>!r.successEligible));
});
test('paired summaries weight participants equally despite different numbers of timed types',()=>{
  const e=entries({participant:'P001',duration:c=>c==='B'?2000:1000},{participant:'P002',fail:['A:alias','A:partial','A:reordered'],duration:c=>c==='B'?5000:1000});
  const row=pairedSummary(e)[0];
  assert.equal(row.successParticipants,2);assert.equal(row.meanSuccessDifferencePp,37.5);
  assert.equal(row.timingParticipants,2);assert.equal(row.timedTaskPairs,5);
  assert.equal(row.meanActiveDifferenceMs,2500);assert.notEqual(row.meanActiveDifferenceMs,1600);
});
test('empty timing subsets stay missing rather than appearing as zero differences',()=>{
  const e=entries({fail:['A:spelling','A:alias','A:partial','A:reordered']});
  const rows=pairedRows(e),summary=pairedSummary(e);
  assert.equal(rows[0].timedTaskPairs,0);assert.equal(rows[0].activeDifferenceMs,null);
  assert.equal(rows[0].timingStatus,'No task types meet timing rules');
  assert.equal(summary[0].successParticipants,1);assert.equal(summary[0].meanSuccessDifferencePp,100);
  assert.equal(summary[0].timingParticipants,0);assert.equal(summary[0].meanActiveDifferenceMs,null);
  assert.equal(pairedSummary(entries({duration:()=>0}))[0].meanActiveDifferenceMs,0);
  assert.ok(pairedSummary([]).every(r=>r.meanSuccessDifferencePp===null&&r.meanActiveDifferenceMs===null));
});
test('existing exclusions, duplicate choices, and unresolved conflicts apply to paired analysis',()=>{
  const e=entries({participant:'P001'},{participant:'p001'},{participant:'P002'});
  assert.equal(pairedSummary(e)[0].successParticipants,1);
  assert.equal(pairedSummary(e,{choices:{0:true}})[0].successParticipants,2);
  assert.equal(pairedSummary(e,{choices:{0:true,1:true,2:false}})[0].successParticipants,0);
  assert.equal(pairedRows(e,{choices:{2:false}}).length,0);
});
test('paired exports include eligibility, matched coverage and rules, but omit recording text',()=>{
  const e=entries({count:8});
  const output=pairedCsv(e,{includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false});
  assert.equal(output.split('\r\n').length,4);assert.match(output,/"successEligible"/);assert.match(output,/"pairedTaskTypes"/);
  assert.match(output,/"Incomplete condition block"/);assert.match(output,/"pairedSuccessfulOnly"/);
  assert.ok(output.includes('"-300"'));assert.ok(!output.includes('"\'-300"'));
  assert.ok(!output.includes('calender'));assert.ok(!output.includes('Participant observation omitted'));
  assert.equal(pairedSummaryCsv(e,{includePartial:true}).split('\r\n').length,4);
  assert.throws(()=>pairedCsv([]),/eligible/);assert.throws(()=>pairedSummaryCsv([]),/eligible/);
});
test('negative numeric CSV measurements remain numeric while negative user strings remain protected',()=>{
  assert.equal(study.csv([{measurement:-25,query:'-25',formula:' =1+1'}],['measurement','query','formula']), '"measurement","query","formula"\r\n"-25","\'-25","\' =1+1"');
});
