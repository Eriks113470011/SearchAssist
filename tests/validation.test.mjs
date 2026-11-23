import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadValidationCases,validateBroadConfig,validateBroad,classifySelection,sha256} from '../simulator/validation.mjs';
import {validationPayloads} from '../simulator/validation-report.mjs';
import {simulate} from '../simulator/runner.mjs';
import {validateInvestigation} from '../simulator/investigate.mjs';
import {writeValidationArtifacts} from '../simulator/artifacts.mjs';
test('V4 remains byte-identical to V1.5 and replays its pre-challenge session references',async()=>{
 const ref=JSON.parse(await readFile(new URL('./fixtures/policy-v4-reference.json',import.meta.url),'utf8'));
 assert.equal(ref.sourceCommit,'a83b40f53c47d61c0e70c1c94bae84bfe3e0571c');
 for(const f of ref.sourceFiles)assert.equal(sha256(await readFile(new URL('../'+f.path,import.meta.url))),f.sha256,f.path);
 for(const c of ref.cases){const r=simulate({masterSeed:c.seed,policyVersion:'v4'});assert.equal(sha256(JSON.stringify(r.sessions)),c.sha256);assert.equal(r.sessions.length,c.sessions);}
});
test('fresh case suite covers each declared risk and has evaluator-only consistent answers',async()=>{
 const {suite,sourceSha256}=await loadValidationCases();assert.equal(suite.cases.length,24);assert.equal(sourceSha256.length,64);
 const frozen=JSON.parse(await readFile(new URL('./fixtures/policy-v4-reference.json',import.meta.url),'utf8'));assert.equal(sourceSha256,frozen.challengeSuiteSha256);
 assert.equal(new Set(suite.cases.map(c=>c.family)).size,6);
 for(const family of new Set(suite.cases.map(c=>c.family)))assert.equal(suite.cases.filter(c=>c.family===family).length,4);
 for(const c of suite.cases){if(c.family==='missing-answer')assert.equal(c.acceptableIds.length,0);if(c.family==='multiple-answers')assert.equal(c.acceptableIds.length,2);}
 assert.equal(classifySelection(null,['r1']),'answerable-skip');assert.equal(classifySelection(null,[]),'correct-abstention');assert.equal(classifySelection('r1',[]),'wrong-selection');assert.equal(classifySelection('r2',['r1','r2']),'correct-selection');
});
test('broad matrix is strict and frozen with reproducible resolved configs; browser matrix stays bounded',async()=>{
 const {suite}=await loadValidationCases(),c=validateBroadConfig({},suite.cases);assert.deepEqual(validateBroadConfig(c,suite.cases),c);
 assert.equal(c.seeds.length*c.profiles.length*2*c.conditions.length*c.recordOrders.length*c.caseIds.length,8640);
 for(const bad of [{seeds:[]},{seeds:[1,1]},{seeds:[-1]},{profiles:[]},{conditions:['Z']},{recordOrders:['random']},{caseIds:['missing-id']},{policyVersions:['v4','v3']},{limits:{maxActionsPerTrial:80}},{profileOverrides:{}},{runner:'browser'}])assert.throws(()=>validateBroadConfig(bad,suite.cases));
 const browser=validateInvestigation(JSON.parse(await readFile(new URL('../configs/investigation-broad-browser.json',import.meta.url),'utf8')));
 assert.equal(browser.seeds.length*2*browser.simulation.profiles.length*browser.simulation.browser.assignmentSlots.length*12,864);assert.deepEqual(browser.variants,['baseline']);
});
test('challenge comparisons cover every case/seed/profile/condition/order and replay exactly',async()=>{
 const config={seeds:[101,102],profiles:['careful-scanner'],caseIds:['similar-north','missing-negated','ambiguous-cafe']};
 const r=await validateBroad(config),replay=await validateBroad(r.config);assert.deepEqual(replay,r);assert.equal(r.rows.length,72);assert.equal(r.pairs.length,36);
 assert.equal(new Set(r.rows.map(t=>JSON.stringify([t.seed,t.policyVersion,t.profile,t.condition,t.recordOrder,t.caseId]))).size,72);
 for(const row of r.rows){const c=r.cases.find(c=>c.id===row.caseId);assert.equal(row.outcome,classifySelection(row.selectedId,c.acceptableIds));if(row.selectedId){assert.equal(row.submissionEligible,true);assert.ok(row.submissionScore>=row.submissionThreshold);assert.ok(row.submissionGoalOverlap>=0.25);}}
 for(const s of r.samples){assert.equal(s.traceSha256,sha256(JSON.stringify({trace:s.trace,ledger:s.ledger})));assert.equal(s.modeledActiveMs,s.ledger.reduce((n,l)=>n+l.durationMs,0));}
});
test('validation reports retain all outcomes and artifact writer fingerprints sources without overwrites',async()=>{
 const r=await validateBroad({seeds:[101],profiles:['careful-scanner'],conditions:['A'],caseIds:['missing-negated','ambiguous-cafe']});
 const files=validationPayloads(r);assert.ok(files.get('report.html').includes('MODEL ONLY'));assert.ok(files.get('report.html').includes('Correct abstention'));assert.ok(files.get('outcomes.csv').includes('wrong-selection')||files.get('outcomes.csv').includes('correct-abstention'));
 const changed=structuredClone(r);changed.cases[0].prompt='<script>alert(1)</script>';const html=validationPayloads(changed).get('report.html');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 const root=await mkdtemp(join(tmpdir(),'searchassist-validation-')),output=join(root,'out');
 try{await writeValidationArtifacts(r,{root,output});const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));assert.equal(manifest.runner,'model');assert.equal(manifest.humanRatings,null);assert.ok(manifest.sourceFiles.some(f=>f.path==='simulator/validation-cases.json'));await assert.rejects(writeValidationArtifacts(r,{root,output}),/EEXIST/);}finally{await rm(root,{recursive:true,force:true});}
});
