import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as study from '../dist/study.mjs';
import {createSimulationSession,advanceSimulationBlock,validateSimulationRecording,restoreSimulationRecording} from '../dist/simulation-session.mjs';
import {validateBrowserConfig} from '../simulator/browser-config.mjs';
import {simulate} from '../simulator/runner.mjs';
import {interruptionRows,summarizeRun,simulationPayloads,renderSimulationReport} from '../simulator/report.mjs';
const at=ms=>({wall:Date.UTC(2026,10,21)+ms,mono:ms});
const options={participant:'SIM_RECOVERY',order:'CBA',setRotation:1};
const encoded=s=>JSON.stringify(study.snapshot(s,at(100)));
function partial(){const s=createSimulationSession(options,at(0));study.startTrial(s,at(0));study.setQuery(s,'library');s.currentTrial.previousQuery='libary research';study.flushQuery(s,at(100));return s;}
test('synthetic validation preserves provenance, assignment, query, undo state and unknown-field sanitization',()=>{
 const s=partial(),raw=JSON.parse(encoded(s));raw.unsafeOption='override';raw.currentTrial.unsafe=1;
 const a=validateSimulationRecording(JSON.stringify(raw),at(200));assert.equal(a.dataOrigin,'synthetic');assert.equal(a.runner,'browser');assert.equal(a.humanRatings,null);assert.equal(a.currentTrial.query,'library');assert.equal(a.currentTrial.previousQuery,'libary research');assert.equal(a.unsafeOption,undefined);assert.equal(a.currentTrial.unsafe,undefined);assert.equal(a.currentTrial.runningAtSave,true);
 assert.throws(()=>study.validateSession(JSON.stringify(a)),/Simulated data/);
});
test('synthetic restore stays paused and preserves active costs while wall time includes idle',()=>{
 const s=partial();study.pauseTrial(s,'manual',at(100));const raw=encoded(s),r=restoreSimulationRecording(raw,{wall:at(5100).wall,mono:0});
 assert.equal(r.currentTrial.activeSince,null);assert.equal(r.currentTrial.runningAtSave,false);assert.equal(r.currentTrial.activeMs,100);assert.equal(r.currentTrial.wallElapsedMs,5100);assert.equal(r.currentTrial.restored,true);assert.equal(r.currentTrial.pauseCount,1);
 study.resumeTrial(r,{wall:at(5100).wall,mono:0});study.completeTrial(r,null,{wall:at(5300).wall,mono:200});assert.equal(r.trials[0].activeElapsedMs,300);assert.equal(r.trials[0].wallElapsedMs,5300);assert.equal(r.trials[0].resumeCount,1);
});
test('restoring a running synthetic snapshot records recovery without resuming the clock',()=>{
 const r=restoreSimulationRecording(encoded(partial()),at(1000));assert.equal(r.currentTrial.activeSince,null);assert.equal(r.currentTrial.pauseReason,'restored');assert.equal(r.currentTrial.pauseCount,1);assert.equal(r.events.filter(e=>e.type==='session_restored').length,1);assert.equal(r.currentTrial.activeMs,100);
});
test('synthetic restore rejects human files, false provenance, unsupported schemas, malformed clocks and fabricated ratings',()=>{
 const good=JSON.parse(encoded(partial()));
 for(const change of [s=>delete s.dataOrigin,s=>s.dataOrigin='human',s=>s.runner='model',s=>s.format='searchassist-simulation-session',s=>s.calibrationStatus='validated',s=>s.schemaVersion=99,s=>s.currentTrial.activeMs=-1,s=>s.currentTrial.query=42,s=>s.ratingDraft.confidence=7,s=>s.ratingDraft.notes='invented',s=>s.humanRatings={},s=>s.ratings.push({trust:7})]){const bad=structuredClone(good);change(bad);assert.throws(()=>restoreSimulationRecording(JSON.stringify(bad)));}
 const human=study.snapshot(study.createSession(options,at(0)),at(0));assert.throws(()=>restoreSimulationRecording(JSON.stringify(human)),/Only tagged synthetic/);assert.equal(study.validateSession(JSON.stringify(human)).participant,options.participant);
});
test('all 18 assignments retain finished trials and empty rating blocks through synthetic restore',()=>{
 for(const order of study.orders)for(let setRotation=0;setRotation<3;setRotation++){
  let s=createSimulationSession({...options,order,setRotation},at(0));
  for(let i=0;i<12;i++){study.startTrial(s,at(i*100));study.completeTrial(s,study.taskAt(s).target,at(i*100+50));if(s.phase==='ratings'){s=restoreSimulationRecording(JSON.stringify(study.snapshot(s,at(i*100+50))),at(i*100+50));assert.deepEqual(s.ratings,[]);advanceSimulationBlock(s,at(i*100+50));}}
  const r=restoreSimulationRecording(JSON.stringify(study.snapshot(s,at(1300))),at(1400));assert.equal(r.phase,'complete');assert.equal(r.trials.length,12);assert.ok(r.trials.every(t=>t.success));assert.deepEqual(r.ratings,[]);assert.equal(r.currentTrial,null);
 }
});
test('interruption configuration validates injection points, bounded holds and native-visibility requirements',()=>{
 const f={taskIndex:1,afterAction:0,kind:'hidden',holdMs:300},input={profiles:['careful-scanner'],browser:{headed:true,interruptions:[f]}},c=validateBrowserConfig(input);f.kind='fake';assert.equal(c.browser.interruptions[0].kind,'hidden');
 for(const interruptions of [[{...c.browser.interruptions[0],holdMs:0}],[{taskIndex:13,afterAction:0,kind:'manual',holdMs:300}],[{taskIndex:1,afterAction:24,kind:'manual',holdMs:300}],[{taskIndex:1,afterAction:0,kind:'fake',holdMs:300}],[{taskIndex:1,afterAction:0,kind:'manual',holdMs:300,clockPatch:true}],[...c.browser.interruptions,...c.browser.interruptions]])assert.throws(()=>validateBrowserConfig({browser:{headed:true,interruptions}}));
 assert.throws(()=>validateBrowserConfig({browser:{interruptions:c.browser.interruptions}}),/requires headed/);
});
test('recovery exports retain synthetic labels, idle evidence, requested cells and separate modeled time',()=>{
 const r=simulate({profiles:['careful-scanner']});r.runner='browser';r.config.browser={assignmentSlots:[0],pacing:'none'};r.sessions=r.sessions.slice(0,1);r.sessions[0].trials[0].interruptions=[{id:'INT_001',kind:'manual',taskIndex:1,afterAction:0,holdMs:300,observedHoldMs:305,verified:true}];
 assert.equal(interruptionRows(r).length,1);assert.equal(summarizeRun(r).verifiedInterruptions,1);assert.match(renderSimulationReport(r),/Interruption and recovery checks/);assert.match(simulationPayloads(r).get('interruptions.csv'),/"synthetic","uncalibrated","browser"/);
});
test('recovery controller observes native visibility and does not patch clocks or dispatch fake visibility events',async()=>{
 const s=await readFile(new URL('../simulator/browser-interruptions.mjs',import.meta.url),'utf8');assert.ok(!/dispatchEvent|defineProperty|clock\.install|setSystemTime|\.evaluate\([^)]*=>\s*\{[^}]*sessionStorage\.setItem/s.test(s));assert.match(s,/document\.hidden/);assert.match(s,/bringToFront/);
});
