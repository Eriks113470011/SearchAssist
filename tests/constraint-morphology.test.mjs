import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {investigate} from '../simulator/investigate.mjs';
import {writeInvestigationArtifacts} from '../simulator/artifacts.mjs';
import {checkConstraints as original} from '../simulator/constraints.mjs';
import {checkConstraints as fixed} from '../simulator/constraints-v5-1.mjs';
import {validateConfig,resolveProfile,PROFILES} from '../simulator/config.mjs';
import {simulate,simulateTrial} from '../simulator/runner.mjs';
import {benchmarkCases} from '../simulator/benchmark-cases.mjs';
import {sha256} from '../simulator/validation.mjs';
import {validateConstraints} from '../simulator/constraint-validation.mjs';
import {investigationPayloads} from '../simulator/investigation-report.mjs';

test('V5.1 matches singular/plural audience nouns in both prompts and attended evidence',()=>{
 for(const audience of ['international','domestic','visiting','graduate','undergraduate'])for(const promptNoun of ['student','students'])for(const evidenceNoun of ['student','students']){
  const goal=`Find housing grants for ${audience} ${promptNoun}.`,text=`Housing grants for ${audience} ${evidenceNoun}.`;
  assert.equal(fixed(goal,text).qualified,true,goal+' / '+text);
 }
 for(const noun of ['student','students'])assert.equal(fixed('Find workshop bookings for students.',`Workshop bookings for ${noun}.`).qualified,true);
 const goal='Find the international student advising office.',text='Office for international student advising.';
 assert.equal(original(goal,text).qualified,false);assert.equal(fixed(goal,text).qualified,true);
 assert.equal(fixed(goal,text).requirements[0].evidence,'office for international student advising');
});
test('plural equivalence keeps exclusions, qualification boundaries and missing-evidence gates',()=>{
 for(const noun of ['student','students']){
  const result=fixed('Find housing grants for international students.',`Housing grants. International ${noun} are ineligible.`);
  assert.equal(result.qualified,false);assert.equal(result.requirements[0].status,'contradicted');
  assert.equal(fixed('Find housing grants for visiting students.',`Housing grants for permanent staff only. Visiting ${noun} are ineligible.`).qualified,false);
 }
 for(const text of ['Housing grants for international studentships.','Housing grants for international studentss.','Housing grants for domestic students only.','Housing grants and payment instructions.'])assert.equal(fixed('Find housing grants for international students.',text).qualified,false,text);
 assert.equal(fixed('Find graduate scholarships.','Undergraduate scholarships only.').qualified,false);
 assert.equal(fixed('Find east campus housing grants for visiting students.','West campus housing grants for visiting student.').qualified,false);
});
test('the patch changes only the version and audience matching, preserving the frozen decision procedure',async()=>{
 const previous=await readFile(new URL('../simulator/policy-v5.mjs',import.meta.url),'utf8');
 const patched=await readFile(new URL('../simulator/policy-v5-1.mjs',import.meta.url),'utf8');
 assert.equal(patched.replace("from './constraints-v5-1.mjs'","from './constraints.mjs'").replace('createPolicyV51(','createPolicyV5('),previous);
 const source=await readFile(new URL('../simulator/constraints-v5-1.mjs',import.meta.url),'utf8');
 assert.ok([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].every(m=>['./text.mjs','./relevance.mjs'].includes(m[1])));
 assert.ok(!/acceptableIds|expectedTarget|\.record\.id|sessionStorage/.test(source));
 const oldChecker=await readFile(new URL('../simulator/constraints.mjs',import.meta.url),'utf8');
 const restored=source.replace('public-constraint-evidence-v1.1','public-constraint-evidence-v1').replace(/const token=\(s,t\)=>\{[\s\S]*?\n\};/,oldChecker.match(/^const token=.*;$/m)[0]);
 assert.equal(restored,oldChecker);
 const freeze=JSON.parse(await readFile(new URL('../simulator/constraint-v5-1-freeze.json',import.meta.url),'utf8'));
 for(const f of freeze.sourceFiles)assert.equal(sha256(await readFile(new URL('../'+f.path,import.meta.url))),f.sha256,f.path);
});
test('original V5 still replays the complete prepatch actions, costs and diagnostics',async()=>{
 const ref=JSON.parse(await readFile(new URL('./fixtures/policy-v5-reference.json',import.meta.url),'utf8'));
 for(const c of ref.cases){const r=simulate({masterSeed:c.seed,policyVersion:'v5'});assert.equal(r.sessions.length,c.sessions);assert.equal(sha256(JSON.stringify(r.sessions)),c.sha256);}
});
test('all historical sanity cases retain accepted outcomes; the advising case recovers 90 of 90 with paid evidence',()=>{
 const cases=benchmarkCases();let restored=0,originalAccepted=0,total=0;
 for(const seed of [201,202,203,204,205])for(const profile of Object.keys(PROFILES))for(const c of cases)for(const condition of ['A','B','C']){
  const outcomes={};
  for(const policyVersion of ['v4','v5','v5.1']){
   const config=validateConfig({masterSeed:seed,policyVersion,profiles:[profile]});
   const t=simulateTrial({task:{type:c.type,prompt:c.prompt,query:c.query,target:null},condition,profile:resolveProfile(config,profile),config,agentKey:['benchmark',profile,c.id],taskKey:[c.id],records:c.records});
   outcomes[policyVersion]={accepted:c.acceptableIds.length?c.acceptableIds.includes(t.selectedId):t.skipped,trial:t};
  }
  for(const previous of ['v4','v5'])if(outcomes[previous].accepted)assert.equal(outcomes['v5.1'].accepted,true,[seed,profile,c.id,condition,previous].join('/'));
  if(c.id==='heldout-alias'){
   total++;originalAccepted+=Number(outcomes.v5.accepted);restored+=Number(outcomes['v5.1'].accepted);
   const t=outcomes['v5.1'].trial,submit=t.trace.find(a=>a.type==='submit');
   assert.equal(submit.decisionEvidence.constraints.qualified,true);assert.equal(submit.decisionEvidence.detailsVerified,true);
   assert.ok(t.trace.some(a=>a.type==='read_details'&&a.handle===submit.handle&&a.durationMs>0));
  }
 }
 assert.equal(total,90);assert.equal(originalAccepted,0);assert.equal(restored,90);
});
test('V5.1 comparisons label reused evaluation fixtures honestly and retain paired before/after versions',async()=>{
 const r=await validateConstraints({seeds:[201],profiles:['careful-scanner'],conditions:['B'],recordOrders:['original'],caseIds:['eval-international'],policyVersions:['v5','v5.1']});
 assert.deepEqual(r.rows.map(t=>t.policyVersion),['v5','v5.1']);assert.equal(r.pairs.length,1);
 assert.match(r.evaluationDescription,/reused regression fixtures/);
});
test('investigation reports surface older sanity-suite regressions at the case level',()=>{
 const old=JSON.parse('{"config":{"seeds":[201],"policyVersions":["v5","v5.1"],"variants":["baseline"],"simulation":{"profiles":["careful-scanner"],"runner":"model"}},"runs":[],"observations":[],"pairs":[],"benchmark":[]}');
 old.observations=[{seed:201,policyVersion:'v5',variant:'baseline',condition:'B',profile:'careful-scanner',taskType:'alias',outcome:'correct',modeledActiveMs:1,manualRewrites:0}];old.pairs=[{comparison:'policy',beforePolicy:'v5',afterPolicy:'v5.1',beforeVariant:'baseline',afterVariant:'baseline',beforeOutcome:'correct',afterOutcome:'skipped'}];
 old.runs=[{seed:201,policyVersion:'v5',variant:'baseline'},{seed:201,policyVersion:'v5.1',variant:'baseline'}];
 old.observations.push({...old.observations[0],policyVersion:'v5.1',outcome:'skipped'});
 old.benchmark=[{seed:201,policyVersion:'v5',profile:'careful-scanner',condition:'B',caseId:'advising',split:'held-out',accepted:true},{seed:201,policyVersion:'v5.1',profile:'careful-scanner',condition:'B',caseId:'advising',split:'held-out',accepted:false}];
 const html=investigationPayloads(old).get('report.html');assert.match(html,/Sanity-suite regressions.*1/);assert.match(html,/Sanity-suite warning/);assert.match(html,/Case-level sanity outcomes/);assert.match(html,/advising/);
});

test('independent verifier rejects an accuracy regression even when artifact hashes and structure are valid',async()=>{
 const r=await investigate({seeds:[201],policyVersions:['v4','v5.1'],variants:['baseline'],simulation:{profiles:['careful-scanner']}});
 const root=await mkdtemp(join(tmpdir(),'searchassist-v51-guard-'));
 const verify=folder=>spawnSync('python3',[fileURLToPath(new URL('./verify-investigation.py',import.meta.url)),folder],{encoding:'utf8'});
 try{
  const passing=join(root,'passing');await writeInvestigationArtifacts(r,{root,output:passing});const pass=verify(passing);assert.equal(pass.status,0,pass.stderr);
  const changed=structuredClone(r);changed.benchmark.find(t=>t.policyVersion==='v5.1'&&t.caseId==='heldout-alias').accepted=false;
  const failing=join(root,'failing');await writeInvestigationArtifacts(changed,{root,output:failing});const failed=verify(failing);
  assert.notEqual(failed.status,0);assert.match(failed.stderr,/V5\.1 sanity regression|Advising regression/);
 }finally{await rm(root,{recursive:true,force:true});}
});
