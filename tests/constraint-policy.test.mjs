import test from 'node:test';
import {withoutV51Registration} from './frozen-source.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkConstraints,extractRequirements} from '../simulator/constraints.mjs';
import {createPolicy} from '../simulator/policy.mjs';
import {validateConfig,resolveProfile,PROFILES,DEFAULT_CONFIG} from '../simulator/config.mjs';
import {simulateTrial} from '../simulator/runner.mjs';
import {loadConstraintCases,validateConstraintConfig,validateConstraints,FRESH_CASE_SHA256} from '../simulator/constraint-validation.mjs';
import {sha256} from '../simulator/validation.mjs';
import {validationPayloads} from '../simulator/validation-report.mjs';

test('extracts public requirements and demands affirmative evidence beyond titles',()=>{
 const rs=extractRequirements('Find current north campus evening grants for visiting students.');
 assert.deepEqual(rs.map(r=>r.kind).sort(),['availability','eligibility','location','timing']);
 const title='North Campus Evening Grants';
 assert.equal(checkConstraints('Find north campus evening grants.',title,{title}).qualified,false);
 assert.equal(checkConstraints('Find north campus evening grants.','North campus evening grants are available.').qualified,true);
 assert.equal(checkConstraints('Find north campus evening grants.','Grants are available.').reason,'missing-required-evidence');
});
test('rejects scoped location, time, availability and eligibility contradictions',()=>{
 for(const [goal,text] of [
  ['Find west campus room bookings.','East campus room bookings only. West campus is not served.'],
  ['Find evening room bookings.','Evening room bookings are unavailable.'],
  ['Find open room bookings.','Room bookings are closed.'],
  ['Find room bookings for visiting students.','Room bookings for staff only. Visiting students are ineligible.'],
  ['Find document renewal appointments.','Document renewal appointments are not offered.'],
  ['Find equipment reservations.','No equipment reservations.'],
  ['Find current travel forms.','Archived travel forms.'],
  ['Find graduate scholarships.','Undergraduate scholarships only.']
 ]){const c=checkConstraints(goal,text);assert.equal(c.qualified,false,text);assert.ok(c.contradiction||c.reason==='missing-required-evidence',text);}
});
test('closure on another day and nonexclusive or optional rules do not become blanket bans',()=>{
 for(const [goal,text] of [
  ['Find Monday museum tour bookings.','Museum tour bookings are available Monday. Closed on Sundays.'],
  ['Find studio reservations for students.','Studio reservations are not only for staff; students are eligible.'],
  ['Find walk in museum tours.','Walk in museum tours are available. No appointments required.'],
  ['Find north campus studio bookings.','North campus studio bookings are available; advance registration is not required.']
 ])assert.equal(checkConstraints(goal,text).qualified,true,text);
});
const fixture=(descriptions,answers=['r2'])=>({task:{type:'test',prompt:'Find east campus locker rentals.',query:'Locker Rentals',target:answers[0]??null},records:descriptions.map((d,i)=>({id:'r'+(i+1),title:'Locker Rentals',category:'Resources',description:d,tags:[],aliases:[]}))});
function run(f,condition='A',name='first-result-chooser'){
 const config=validateConfig({masterSeed:201,policyVersion:'v5',profiles:[name]});
 return simulateTrial({...f,condition,profile:resolveProfile(config,name),config,agentKey:['unit'],taskKey:['unit']});
}
test('rejects a contradictory first result, inspects an alternative, and pays for details in all A/B/C',()=>{
 const f=fixture(['Locker rentals for west campus only. East campus is not served.','Locker rentals for east campus.']);
 for(const condition of ['A','B','C']){
  const t=run(f,condition);assert.equal(t.selectedId,'r2');
  assert.ok(t.trace.some(a=>a.evidenceAfter?.constraints?.contradiction));
  const submit=t.trace.find(a=>a.type==='submit');assert.equal(submit.decisionEvidence.constraints.qualified,true);assert.equal(submit.decisionEvidence.detailsVerified,true);
  assert.ok(t.trace.some(a=>a.type==='read_details'&&a.handle===submit.handle&&a.durationMs>0));
  assert.equal(t.modeledActiveMs,t.ledger.reduce((n,l)=>n+l.durationMs,0));
 }
});
test('none qualifying yields abstention; missing requirements cannot be overcome by rank or recognition noise',()=>{
 for(const descriptions of [['Locker rentals for west campus only.'],['Locker rentals and payment instructions.']]){
  const t=run(fixture(descriptions,[]));assert.equal(t.selectedId,null);assert.ok(!t.trace.some(a=>a.type==='submit'));
 }
 const p=createPolicy('Find east campus locker rentals.','Locker Rentals',{...PROFILES['first-result-chooser'],rankBias:1,recognitionNoise:1,threshold:0},()=>1,'v5');
 const o={epoch:0,totalResults:1,candidates:[{handle:'e0-r0',position:0}],openDetail:null};p.decide(o,{maxRewrites:0});
 p.receive({card:{handle:'e0-r0',position:0,title:'Locker Rentals',kind:'card',text:'Locker Rentals Resources Locker rentals for west campus only.'}});
 assert.equal(p.inspect().constraints.qualified,false);assert.equal(p.decide(o,{maxRewrites:0}).type,'skip');
});
test('contradictory details invalidate an initially qualifying card without a reopen loop',()=>{
 const p=createPolicy('Find east campus locker rentals.','Locker Rentals',{...PROFILES['first-result-chooser'],recognitionNoise:0},()=>.5,'v5');
 const o={epoch:0,totalResults:1,candidates:[{handle:'e0-r0',position:0}],openDetail:null};p.decide(o,{maxRewrites:0});
 p.receive({card:{handle:'e0-r0',position:0,title:'Locker Rentals',kind:'card',text:'Locker rentals for east campus.'}});
 assert.equal(p.decide(o,{maxRewrites:0}).type,'open_details');
 assert.equal(p.decide({...o,openDetail:'e0-r0'},{maxRewrites:0}).type,'read_details');
 p.receive({card:{handle:'e0-r0',position:0,title:'Locker Rentals',kind:'details',text:'Locker rentals for west campus only. East campus is not served.'}});
 assert.equal(p.decide({...o,openDetail:'e0-r0'},{maxRewrites:0}).type,'close_details');
 assert.equal(p.decide(o,{maxRewrites:0}).type,'skip');
});
test('new policy cannot import private data or evaluator answers; V4 remains default',async()=>{
 assert.equal(DEFAULT_CONFIG.policyVersion,'v4');
 for(const name of ['constraints.mjs','policy-v5.mjs']){
  const s=await readFile(new URL('../simulator/'+name,import.meta.url),'utf8');
  assert.ok([...s.matchAll(/from\s+['"]([^'"]+)['"]/g)].every(m=>['./text.mjs','./relevance.mjs','./recovery.mjs','./constraints.mjs'].includes(m[1])));
  assert.ok(!/acceptableIds|expectedTarget|\.record\.id|sessionStorage/.test(s));
 }
});
test('preimplementation fresh suite is frozen and comparison config cannot alter the engine or budgets',async()=>{
 const {cases}=await loadConstraintCases();assert.equal(cases.length,44);
 const source=await readFile(new URL('../simulator/constraint-cases.json',import.meta.url));assert.equal(sha256(source),FRESH_CASE_SHA256);
 assert.equal(cases.filter(c=>c.split==='development').length,10);assert.equal(cases.filter(c=>c.split==='evaluation').length,10);
 for(const bad of [{limits:{}},{policyVersions:['v5','v4']},{seeds:[201,201]},{splits:[]},{caseIds:['unknown']},{profiles:[]}])assert.throws(()=>validateConstraintConfig(bad,cases));
});
test('development comparisons replay exactly, isolate evaluation, and retain every transition and gate',async()=>{
 const c={seeds:[201],profiles:['first-result-chooser'],splits:['development'],conditions:['A'],recordOrders:['original']};
 const r=await validateConstraints(c);assert.deepEqual(r,await validateConstraints(r.config));assert.equal(r.rows.length,20);assert.equal(r.pairs.length,10);
 assert.ok(r.cases.every(c=>c.split==='development'));
 for(const t of r.rows.filter(t=>t.policyVersion==='v5'&&t.selectedId)){assert.equal(t.submissionQualified,true);assert.equal(t.submissionDetailsVerified,true);}
 const html=validationPayloads(r).get('report.html');assert.ok(html.includes('V4 / V5'));assert.ok(html.includes('Answerable skip'));assert.ok(html.includes('Suite split'));assert.ok(!html.includes('V3 failures'));
});

test('a matching place without the requested service cannot become a fallback answer',()=>{
 const c=checkConstraints('Find west campus wheelchair transport bookings.','West campus building locations.');
 assert.equal(c.qualified,false);assert.equal(c.serviceSupported,false);
 assert.equal(checkConstraints('Find grants not restricted to staff.','Grants restricted to staff.').qualified,false);
});
test('opaque IDs and hidden evaluator targets cannot change V5 decisions or timing',()=>{
 const f=fixture(['Locker rentals for west campus only.','Locker rentals for east campus.']);
 const a=run(f),b=run({...f,task:{...f.task,target:'absent'}}),c=run({...f,records:f.records.map(r=>({...r,id:'opaque-'+r.id}))});
 assert.deepEqual(a.trace,b.trace);assert.deepEqual(a.ledger,b.ledger);assert.deepEqual(a.trace,c.trace);assert.equal(c.selectedId,'opaque-r2');
});

test('V5 implementation freeze matches every dependency before evaluation',async()=>{
 const freeze=JSON.parse(await readFile(new URL('../simulator/constraint-freeze.json',import.meta.url),'utf8'));
 for(const f of freeze.sourceFiles)assert.equal(sha256(withoutV51Registration(f.path,await readFile(new URL('../'+f.path,import.meta.url),'utf8'))),f.sha256,f.path);
});
