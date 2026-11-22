import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {simulate,simulateTrial} from '../simulator/runner.mjs';
import {validateConfig,resolveProfile,PROFILES} from '../simulator/config.mjs';
import {createPolicy} from '../simulator/policy.mjs';
import {scoreRecoveryEvidence,recoveryQueries} from '../simulator/recovery.mjs';
test('V3 outcome/action/cost/diagnostic bytes replay against the frozen V1.4 reference',async()=>{
 const ref=JSON.parse(await readFile(new URL('./fixtures/policy-v3-reference.json',import.meta.url),'utf8'));
 assert.equal(ref.sourceCommit,'b1389cf49ad55f140f161d61c0513cd588d4b573');
 for(const c of ref.cases){const r=simulate({masterSeed:c.seed,policyVersion:'v3'});assert.equal(createHash('sha256').update(JSON.stringify(r.sessions)).digest('hex'),c.sha256);}
});
test('attended title identity is general and cannot bypass the unchanged goal evidence gate',()=>{
 const yes=scoreRecoveryEvidence('Find emergency plumbing repairs.','Emergency plumbing repairs and water leaks.',{title:'Emergency Plumbing Repairs',query:'EPR',startingQuery:'EPR'});
 assert.equal(yes.queryCue,'attended-title-initials');assert.equal(yes.eligible,true);assert.equal(yes.goalOverlap,1);
 const no=scoreRecoveryEvidence('Find a city with five boroughs.','University engineering programs.',{title:'Massachusetts Institute of Technology',query:'MIT',startingQuery:'MIT'});
 assert.equal(no.queryCue,'attended-title-initials');assert.equal(no.eligible,false);assert.deepEqual(no.matchedTopicTerms,[]);
 assert.equal(scoreRecoveryEvidence('Find a directory entry.','Directory entry',{title:'Directory Entry',query:'directory entry'}).eligible,false);
 assert.equal(scoreRecoveryEvidence('Find emergency plumbing repairs.','Plumbing repairs.',{title:'Emergency Plumbing Repairs',query:'EPR',startingQuery:'EPR'}).querySupport,1);
 assert.equal(scoreRecoveryEvidence('Find emergency plumbing repairs.','Plumbing repairs.',{title:'Emergency Plumbing Repairs',query:'epr',startingQuery:'epr'}).querySupport,0);
});
test('plausible summaries receive one charged detail inspection; contradictory details remain rejected',()=>{
 const profile={...PROFILES['careful-scanner'],scanLimit:1,recognitionNoise:0,rankBias:0};
 const p=createPolicy('Find swimming pool opening hours and lane reservations.','pool',profile,()=>0.5,'v4');
 const o={epoch:0,query:'pool',totalResults:1,candidates:[{handle:'e0-r0',position:0}],explanationsAvailable:false,suggestionAvailable:false,undoAvailable:false,moreAvailable:false,openDetail:null};
 assert.equal(p.decide(o,{maxRewrites:0}).type,'read_card');p.receive({card:{handle:'e0-r0',position:0,kind:'card',title:'Aquatics Facility',text:'Swimming pool facilities.'}});
 assert.ok(p.inspect().score<profile.threshold);assert.equal(p.inspect().eligible,true);assert.equal(p.decide(o,{maxRewrites:0}).type,'open_details');
 const open={...o,openDetail:'e0-r0'};assert.equal(p.decide(open,{maxRewrites:0}).type,'read_details');
 p.receive({card:{handle:'e0-r0',position:0,kind:'details',title:'Aquatics Facility',text:'Unrelated directory entry for course schedules.'}});
 assert.equal(p.decide(open,{maxRewrites:0}).type,'close_details');assert.equal(p.decide(o,{maxRewrites:0}).type,'skip');
});
test('topical prompt rewrites replace generic instruction phrases without an answer dictionary',()=>{
 const queries=recoveryQueries('Find the department responsible for driver licenses and vehicle registration.','DMV','broad');
 assert.equal(queries[0],'department');assert.ok(!queries.includes('department responsible'));assert.ok(!queries.some(q=>q.includes('motor')));
});
test('a copied result title cannot create its own confidence evidence',()=>{
 const plain=scoreRecoveryEvidence('Find swimming pool opening hours.','Swimming pool facilities.',{title:'Aquatics Facility',startingQuery:'pool'});
 const copied=scoreRecoveryEvidence('Find swimming pool opening hours.','Swimming pool facilities.',{title:'Aquatics Facility',startingQuery:'pool',query:'Aquatics Facility'});
 assert.deepEqual(copied,plain);assert.equal(copied.querySupport,0);assert.equal(copied.queryCueOrigin,null);
 const original=scoreRecoveryEvidence('Find swimming pool opening hours.','Swimming pool facilities.',{title:'Aquatics Facility',startingQuery:'Aquatics Facility'});
 assert.equal(original.queryCue,'exact-attended-title');assert.equal(original.queryCueOrigin,'starting-query');
});
test('all four original model regressions recover without a lower threshold or larger budget',()=>{
 const old=simulate({profiles:['careful-scanner'],policyVersion:'v3'}),next=simulate({profiles:['careful-scanner'],policyVersion:'v4'});
 const lost=[['BCA',0,2],['CBA',0,2],['CAB',1,10],['BCA',2,6]];
 for(const [order,rotation,index] of lost){const a=old.sessions.find(s=>s.order===order&&s.setRotation===rotation).trials[index-1],b=next.sessions.find(s=>s.order===order&&s.setRotation===rotation).trials[index-1];
  assert.equal(a.termination,'time-budget');assert.equal(b.success,true);assert.equal(b.selectedId,'nyc');assert.ok(b.trace.some(a=>a.type==='read_details'));assert.ok(b.trace.find(a=>a.type==='submit').decisionEvidence.eligible);assert.ok(b.modeledActiveMs<120000);}
 assert.equal(next.resolvedProfiles['careful-scanner'].threshold,old.resolvedProfiles['careful-scanner'].threshold);assert.deepEqual(next.config.limits,old.config.limits);
});
test('generic false match remains rejected even with an exact title query, maximum rank and noise',()=>{
 const config=validateConfig({policyVersion:'v4',profiles:['careful-scanner'],limits:{maxRewrites:0},profileOverrides:{'careful-scanner':{rankBias:1,recognitionNoise:1,threshold:0}}});
 const record={id:'unrelated',title:'College Directory',description:'Directory entry for engineering courses.',category:'Resources',tags:[],aliases:[]};
 const t=simulateTrial({task:{type:'alias',prompt:'Find a city with five boroughs.',query:'College Directory',target:'absent'},condition:'A',profile:resolveProfile(config,'careful-scanner'),config,agentKey:['negative'],taskKey:['negative'],records:[record]});
 assert.equal(t.selectedId,null);assert.equal(t.skipped,true);assert.ok(!t.trace.some(a=>a.type==='open_details'));
});
test('new policy and recovery helpers remain independent of private records and evaluator answers',async()=>{
 for(const name of ['policy-v4.mjs','recovery.mjs']){const s=await readFile(new URL('../simulator/'+name,import.meta.url),'utf8');const imports=[...s.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);assert.ok(imports.every(i=>['./text.mjs','./relevance.mjs','./recovery.mjs'].includes(i)));assert.ok(!/sessionStorage|expectedTarget|targetId|\.record\.id|benchmarkCases/.test(s));}
});
