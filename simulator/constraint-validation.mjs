import {readFile} from 'node:fs/promises';
import {simulateTrial} from './runner.mjs';
import {validateConfig,resolveProfile,PROFILES} from './config.mjs';
import {loadValidationCases,classifySelection,summarizeValidation,sha256} from './validation.mjs';
export const FRESH_CASE_SHA256='a3a3c140e2e482096d2a05b85a23c7430a9d8e6d0c2e70cf99f4ab1e1985b940';
export async function loadConstraintCases(){
 const text=await readFile(new URL('./constraint-cases.json',import.meta.url),'utf8');
 if(sha256(text)!==FRESH_CASE_SHA256)throw new Error('The pre-implementation constraint suite changed. Create a new suite version instead.');
 const suite=JSON.parse(text),{suite:old,sourceSha256:regressionSha256}=await loadValidationCases();
 return {cases:[...old.cases.map(c=>({...c,split:'regression'})),...suite.cases],suite,regressionSha256};
}
export function validateConstraintConfig(input={},cases){
 const defaults={format:'searchassist-constraint-validation-config',schemaVersion:1,seeds:[201,202,203,204,205],profiles:Object.keys(PROFILES),policyVersions:['v4','v5'],conditions:['A','B','C'],recordOrders:['original','reversed'],splits:['regression','development','evaluation'],caseIds:cases.map(c=>c.id)};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(defaults,k)))throw new Error('Unknown constraint validation fields; engine, budgets and profiles are fixed.');
 const c={...defaults,...structuredClone(input)};
 if(c.format!==defaults.format||c.schemaVersion!==1||JSON.stringify(c.policyVersions)!=='["v4","v5"]')throw new Error('Compare V4 with V5.');
 if(!Array.isArray(c.seeds)||!c.seeds.length||c.seeds.length>10||new Set(c.seeds).size!==c.seeds.length||c.seeds.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw new Error('Choose 1–10 unique unsigned seeds.');
 for(const [key,allowed] of [['profiles',Object.keys(PROFILES)],['conditions',['A','B','C']],['recordOrders',['original','reversed']],['splits',['regression','development','evaluation']],['caseIds',cases.map(c=>c.id)]]){
  if(!Array.isArray(c[key])||!c[key].length||new Set(c[key]).size!==c[key].length||c[key].some(x=>!allowed.includes(x)))throw new Error('Choose unique known '+key+'.');
 }
 const selected=cases.filter(t=>c.caseIds.includes(t.id)&&c.splits.includes(t.split));
 if(!selected.length||selected.length*c.seeds.length*c.profiles.length*2*c.conditions.length*c.recordOrders.length>20000)throw new Error('Choose 1–20,000 trials.');
 return c;
}
export async function validateConstraints(input={}, {onProgress=()=>{}}={}){
 const loaded=await loadConstraintCases(),config=validateConstraintConfig(input,loaded.cases),cases=loaded.cases.filter(c=>config.caseIds.includes(c.id)&&config.splits.includes(c.split)),rows=[],sampleIndex=new Map();
 for(const seed of config.seeds)for(const policyVersion of config.policyVersions){
  onProgress({seed,policyVersion});
  for(const profile of config.profiles)for(const c of cases)for(const condition of config.conditions)for(const recordOrder of config.recordOrders){
   const resolved=validateConfig({masterSeed:seed,policyVersion,profiles:[profile]});
   const t=simulateTrial({task:{type:c.family,prompt:c.prompt,query:c.query,target:null},condition,profile:resolveProfile(resolved,profile),config:resolved,
    agentKey:['constraint-validation',profile,c.id],taskKey:[c.id],records:recordOrder==='original'?c.records:[...c.records].reverse()});
   // Evaluator-only IDs are first consulted after terminal execution. Draw keys omit version/order.
   const outcome=classifySelection(t.selectedId,c.acceptableIds),evidence={trace:t.trace,ledger:t.ledger};
   const submission=t.trace.find(a=>a.type==='submit')?.decisionEvidence;
   const row={seed,policyVersion,profile,caseId:c.id,family:c.family,split:c.split,condition,recordOrder,expectedAction:c.acceptableIds.length?'select-acceptable':'abstain',outcome,selectedId:t.selectedId,
    termination:t.termination,initialQuery:c.query,finalQuery:t.finalQuery,modeledActiveMs:t.modeledActiveMs,actions:t.actions,manualRewrites:t.manualRewrites,
    submissionEligible:submission?.eligible??null,submissionScore:submission?.score??null,submissionThreshold:submission?.threshold??null,submissionGoalOverlap:submission?(submission.goalOverlap??submission.overlap):null,
    submissionQualified:submission?.constraints?.qualified??null,submissionDetailsVerified:submission?.detailsVerified??null,
    rejectedObservations:t.trace.filter(a=>a.evidenceAfter?.constraints&&!a.evidenceAfter.constraints.qualified).length,
    traceSha256:sha256(JSON.stringify(evidence))};
   rows.push(row);const key=JSON.stringify([c.id,policyVersion,outcome]);if(!sampleIndex.has(key))sampleIndex.set(key,{...row,...evidence});
  }
 }
 const key=t=>JSON.stringify([t.seed,t.profile,t.condition,t.recordOrder,t.caseId]),index=new Map(rows.filter(t=>t.policyVersion==='v4').map(t=>[key(t),t]));
 const pairs=rows.filter(t=>t.policyVersion==='v5').map(after=>{
  const before=index.get(key(after));if(!before)throw new Error('Missing V4 paired trial.');
  return {seed:after.seed,profile:after.profile,caseId:after.caseId,family:after.family,split:after.split,condition:after.condition,recordOrder:after.recordOrder,beforeOutcome:before.outcome,afterOutcome:after.outcome,deltaModeledActiveMs:after.modeledActiveMs-before.modeledActiveMs};
 });
 return {format:'searchassist-constraint-validation',schemaVersion:1,validationVersion:'paired-v4-v5-constraint-validation-v1',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',humanRatings:null,runner:'model',
  fixtureCommit:'cf648e615b10768d561d1d677e7fb6e0b176fc4d',sourcePolicyCommit:'de902c6eb8d05d3fd40f2cf065bdbbe3bd176f65',caseSuiteVersion:loaded.suite.version,caseSuiteSha256:FRESH_CASE_SHA256,regressionSuiteSha256:loaded.regressionSha256,caseProvenance:loaded.suite.provenance,
  evaluationDescription:'V4 / V5 use the same engine, A/B/C interfaces, profiles, thresholds and budgets. Regression cases are reused; development and evaluation cases were authored and committed before V5 implementation. The evaluation split is not blind or independently collected. Unknown recognized requirements prevent submission. These bounded lexical rules do not establish general semantic understanding.',
  config,resolvedSimulation:validateConfig(),cases,rows,pairs,samples:[...sampleIndex.values()],sampleDefinition:'First trace per case/policy/outcome. All terminal outcomes and paired transitions are retained; samples are neither random nor exhaustive.',
  summaries:Object.fromEntries([['overall',[]],['split',['split']],['family',['family']],['profile',['profile']],['condition',['condition']],['seed',['seed']],['recordOrder',['recordOrder']]].map(([name,ds])=>[name,summarizeValidation(rows,['policyVersion',...ds])]))};
}
