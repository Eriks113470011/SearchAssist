import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {simulate} from '../simulator/runner.mjs';
import {createPolicy} from '../simulator/policy.mjs';
import {scoreEvidence} from '../simulator/relevance.mjs';
import {PROFILES} from '../simulator/config.mjs';
import {validateInvestigation,investigate} from '../simulator/investigate.mjs';
import {investigationPayloads} from '../simulator/investigation-report.mjs';
import {diagnoseTrial,renderFailureInspector} from '../simulator/diagnostics.mjs';
import {benchmarkCases} from '../simulator/benchmark-cases.mjs';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).filter(k=>!['diagnosis','decisionEvidence','evidenceAfter'].includes(k)).sort().map(k=>[k,canonical(x[k])])):x;
test('legacy V2 reproduces frozen V1.3 outcomes, actions and all modeled costs across two seeds/all profiles/assignments',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/policy-v2-reference.json',import.meta.url),'utf8'));
 assert.equal(fixture.sourceCommit,'dbc0993c4c52dd0cd3a9c475cd546832a7ee71ee');
 for(const c of fixture.cases){const r=simulate({masterSeed:c.seed,policyVersion:'v2'});assert.equal(r.modelVersion,'bounded-search-policies-v2');assert.equal(r.sessions.length,c.sessions);
  const data=r.sessions.map(s=>({profile:s.profile,order:s.order,setRotation:s.setRotation,trials:s.trials}));
  assert.equal(createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex'),c.sha256);}
});
test('generic wording and UI boilerplate do not establish topical evidence; meaningful overlap remains usable',()=>{
 assert.equal(scoreEvidence('Find emergency plumbing repairs.','Emergency Plumbing Repairs and water leaks.').eligible,true);
 const s=scoreEvidence('Find a city with five boroughs in the directory.','DIRECTORY ENTRY College Directory. This is a synthetic entry in the SearchAssist study directory. It does not open an external service.');
 assert.equal(s.eligible,false);assert.deepEqual(s.matchedTopicTerms,[]);assert.ok(s.overlap<0.25);
 assert.equal(scoreEvidence('Find the directory entry.','Directory entry').eligible,false);
});
test('rank and noise cannot bypass the topic gate; details must independently support a selection',()=>{
 const profile={...PROFILES['careful-scanner'],scanLimit:1,threshold:0,rankBias:1,recognitionNoise:1};
 const o={epoch:0,totalResults:1,candidates:[{handle:'e0-r0',position:0}],explanationsAvailable:false,suggestionAvailable:false,undoAvailable:false,moreAvailable:false,openDetail:null};
 const p=createPolicy('Find emergency plumbing repairs.','repairs',profile,()=>1,'v3');
 assert.equal(p.decide(o,{maxRewrites:0}).type,'read_card');p.receive({card:{handle:'e0-r0',position:0,kind:'card',text:'Directory entry for unrelated campus information.'}});
 assert.equal(p.decide(o,{maxRewrites:0}).type,'skip');assert.equal(p.inspect().eligible,false);
 const q=createPolicy('Find emergency plumbing repairs.','repairs',profile,()=>1,'v3');q.decide(o,{maxRewrites:0});q.receive({card:{handle:'e0-r0',position:0,kind:'card',text:'Emergency plumbing repairs.'}});
 assert.equal(q.decide(o,{maxRewrites:0}).type,'open_details');const open={...o,openDetail:'e0-r0'};assert.equal(q.decide(open,{maxRewrites:0}).type,'read_details');
 q.receive({card:{handle:'e0-r0',position:0,kind:'details',text:'Directory entry for unrelated information.'}});assert.equal(q.decide(open,{maxRewrites:0}).type,'close_details');assert.equal(q.inspect().source,'details');
});
test('diagnostics distinguish unavailable, unattended, rejected and budget-stopped targets after decisions',()=>{
 const records=[{id:'bike',title:'Bicycle Parking',description:'Secure bicycle spaces.',category:'Resources',tags:[],aliases:[]}];
 const t={condition:'A',expectedTargetId:'bike',initialQuery:'nothing',finalQuery:'nothing',trace:[],success:false,incorrectSelection:false,termination:'agent-skip'};
 assert.equal(diagnoseTrial(t,records).category,'target-not-returned');
 const available={...t,initialQuery:'bicycle',finalQuery:'bicycle'};assert.equal(diagnoseTrial(available,records).category,'target-not-inspected');
 const attended={...available,trace:[{type:'read_card',handle:'e0-r0',queryBefore:'bicycle',attendedText:'Bicycle Parking'}]};assert.equal(diagnoseTrial(attended,records).category,'target-inspected-not-selected');
 assert.equal(diagnoseTrial({...attended,termination:'time-budget'},records).category,'time-budget');
});
test('investigation validation is strict, bounded and its resolved configuration replays',()=>{
 const c=validateInvestigation({seeds:[42],simulation:{profiles:['careful-scanner']},variants:['baseline']});assert.deepEqual(validateInvestigation(c),c);
 for(const bad of [{policyVersions:['v3','v3']},{policyVersions:['v1','v4']},{policyVersions:['v2','v3','v4']},{seeds:[]},{seeds:[42,42]},{seeds:[-1]},{extra:true},{variants:['unknown']},{variants:['no-typing-errors']},{simulation:{policyVersion:'v2'}},{variants:['baseline','no-interruptions']},{seeds:Array.from({length:11},(_,i)=>i)},{seeds:[1,2],simulation:{runner:'browser'},variants:['baseline']}])assert.throws(()=>validateInvestigation(bad));
});
test('paired policy/control comparisons retain all outcomes and isolate each requested override',async()=>{
 const r=await investigate({seeds:[42],simulation:{profiles:['careful-scanner']},policyVersions:['v2','v3'],variants:['baseline','no-recognition-noise','no-typing-errors']});
 assert.equal(r.runs.length,6);assert.equal(r.observations.length,1296);assert.equal(r.pairs.length,1512);assert.equal(r.benchmark.length,60);
 assert.deepEqual(r.runs.map(run=>run.config.policyVersion),['v2','v2','v2','v3','v3','v3']);
 for(const run of r.runs){const p=run.config.profileOverrides['careful-scanner'];if(run.variant==='no-recognition-noise')assert.deepEqual(p,{recognitionNoise:0});if(run.variant==='no-typing-errors')assert.deepEqual(p,{typingErrorRate:0});}
 assert.ok(r.pairs.some(p=>p.beforeOutcome==='wrong'&&p.afterOutcome==='skipped'));
 const files=investigationPayloads(r);assert.ok(files.get('report.html').includes('SIMULATED / UNCALIBRATED'));assert.ok(files.get('report.html').includes('not isolated causal estimates'));assert.ok(files.get('comparisons.csv').includes('beforeOutcome'));
 const replay=await investigate(JSON.parse(files.get('config.json')));assert.deepEqual(replay,r);
});
test('policy modules have no imports of directory, engine, recorder or evaluator and fixture expectations stay outside them',async()=>{
 for(const file of ['policy-v2.mjs','policy-v3.mjs','relevance.mjs']){const source=await readFile(new URL('../simulator/'+file,import.meta.url),'utf8');const imports=[...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);assert.ok(imports.every(i=>['./text.mjs','./relevance.mjs'].includes(i)));assert.ok(!/expectedTarget|targetId|sessionStorage|benchmarkCases/.test(source));}
 const cases=benchmarkCases();assert.equal(cases.filter(c=>c.split==='held-out').length,6);assert.equal(cases.find(c=>c.type==='ambiguous').acceptableIds.length,2);
});
test('failure inspector escapes attended text and query input while retaining synthetic provenance',()=>{
 const trial={success:false,taskIndex:1,condition:'A',prompt:'<script>alert(1)</script>',expectedTargetId:'safe',selectedId:null,termination:'agent-skip',trace:[{type:'rewrite',reason:'<img>',queryAfter:'<script>'}],diagnosis:{category:'target-not-returned',queries:[{query:'<svg>',resultCount:0,targetRank:null}]}};
 const html=renderFailureInspector({modelVersion:'v3',config:{masterSeed:42},sessions:[{participant:'SIM_1',profile:'careful-scanner',trials:[trial]}]});assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('SIMULATED / UNCALIBRATED'));
});
