import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {simulateTrial} from './runner.mjs';
import {PROFILES,validateConfig,resolveProfile} from './config.mjs';
import {search} from '../dist/engine.mjs';

export const VALIDATION_VERSION='frozen-policy-challenge-validation-v1';
export const OUTCOMES=['correct-selection','wrong-selection','answerable-skip','correct-abstention'];
export const sha256=value=>createHash('sha256').update(value).digest('hex');
const unique=(a,allowed)=>Array.isArray(a)&&a.length>0&&new Set(a).size===a.length&&a.every(x=>allowed.includes(x));
export async function loadValidationCases(){
 const text=await readFile(new URL('./validation-cases.json',import.meta.url),'utf8'),suite=JSON.parse(text);
 if(suite.format!=='searchassist-validation-cases'||suite.schemaVersion!==1||!Array.isArray(suite.cases)||suite.cases.length!==24)throw new Error('Invalid challenge suite.');
 const ids=new Set();
 for(const c of suite.cases){
  if(typeof c.id!=='string'||ids.has(c.id)||!c.family||!c.prompt||!c.query||!c.rationale||!Array.isArray(c.records)||!c.records.length||c.records.length>24)throw new Error('Invalid challenge case.');ids.add(c.id);
  const recordIds=new Set(c.records.map(r=>r.id));
  if(recordIds.size!==c.records.length||c.records.some(r=>!r.id||typeof r.title!=='string'||typeof r.description!=='string'||!Array.isArray(r.tags)||!Array.isArray(r.aliases)))throw new Error('Invalid challenge records.');
  if(!Array.isArray(c.acceptableIds)||new Set(c.acceptableIds).size!==c.acceptableIds.length||c.acceptableIds.some(id=>!recordIds.has(id)))throw new Error('Invalid evaluator answers.');
 }
 return {suite,sourceSha256:sha256(text)};
}
export function validateBroadConfig(input={},cases){
 const defaults={format:'searchassist-broad-validation-config',schemaVersion:1,seeds:[101,102,103,104,105],profiles:Object.keys(PROFILES),policyVersions:['v3','v4'],conditions:['A','B','C'],recordOrders:['original','reversed'],caseIds:cases.map(c=>c.id)};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(defaults,k)))throw new Error('Unknown broad validation fields; policies, budgets and profiles are frozen.');
 const c={...defaults,...structuredClone(input)};
 if(c.format!==defaults.format||c.schemaVersion!==1)throw new Error('Unsupported broad validation config.');
 if(!Array.isArray(c.seeds)||!c.seeds.length||c.seeds.length>10||new Set(c.seeds).size!==c.seeds.length||c.seeds.some(x=>!Number.isInteger(x)||x<0||x>0xffffffff))throw new Error('Choose 1–10 unique unsigned seeds.');
 for(const [key,allowed] of [['profiles',Object.keys(PROFILES)],['conditions',['A','B','C']],['recordOrders',['original','reversed']],['caseIds',cases.map(c=>c.id)]])if(!unique(c[key],allowed))throw new Error('Choose unique known '+key+'.');
 if(JSON.stringify(c.policyVersions)!==JSON.stringify(['v3','v4']))throw new Error('Broad validation compares frozen V3 and V4.');
 const n=c.seeds.length*c.profiles.length*2*c.conditions.length*c.recordOrders.length*c.caseIds.length;
 if(n>20000)throw new Error('Broad validation is limited to 20,000 challenge trials.');
 return c;
}
export function classifySelection(selectedId,acceptableIds){
 if(selectedId===null)return acceptableIds.length?'answerable-skip':'correct-abstention';
 return acceptableIds.includes(selectedId)?'correct-selection':'wrong-selection';
}
const caseKey=t=>JSON.stringify([t.seed,t.profile,t.condition,t.recordOrder,t.caseId]);
export function summarizeValidation(rows,dimensions){
 const groups=new Map();
 for(const row of rows){const key=JSON.stringify(dimensions.map(k=>row[k]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups].map(([key,ts])=>({...Object.fromEntries(dimensions.map((d,i)=>[d,JSON.parse(key)[i]])),tasks:ts.length,
  ...Object.fromEntries(OUTCOMES.map(o=>[o,ts.filter(t=>t.outcome===o).length])),meanModeledActiveMs:ts.reduce((n,t)=>n+t.modeledActiveMs,0)/ts.length}));
}
export async function validateBroad(input={}, {onProgress=()=>{}}={}){
 const {suite,sourceSha256}=await loadValidationCases(),config=validateBroadConfig(input,suite.cases),rows=[],sampleIndex=new Map();
 const cases=suite.cases.filter(c=>config.caseIds.includes(c.id));
 for(const seed of config.seeds)for(const policyVersion of config.policyVersions){
  onProgress({seed,policyVersion});
  for(const profile of config.profiles)for(const c of cases)for(const condition of config.conditions)for(const recordOrder of config.recordOrders){
   const records=recordOrder==='original'?c.records:[...c.records].reverse(),resolved=validateConfig({masterSeed:seed,policyVersion,profiles:[profile]});
   // Every target is null during execution. All acceptable-answer evaluation happens afterward.
   // Keys exclude policy version and record order to match the same modeled draws in comparisons.
   const t=simulateTrial({task:{type:c.family,prompt:c.prompt,query:c.query,target:null},condition,profile:resolveProfile(resolved,profile),config:resolved,agentKey:['broad-validation',profile,c.id],taskKey:[c.id],records});
   const outcome=classifySelection(t.selectedId,c.acceptableIds),evidence={trace:t.trace,ledger:t.ledger};
   const queries=[...new Set([c.query,...t.trace.filter(a=>typeof a.queryAfter==='string').map(a=>a.queryAfter)])];
   const acceptableReturned=c.acceptableIds.length?queries.some(query=>search(records,query,{mode:{A:'exact',B:'fuzzy',C:'assist'}[condition]}).some(m=>c.acceptableIds.includes(m.record.id))):null;
   const submission=t.trace.find(a=>a.type==='submit')?.decisionEvidence;
   const row={seed,policyVersion,profile,caseId:c.id,family:c.family,condition,recordOrder,expectedAction:c.acceptableIds.length?'select-acceptable':'abstain',outcome,selectedId:t.selectedId,
    termination:t.termination,initialQuery:c.query,finalQuery:t.finalQuery,modeledActiveMs:t.modeledActiveMs,actions:t.actions,manualRewrites:t.manualRewrites,acceptableReturned,
    submissionEligible:submission?.eligible??null,submissionScore:submission?.score??null,submissionThreshold:submission?.threshold??null,submissionGoalOverlap:submission?(submission.goalOverlap??submission.overlap):null,
    traceSha256:sha256(JSON.stringify(evidence))};
   rows.push(row);
   // First example per case/policy/outcome, explicitly a diagnostic sample, not all traces.
   const sampleKey=JSON.stringify([c.id,policyVersion,outcome]);
   if(!sampleIndex.has(sampleKey))sampleIndex.set(sampleKey,{...row,...evidence});
  }
 }
 const index=new Map(rows.map(t=>[JSON.stringify([t.policyVersion,caseKey(t)]),t])),pairs=[];
 for(const after of rows.filter(t=>t.policyVersion==='v4')){
  const before=index.get(JSON.stringify(['v3',caseKey(after)]));if(!before)throw new Error('Missing paired validation trial.');
  pairs.push({seed:after.seed,profile:after.profile,caseId:after.caseId,family:after.family,condition:after.condition,recordOrder:after.recordOrder,beforeOutcome:before.outcome,afterOutcome:after.outcome,deltaModeledActiveMs:after.modeledActiveMs-before.modeledActiveMs});
 }
 return {format:'searchassist-broad-validation',schemaVersion:1,applicationVersion:'1.5',validationVersion:VALIDATION_VERSION,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',humanRatings:null,runner:'model',
  sourcePolicyCommit:'a83b40f53c47d61c0e70c1c94bae84bfe3e0571c',caseSuiteVersion:suite.version,caseSuiteSha256:sourceSha256,caseProvenance:suite.provenance,config,
  resolvedSimulation:validateConfig(),cases,rows,pairs,samples:[...sampleIndex.values()],sampleDefinition:'First example per case/policy/outcome; every outcome is in rows. Samples are not random or exhaustive.',
  summaries:{overall:summarizeValidation(rows,['policyVersion']),family:summarizeValidation(rows,['policyVersion','family']),profile:summarizeValidation(rows,['policyVersion','profile']),condition:summarizeValidation(rows,['policyVersion','condition']),seed:summarizeValidation(rows,['policyVersion','seed']),recordOrder:summarizeValidation(rows,['policyVersion','recordOrder'])}};
}
