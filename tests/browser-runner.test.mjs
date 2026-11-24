import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBrowserConfig} from '../simulator/browser-config.mjs';
import {parseBrowserArguments} from '../simulator/browser-cli.mjs';
import {createSimulationSession,advanceSimulationBlock,simulationRecordingCsv,isSimulationRecording,SIMULATION_STORAGE_KEY} from '../dist/simulation-session.mjs';
import * as study from '../dist/study.mjs';
import {reconcileRecording} from '../simulator/browser-runner.mjs';
import {summarizeRun,trialRows,renderSimulationReport} from '../simulator/report.mjs';
import {simulate} from '../simulator/runner.mjs';
const assignment={participant:'SIM_QA',order:'ABC',setRotation:0},time={wall:Date.UTC(2026,10,21),mono:0};
function completed(){const s=createSimulationSession(assignment,time);for(let i=0;i<12;i++){study.startTrial(s,time);study.completeTrial(s,null,time);if(s.phase==='ratings')advanceSimulationBlock(s,time);}return s;}
test('browser configuration is bounded, detached, and rejects external/browser profile options',()=>{
 const input={profiles:['careful-scanner'],browser:{assignmentSlots:[0,7,14],pacing:'modeled',headed:true}},c=validateBrowserConfig(input);input.browser.assignmentSlots.push(1);assert.deepEqual(c.browser.assignmentSlots,[0,7,14]);assert.equal(c.runner,'browser');
 for(const bad of [{runner:'model'},{browser:{targetUrl:'https://example.com'}},{browser:{userDataDir:'/tmp/user'}},{browser:{assignmentSlots:[0,0]}},{browser:{assignmentSlots:[]}},{browser:{assignmentSlots:[18]}},{browser:{pacing:'human'}},{browser:{actionTimeoutMs:0}},{browser:{maxRunWallMs:Infinity}}])assert.throws(()=>validateBrowserConfig(bad));
});
test('browser CLI preserves common flags and validates its own options',()=>{
 const a=parseBrowserArguments(['--output','simulation-runs/qa','--headed','--pacing','modeled','--seed','123']);assert.equal(a.overrides.headed,true);assert.equal(a.values['--seed'],'123');assert.equal(a.overrides.pacing,'modeled');assert.deepEqual(parseBrowserArguments(['--help']),{help:true});
 for(const args of [['--headed','--headed'],['--pacing','fast'],['--url','https://example.com'],['--help','--headed']])assert.throws(()=>parseBrowserArguments(args));
});
test('synthetic browser sessions skip ratings without fabricating human responses or changing normal sessions',()=>{
 const s=completed();assert.ok(isSimulationRecording(s));assert.equal(s.phase,'complete');assert.equal(s.humanRatings,null);assert.deepEqual(s.ratings,[]);assert.equal(s.trials.length,12);assert.notEqual(SIMULATION_STORAGE_KEY,study.STORAGE_KEY);
 const h=study.createSession(assignment,time);study.startTrial(h,time);study.completeTrial(h,null,time);assert.throws(()=>advanceSimulationBlock(h,time));assert.equal(study.validateSession(JSON.stringify(study.snapshot(h,time))).dataOrigin,undefined);
 assert.throws(()=>study.validateSession(JSON.stringify(study.snapshot(s,time))),/Simulated data/);assert.match(simulationRecordingCsv(s,time),/"synthetic","uncalibrated","browser"/);
});
test('reconciliation checks selections, task assignments, edits, clocks and missing human ratings',()=>{
 const recording=study.snapshot(completed(),time),trials=recording.trials.map((t,i)=>({prompt:study.taskAt(recording,i).prompt,initialQuery:t.initialQuery,finalQuery:t.finalQuery,selectedId:null,resultOpens:0,termination:'agent-skip',suggestionsApplied:0,suggestionsUndone:0,trace:[]}));
 const result=reconcileRecording(recording,trials,assignment);assert.equal(result.length,12);assert.ok(result.every(t=>t.recordingVerified&&t.observedBrowserActiveMs===0));
 for(const alter of [s=>s.trials[0].selectedId='calendar',s=>s.trials[0].finalQuery='changed',s=>s.trials[0].queryReformulations=1,s=>s.trials[0].pauseCount=1,s=>s.humanRatings={},s=>s.ratings.push({trust:7}),s=>s.dataOrigin='human']){const bad=structuredClone(recording);alter(bad);assert.throws(()=>reconcileRecording(bad,trials,assignment));}
});
test('browser reports preserve observed zero, unavailable model timing and requested-cell coverage',()=>{
 const r=simulate({profiles:['careful-scanner']});r.runner='browser';r.config.runner='browser';r.config.browser={assignmentSlots:[0],pacing:'none'};r.sessions=r.sessions.slice(0,1);for(const t of r.sessions[0].trials){t.observedBrowserActiveMs=0;t.observedBrowserWallMs=12;}
 const summary=summarizeRun(r);assert.equal(summary.conditions[0].runner,'browser');assert.equal(summary.conditions[0].meanObservedBrowserActiveMs,0);assert.equal(summary.coverage.filter(c=>c.expectedSessions>0).length,1);assert.equal(trialRows(r)[0].observedBrowserWallMs,12);
 const html=renderSimulationReport(r);assert.match(html,/Recorded browser automation time/);assert.match(html,/pacing none/);assert.match(html,/Coverage: 1 \/ 1/);assert.doesNotMatch(html,/Browser measurements are unavailable/);
});
test('DOM adapter has no engine, evaluator or storage dependency; policy still has only text helpers',async()=>{
 const adapter=await readFile(new URL('../simulator/browser-adapter.mjs',import.meta.url),'utf8');assert.ok(!/from\s+['"]|sessionStorage|localStorage|targetId|expectedTarget|\.record\.id/.test(adapter));
 const policy=await readFile(new URL('../simulator/policy.mjs',import.meta.url),'utf8');assert.deepEqual([...policy.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]),['./policy-v2.mjs','./policy-v3.mjs','./policy-v4.mjs','./policy-v5.mjs','./policy-v5-1.mjs']);
});
