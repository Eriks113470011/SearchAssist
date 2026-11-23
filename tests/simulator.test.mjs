import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateConfig,resolveProfile,PROFILES} from '../simulator/config.mjs';
import {randomUnit,triangular} from '../simulator/random.mjs';
import {createModelAdapter} from '../simulator/model-adapter.mjs';
import {simulate,simulateTrial} from '../simulator/runner.mjs';
import {summarizeRun,simulationPayloads,renderSimulationReport} from '../simulator/report.mjs';
import {parseArguments} from '../simulator/cli.mjs';
import {createSession,snapshot,validateSession} from '../dist/study.mjs';
import {reviewFiles} from '../dist/workspace.mjs';
import {parseProject} from '../dist/review-project.mjs';
const config=validateConfig({profiles:['careful-scanner']}),profile=resolveProfile(config,'careful-scanner');
const records=[
 {id:'a',title:'Calendar Settings',category:'Tools',description:'Change calendar event reminders and preferences.',tags:['calendar'],aliases:[]},
 {id:'b',title:'Calendar ZArchive',category:'Resources',description:'Read historical event records.',tags:['archive'],aliases:[]}
];
const task={type:'spelling',prompt:'Find calendar event reminders and preferences.',query:'calendar',target:'a'};
const trial=(overrides={})=>simulateTrial({task,condition:'B',profile:{...profile,threshold:0,recognitionNoise:0,scanLimit:1},config,agentKey:['test'],taskKey:['task'],records,...overrides});
let cached;
const smoke=()=>cached??=simulate({profiles:['careful-scanner']});

test('configuration is strict, synthetic, bounded, and detached from supplied objects',()=>{
  const input={profiles:['careful-scanner'],timing:{keyMs:[1,2,3]},profileOverrides:{'careful-scanner':{scanLimit:2}}},c=validateConfig(input);
  input.timing.keyMs[0]=99;assert.deepEqual(c.timing.keyMs,[1,2,3]);assert.equal(resolveProfile(c,'careful-scanner').scanLimit,2);
  assert.equal(c.dataOrigin,'synthetic');assert.equal(c.calibrationStatus,'uncalibrated');assert.equal(c.runner,'model');
  for(const bad of [{extra:true},{dataOrigin:'human'},{calibrationStatus:'validated'},{runner:'browser'},{schemaVersion:2},{profiles:[]},{profiles:['constructor']},{profiles:['careful-scanner','careful-scanner']},{masterSeed:-1},{masterSeed:NaN},{replicates:11},{replicates:4},{limits:{maxActionsPerTrial:Infinity}},{timing:{wordMs:[3,2,1]}},{timing:{keyMs:[0,1,2]}},{profileOverrides:{'careful-scanner':{threshold:2}}},{profileOverrides:{'careful-scanner':{targetId:'a'}}}])assert.throws(()=>validateConfig(bad));
});
test('randomness replays by key and is not shifted by extra timing draws',()=>{
  const a=randomUnit(42,'recognition',1);randomUnit(42,'timing',99);assert.equal(randomUnit(42,'recognition',1),a);
  assert.notEqual(randomUnit(43,'recognition',1),a);assert.notEqual(randomUnit(42,'recognition',2),a);assert.ok(a>=0&&a<1);
  assert.equal(triangular([2,2,2],0.4),2);assert.equal(triangular([1,2,3],0),1);assert.equal(triangular([1,2,3],0.5),2);
});
test('model observations hide IDs, targets, uninspected text, ranking scores and private aliases',()=>{
  const a=createModelAdapter({condition:'C',initialQuery:'calendar',records}),o=a.observe(),text=JSON.stringify(o);
  assert.ok(!text.includes('Calendar Settings'));assert.ok(!text.includes('score'));assert.ok(!text.includes('target'));assert.deepEqual(o.candidates.map(c=>c.handle),['e0-r0','e0-r1']);
  const inspected=a.execute({type:'read_card',handle:o.candidates[0].handle});assert.match(inspected.card.text,/Calendar Settings/);assert.ok(!Object.hasOwn(inspected.card,'recordId'));
});
test('adapter exposes correction and undo only where the real guided controls permit them',()=>{
  for(const condition of ['A','B']){const a=createModelAdapter({condition,initialQuery:'calender',records});assert.equal(a.observe().suggestionAvailable,false);assert.throws(()=>a.preview({type:'read_suggestion'}));}
  const a=createModelAdapter({condition:'C',initialQuery:'calender',records}),old=a.observe().candidates[0].handle;
  assert.equal(a.observe().suggestionAvailable,true);assert.equal(a.execute({type:'read_suggestion'}).suggestion.query,'calendar');
  a.execute({type:'apply_suggestion'});assert.equal(a.observe().query,'calendar');assert.equal(a.observe().undoAvailable,true);assert.throws(()=>a.preview({type:'read_card',handle:old}),/stale/);
  a.execute({type:'undo_suggestion'});assert.equal(a.observe().query,'calender');assert.equal(a.observe().undoAvailable,false);
});
test('submission requires opening the actual detail control; modal controls are respected',()=>{
  const a=createModelAdapter({condition:'A',initialQuery:'calendar',records}),handle=a.observe().candidates[0].handle;
  assert.throws(()=>a.preview({type:'submit',handle}),/open detail/);a.execute({type:'open_details',handle,read:false});
  assert.throws(()=>a.preview({type:'rewrite',query:'archive'}),/Close/);a.execute({type:'submit',handle});assert.equal(a.selectionId(handle),'a');
});
test('changing only the hidden evaluator target cannot change policy actions or timing',()=>{
  const a=trial(),b=trial({task:{...task,target:'b'}});
  assert.equal(a.success,true);assert.equal(b.success,false);assert.equal(b.incorrectSelection,true);assert.deepEqual(a.trace,b.trace);assert.deepEqual(a.ledger,b.ledger);
});
test('opaque result ID permutation leaves observed decisions equivalent',()=>{
  const a=trial(),b=trial({records:records.map(r=>({...r,id:r.id==='a'?'other-a':'other-b'})),task:{...task,target:'other-a'}});
  assert.equal(a.success,true);assert.equal(b.success,true);assert.deepEqual(a.trace,b.trace);assert.equal(b.selectedId,'other-a');
});
test('the policy source cannot import answers, the engine, dataset or evaluator',async()=>{
  const text=await readFile(new URL('../simulator/policy.mjs',import.meta.url),'utf8');
  const imports=[...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);assert.deepEqual(imports,['./text.mjs']);
  assert.ok(!/targetId|expectedTarget|sessionStorage|condition\s*===/.test(text));
});
test('unused C capabilities confer no automatic success or time bonus',()=>{
  const p={...profile,threshold:0,recognitionNoise:0,scanLimit:1,verifyDetails:false,explanationAttention:0,suggestionAcceptance:0};
  const b=trial({condition:'B',profile:p}),c=trial({condition:'C',profile:p});assert.deepEqual(b,c);
});
test('additional explanation reading has a cost when the outcome does not change',()=>{
  const p={...profile,threshold:0,recognitionNoise:0,scanLimit:1,suggestionAcceptance:0};
  const b=trial({condition:'B',profile:p}),c=trial({condition:'C',profile:{...p,explanationAttention:1}});
  assert.equal(b.success,c.success);assert.ok(c.trace.some(a=>a.type==='read_explanation'));assert.ok(c.modeledActiveMs>b.modeledActiveMs);
});
test('all six profiles cover all 18 order/rotation cells with 12 tasks and no human ratings',()=>{
  const r=simulate(),s=summarizeRun(r);assert.equal(r.sessions.length,108);assert.equal(s.totalTrials,1296);assert.equal(s.coverage.length,108);
  assert.ok(s.coverage.every(c=>c.expectedSessions===1&&c.actualSessions===1));assert.equal(Object.keys(r.resolvedProfiles).length,6);
  assert.ok(r.sessions.every(s=>s.humanRatings===null&&s.dataOrigin==='synthetic'&&s.trials.length===12));
  assert.ok(s.conditions.every(c=>c.successes+c.incorrectSelections+c.skips===c.trials));
});
test('seeded runs and operator ledgers replay exactly without browser clocks',()=>{
  const a=smoke(),b=simulate({profiles:['careful-scanner']});assert.deepEqual(a,b);
  assert.notDeepEqual(simulate({profiles:['careful-scanner'],masterSeed:43}).sessions[0].trials[0].ledger,a.sessions[0].trials[0].ledger);
  for(const s of a.sessions)for(const t of s.trials){assert.equal(t.ledger.reduce((n,r)=>n+r.durationMs,0),t.modeledActiveMs);assert.equal(t.observedBrowserActiveMs,null);assert.equal(t.observedBrowserWallMs,null);assert.equal(t.ledger[0]?.keyCount??0,0);}
});
test('ledger components sum exactly, and every completed action costs nonnegative finite milliseconds',()=>{
  for(const s of smoke().sessions)for(const t of s.trials)for(const x of t.ledger){assert.equal(x.readingMs+x.decisionMs+x.typingMs+x.pointClickMs+x.systemWaitMs,x.durationMs);assert.ok(Number.isFinite(x.durationMs)&&x.durationMs>0);}
});
test('no-result, limited recovery and stopping budgets retain explicit failure outcomes',()=>{
  const empty=trial({records:[],config:validateConfig({profiles:['careful-scanner'],limits:{maxRewrites:0}})});
  assert.equal(empty.termination,'agent-skip');assert.equal(empty.success,false);assert.equal(empty.selectedId,null);
  const timed=trial({config:validateConfig({profiles:['careful-scanner'],limits:{maxModeledActiveMs:1000}})});assert.equal(timed.termination,'time-budget');assert.ok(timed.modeledActiveMs<=1000);
  const budget=trial({task:{...task,prompt:'something unrelated',query:'nothing'},records:[],config:validateConfig({profiles:['careful-scanner'],limits:{maxActionsPerTrial:4,maxRewrites:8}})});assert.ok(budget.actions<=4);assert.ok(['action-budget','agent-skip'].includes(budget.termination));
});
test('incorrect selections are possible without consulting the answer key',()=>{
  const r=trial({task:{...task,target:'b'}});assert.equal(r.incorrectSelection,true);assert.equal(r.skipped,false);assert.equal(r.termination,'submitted');
});
test('typing slip scenarios operate on generated rewrites and remain recoverable',()=>{
  const c=validateConfig({profiles:['careful-scanner'],limits:{maxRewrites:4},profileOverrides:{'careful-scanner':{typingErrorRate:1}}});
  const t=trial({task:{...task,query:'zzzz'},profile:resolveProfile(c,'careful-scanner'),config:c});
  assert.ok(t.trace.some(a=>a.type==='rewrite'&&a.typingSlip===true));assert.ok(t.manualRewrites<=4);
});
test('synthetic sessions and whole runs cannot enter human study, review or project imports',()=>{
  for(const payload of [smoke(),smoke().sessions[0]]) {
    const text=JSON.stringify(payload);assert.throws(()=>validateSession(text),/Simulated data/);assert.equal(reviewFiles([{name:'SIM.json',text}])[0].session,null);assert.throws(()=>parseProject(text),/workspace/);
  }
});
test('reports and CSVs retain synthetic labels, human-rating absence, counts and missing browser measures',()=>{
  const run=smoke(),payloads=simulationPayloads(run),summary=summarizeRun(run),html=renderSimulationReport(run);
  assert.equal(summary.totalTrials,216);assert.equal(payloads.get('trials.csv').split('\r\n').length,217);assert.equal(payloads.get('coverage.csv').split('\r\n').length,19);
  assert.match(html,/SIMULATED \/ UNCALIBRATED/);assert.match(html,/Human ratings are unavailable/);assert.ok(!/<(?:script|img|link)\b/.test(html));
  for(const path of ['trials.csv','conditions.csv','profiles.csv','coverage.csv'])assert.match(payloads.get(path),/"synthetic","uncalibrated","model"/);
  assert.equal(JSON.parse(payloads.get('run.json')).humanRatings,null);assert.equal([...payloads.keys()].filter(k=>k.startsWith('sessions/')).length,18);
});
test('CLI rejects unknown options, duplicate flags and incomplete configuration arguments',()=>{
  assert.deepEqual(parseArguments(['--help']),{help:true});
  for(const args of [[],['--bad','x'],['--output'],['--output','a','--output','b'],['--output','simulation-runs/a','--seed','NaN']])assert.throws(()=>parseArguments(args));
});
test('CLI writes a fresh isolated run with independently verified manifest hashes and refuses overwrite',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'searchassist-sim-')),cli=resolve('simulator/cli.mjs'),args=[cli,'--output','simulation-runs/test-run','--profile','careful-scanner'];
  const out=JSON.parse(execFileSync(process.execPath,args,{cwd,encoding:'utf8'}));assert.equal(out.simulatedSessions,18);assert.equal(out.totalTrials,216);
  const root=join(cwd,'simulation-runs/test-run'),manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  for(const f of manifest.files){const b=await readFile(join(root,f.path));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}
  assert.ok(manifest.sourceFiles.some(f=>f.path==='simulator/policy.mjs'));assert.ok(manifest.sourceIdentity.includes('sha256'));
  assert.equal((await readdir(join(root,'sessions'))).length,18);
  const again=spawnSync(process.execPath,args,{cwd,encoding:'utf8'});assert.notEqual(again.status,0);assert.match(again.stderr,/already exists/);
  const unsafe=spawnSync(process.execPath,[cli,'--output','../unsafe'],{cwd,encoding:'utf8'});assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/safe-name/);
});

test('synthetic origin flags on otherwise valid legacy recordings are rejected before metadata stripping',()=>{
  const clock={wall:Date.UTC(2026,10,21),mono:0},raw=snapshot(createSession({participant:'LEGACY_QA',order:'ABC',setRotation:0},clock),clock);
  assert.equal(validateSession(JSON.stringify(raw)).participant,'LEGACY_QA');
  assert.throws(()=>validateSession(JSON.stringify({...raw,dataOrigin:'synthetic'})),/Simulated data/);
  assert.throws(()=>validateSession(JSON.stringify({...raw,format:'searchassist-simulation-session'})),/Simulated data/);
});
