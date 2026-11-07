import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
const epoch=Date.UTC(2026,10,6), at=(ms,mono=ms)=>({wall:epoch+ms,mono});
const setup=(order='ABC',setRotation=0)=>{const s=study.createSession({participant:'P001',order,setRotation},at(0));study.startTrial(s,at(0));return s;};
const serialized=s=>JSON.stringify(study.snapshot(s,at(5000)));

test('pausing preserves the query and excludes idle time without resetting active time',()=>{
 const s=setup();study.setQuery(s,'calendar settings');study.pauseTrial(s,'manual',at(5000));
 assert.equal(s.currentTrial.query,'calendar settings');assert.equal(s.currentTrial.queryReformulations,1);
 assert.equal(study.pauseTrial(s,'tab_hidden',at(8000)),false);assert.equal(s.currentTrial.pauseCount,1);
 study.resumeTrial(s,at(15000));assert.equal(study.resumeTrial(s,at(16000)),false);
 const t=study.completeTrial(s,'calendar',at(17000));
 assert.equal(t.activeElapsedMs,7000);assert.equal(t.elapsedMs,7000);assert.equal(t.wallElapsedMs,17000);assert.equal(t.pauseCount,1);assert.equal(t.resumeCount,1);assert.equal(t.success,true);
});
test('a running snapshot restores paused with progress, pending query, and timing intact',()=>{
 const s=setup();study.setQuery(s,'edited query');s.currentTrial.previousQuery='calender';
 const snapshot=serialized(s);assert.notEqual(s.currentTrial.activeSince,null);
 const restored=study.restoreSession(snapshot,at(20000,0));
 assert.equal(restored.currentTrial.activeSince,null);assert.equal(restored.currentTrial.activeMs,5000);assert.equal(restored.currentTrial.query,'edited query');assert.equal(restored.currentTrial.previousQuery,'calender');assert.equal(restored.currentTrial.restored,true);
 assert.throws(()=>study.completeTrial(restored,null,at(20000)),/Resume/);
 study.resumeTrial(restored,at(20000,100));const t=study.completeTrial(restored,null,at(22000,2100));
 assert.equal(t.activeElapsedMs,7000);assert.equal(t.wallElapsedMs,22000);assert.equal(t.queryReformulations,1);assert.equal(t.restored,true);assert.equal(t.skipped,true);
});
test('query changes flush before suggestions, undo, and immediate selection without duplicates',()=>{
 const s=setup();study.setQuery(s,'calendr');study.flushQuery(s,at(10));
 study.setQuery(s,'calendar','suggestion');study.flushQuery(s,at(20),'suggestion_applied',{original:'calendr'});
 study.setQuery(s,'calendr','undo');study.flushQuery(s,at(30),'suggestion_undone');
 study.setQuery(s,'Calendar Settings');const t=study.completeTrial(s,'calendar',at(31));
 assert.equal(t.queryReformulations,4);assert.equal(t.finalQuery,'Calendar Settings');assert.equal(s.events.filter(e=>e.type==='query').length,2);
 assert.throws(()=>study.completeTrial(s,'calendar',at(32)),/Resume/);
});
test('all six orders and three rotations complete once and round-trip with ratings drafts',()=>{
 for(const order of study.orders)for(let rotation=0;rotation<3;rotation++){
  let s=setup(order,rotation),ms=0;
  for(let i=0;i<12;i++){
   if(!s.currentTrial)study.startTrial(s,at(ms));const target=study.taskAt(s).target;ms+=100;
   study.completeTrial(s,target,at(ms));
   if(s.phase==='ratings'){
    s.ratingDraft={confidence:4,trust:5,ease:null,notes:'Draft survives reload'};
    const reloaded=study.restoreSession(JSON.stringify(study.snapshot(s,at(ms))),at(ms));
    assert.deepEqual(reloaded.ratingDraft,s.ratingDraft);s=reloaded;
    study.addRatings(s,{confidence:4,trust:5,ease:6,notes:''},at(ms));
   }
  }
  assert.equal(s.phase,'complete');assert.equal(s.trials.length,12);assert.equal(s.ratings.length,3);
  const restored=study.restoreSession(JSON.stringify(study.snapshot(s,at(ms))),at(ms));
  assert.equal(restored.trials.filter(t=>t.success).length,12);
  assert.deepEqual(study.summarize(restored).map(r=>[r.attempted,r.successes,r.trust]),[[4,4,5],[4,4,5],[4,4,5]]);
 }
});
test('separate skips, wrong selections, restored trials, and empty means in summaries',()=>{
 const s=setup();study.completeTrial(s,'calendar',at(100));study.startTrial(s,at(100));study.completeTrial(s,'calendar',at(300));study.startTrial(s,at(300));study.completeTrial(s,null,at(600));
 const [a,b,c]=study.summarize(s);
 assert.equal(a.attempted,3);assert.equal(a.successes,1);assert.equal(a.skips,1);assert.equal(a.incorrectSelections,1);assert.equal(a.meanActiveMs,200);assert.equal(a.meanSuccessfulActiveMs,100);assert.equal(b.meanActiveMs,null);assert.equal(c.trust,null);
 assert.match(study.trialsCsv(s),/"activeElapsedMs","wallElapsedMs"/);assert.match(study.summaryCsv(s),/"meanSuccessfulActiveMs"/);
});
test('restore rejects malformed, legacy, oversized, and inconsistent sessions before replacement',()=>{
 assert.throws(()=>study.restoreSession('{'),/valid JSON/);
 assert.throws(()=>study.restoreSession(JSON.stringify({version:'0.1'})),/v0.2/);
 assert.throws(()=>study.restoreSession('x'.repeat(study.MAX_IMPORT_BYTES+1)),/1 MB/);
 const mutate=(change)=>{const s=JSON.parse(serialized(setup()));change(s);return JSON.stringify(s);};
 for(const change of [s=>s.order='AAA',s=>s.participant='<script>',s=>s.taskIndex=4,s=>s.phase='complete',s=>s.currentTrial.query='a'.repeat(257),s=>s.currentTrial.activeMs=-1,s=>s.currentTrial.wallStartedAt='yesterday',s=>s.ratingDraft.trust=8,s=>s.events[0].type='invented',s=>s.events[0].condition='B'])assert.throws(()=>study.restoreSession(mutate(change)));
});
test('an imported file cannot override export metadata through unknown nested fields',()=>{
 const s=setup();study.completeTrial(s,'calendar',at(100));
 s.trials[0].participant='=HYPERLINK("bad")';s.trials[0].version='fake';s.extra='discard';
 const restored=study.restoreSession(JSON.stringify(study.snapshot(s,at(100))),at(100));
 assert.equal(restored.extra,undefined);assert.equal(restored.trials[0].participant,undefined);assert.match(study.trialsCsv(restored),/"0.2","2","active-time-v2","P001"/);
});
test('CSV preserves quotes and newlines and neutralizes formula prefixes including whitespace',()=>{
 const output=study.csv([{x:' =2+2',y:'line 1\n"line 2"',z:'@SUM(1)'}],['x','y','z']);
 assert.match(output,/"' =2\+2"/);assert.ok(output.includes('"line 1\n""line 2"""'));assert.match(output,/"'@SUM\(1\)"/);
});
test('repeated paused exports and restores keep active time and count each pause only once',()=>{
 let s=setup();study.setQuery(s,'calendar settings');study.pauseTrial(s,'manual',at(1250));
 for(let i=1;i<=3;i++){
  s=study.restoreSession(JSON.stringify(study.snapshot(s,at(i*10000))),at(i*10000,0));
  assert.equal(s.currentTrial.activeMs,1250);assert.equal(s.currentTrial.pauseCount,1);
  assert.equal(s.currentTrial.queryReformulations,1);assert.equal(s.currentTrial.activeSince,null);
 }
 study.resumeTrial(s,at(40000,100));const trial=study.completeTrial(s,'calendar',at(40750,850));
 assert.equal(trial.activeElapsedMs,2000);assert.equal(trial.wallElapsedMs,40750);
 assert.equal(trial.pauseCount,1);assert.equal(trial.resumeCount,1);assert.equal(trial.restored,true);
});
test('exported partial sessions preserve completed records and drafts before continuing to completion',()=>{
 let s=setup('CAB',2),ms=0;
 for(let i=0;i<4;i++){
  if(!s.currentTrial)study.startTrial(s,at(ms));
  const target=study.taskAt(s).target;
  study.recordEvent(s,'result_opened',{recordId:target,rank:1},at(ms+50));
  study.completeTrial(s,target,at(ms+=100));
 }
 s.ratingDraft={confidence:6,trust:null,ease:5,notes:'Line one\n"Quoted" observation'};
 const originalTrials=structuredClone(s.trials),originalEvents=structuredClone(s.events);
 const file=JSON.stringify(study.snapshot(s,at(ms)),null,2);
 s=study.restoreSession(file,at(ms+10000,0));
 assert.equal(s.phase,'ratings');assert.deepEqual(s.trials,originalTrials);assert.deepEqual(s.events,originalEvents);
 assert.equal(s.ratingDraft.trust,null);assert.equal(s.ratingDraft.notes,'Line one\n"Quoted" observation');
 study.addRatings(s,{...s.ratingDraft,trust:7},at(ms));
 while(s.phase!=='complete'){
  study.startTrial(s,at(ms));study.completeTrial(s,study.taskAt(s).target,at(ms+=100));
  if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:''},at(ms));
 }
 const restored=study.restoreSession(JSON.stringify(study.snapshot(s,at(ms))),at(ms));
 assert.equal(restored.trials.length,12);assert.equal(restored.ratings.length,3);
 assert.equal(study.trialsCsv(restored).split('\r\n').length,13);
 assert.equal(study.summaryCsv(restored).split('\r\n').length,4);
 assert.deepEqual(study.summarize(restored).map(r=>r.successes),[4,4,4]);
 assert.deepEqual(restored.trials.slice(0,4),originalTrials);
});
