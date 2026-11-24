import {createHash} from 'node:crypto';
import {simulate,simulateTrial} from './runner.mjs';
import {validateConfig,resolveProfile} from './config.mjs';
import {validateBrowserConfig} from './browser-config.mjs';
import {summarizeRun} from './report.mjs';
import {benchmarkCases,BENCHMARK_VERSION} from './benchmark-cases.mjs';
export const INVESTIGATION_VERSION='paired-policy-controls-v2';
const variants=['baseline','no-interruptions','no-recognition-noise','no-typing-errors'];
const supportedVersions=['v2','v3','v4','v5','v5.1'];
export function validateInvestigation(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['seeds','simulation','variants','policyVersions'].includes(k)))throw new Error('Unknown investigation fields.');
 const c={seeds:[42,43,44],simulation:{},policyVersions:['v3','v4'],variants:['baseline','no-recognition-noise','no-typing-errors'],...structuredClone(input)};
 if(!Array.isArray(c.seeds)||!c.seeds.length||c.seeds.length>10||new Set(c.seeds).size!==c.seeds.length||c.seeds.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw new Error('Choose 1–10 unique unsigned seeds.');
 if(!c.simulation||typeof c.simulation!=='object'||Array.isArray(c.simulation)||['masterSeed','policyVersion'].some(k=>Object.hasOwn(c.simulation,k)))throw new Error('Seeds and policy versions belong to the investigation, not simulation overrides.');
 if(!Array.isArray(c.variants)||!c.variants.includes('baseline')||new Set(c.variants).size!==c.variants.length||c.variants.some(v=>!variants.includes(v)))throw new Error('Choose unique known variants including baseline.');
 if(!Array.isArray(c.policyVersions)||c.policyVersions.length!==2||new Set(c.policyVersions).size!==2||c.policyVersions.some(v=>!supportedVersions.includes(v)))throw new Error('Choose two distinct supported policyVersions.');
 const browser=c.simulation.runner==='browser',base=(browser?validateBrowserConfig:validateConfig)(c.simulation);
 if(!browser&&c.variants.includes('no-interruptions'))throw new Error('No-interruptions is a browser-only control.');
 const tasks=c.seeds.length*2*c.variants.length*base.profiles.length*base.replicates*(browser?base.browser.assignmentSlots.length:18)*12;
 if(tasks>(browser?1000:100000))throw new Error('Investigation exceeds the task bound (1,000 browser / 100,000 model).');
 delete base.masterSeed;delete base.policyVersion;
 return {...c,simulation:base};
}
function runConfig(c,seed,policyVersion,variant){
 const base=structuredClone(c.simulation);base.masterSeed=seed;base.policyVersion=policyVersion;
 if(variant==='no-interruptions')base.browser.interruptions=[];
 if(variant==='no-recognition-noise'||variant==='no-typing-errors')for(const profile of base.profiles)base.profileOverrides[profile]={...base.profileOverrides[profile],[variant==='no-recognition-noise'?'recognitionNoise':'typingErrorRate']:0};
 return base;
}
const outcome=t=>t.success?'correct':t.incorrectSelection?'wrong':'skipped';
const caseKey=t=>JSON.stringify([t.profile,t.replicate,t.order,t.setRotation,t.taskIndex]);
export async function investigate(input={}, {onProgress=()=>{},browserRunner}={}){
 const config=validateInvestigation(input),runs=[],observations=[],benchmark=[];
 for(const seed of config.seeds)for(const policyVersion of config.policyVersions)for(const variant of config.variants){
  const resolved=runConfig(config,seed,policyVersion,variant);onProgress({seed,policyVersion,variant});
  const run=resolved.runner==='browser'?await (browserRunner??(await import('./browser-runner.mjs')).simulateBrowser)(resolved):simulate(resolved);
  const rows=run.sessions.flatMap(s=>s.trials.map(t=>({profile:s.profile,replicate:s.replicate,order:s.order,setRotation:s.setRotation,taskIndex:t.taskIndex,condition:t.condition,taskType:t.taskType,
   selectedId:t.selectedId,finalQuery:t.finalQuery,outcome:outcome(t),category:t.diagnosis.category,modeledActiveMs:t.modeledActiveMs,manualRewrites:t.manualRewrites,observedBrowserActiveMs:t.observedBrowserActiveMs,observedBrowserWallMs:t.observedBrowserWallMs,
   interruptionCount:t.interruptions?.length??0,verifiedInterruptions:(t.interruptions??[]).filter(f=>f.verified).length,recordingVerified:t.recordingVerified??null})));
  const digest=createHash('sha256').update(JSON.stringify(run.sessions)).digest('hex');
  runs.push({seed,policyVersion,variant,config:run.config,modelVersion:run.modelVersion,provenance:{adapterVersion:run.adapterVersion,rngVersion:run.rngVersion,timingVersion:run.timingVersion,browserVersion:run.browserVersion??null,browserControlMode:run.browserControlMode??null,reconciliationVersion:run.reconciliationVersion??null,measurementDefinition:run.measurementDefinition,browserMeasurementDefinition:run.browserMeasurementDefinition??null,resolvedProfiles:run.resolvedProfiles},summary:summarizeRun(run),browserRecordings:run.runner==='browser'?run.sessions.map(s=>({profile:s.profile,replicate:s.replicate,order:s.order,setRotation:s.setRotation,recording:s.browserRecording})):[],sessionSha256:digest});
  observations.push(...rows.map(t=>({seed,policyVersion,variant,...t})));
 }
 // Fixed cases are evaluated separately from the controlled study tasks. Acceptable IDs never reach the policy.
 for(const seed of config.seeds)for(const policyVersion of config.policyVersions)for(const profile of config.simulation.profiles)for(const c of benchmarkCases())for(const condition of ['A','B','C']){
  const resolved=validateConfig({masterSeed:seed,policyVersion,profiles:[profile],profileOverrides:config.simulation.profileOverrides,limits:config.simulation.limits,timing:config.simulation.timing});
  const t=simulateTrial({task:{type:c.type,prompt:c.prompt,query:c.query,target:c.acceptableIds[0]??null},condition,profile:resolveProfile(resolved,profile),config:resolved,
   agentKey:['benchmark',profile,c.id],taskKey:[c.id],records:c.records});
  benchmark.push({seed,policyVersion,profile,condition,caseId:c.id,split:c.split,taskType:c.type,selectedId:t.selectedId,skipped:t.skipped,
   accepted:c.acceptableIds.length?c.acceptableIds.includes(t.selectedId):t.skipped,expectedAction:c.acceptableIds.length?'select an acceptable result':'abstain',modeledActiveMs:t.modeledActiveMs});
 }
 const index=new Map(observations.map(t=>[JSON.stringify([t.seed,t.policyVersion,t.variant,caseKey(t)]),t]));
 const pairs=[];
 for(const t of observations){
  const comparisons=[];
  if(t.policyVersion===config.policyVersions[1])comparisons.push(['policy',index.get(JSON.stringify([t.seed,config.policyVersions[0],t.variant,caseKey(t)]))]);
  if(t.variant!=='baseline')comparisons.push(['control',index.get(JSON.stringify([t.seed,t.policyVersion,'baseline',caseKey(t)]))]);
  for(const [comparison,before] of comparisons){if(!before)throw new Error('Missing matched comparison case.');pairs.push({comparison,seed:t.seed,profile:t.profile,replicate:t.replicate,order:t.order,setRotation:t.setRotation,taskIndex:t.taskIndex,condition:t.condition,taskType:t.taskType,
   beforePolicy:before.policyVersion,afterPolicy:t.policyVersion,beforeVariant:before.variant,afterVariant:t.variant,beforeOutcome:before.outcome,afterOutcome:t.outcome,beforeCategory:before.category,afterCategory:t.category,
   deltaModeledActiveMs:t.modeledActiveMs-before.modeledActiveMs,deltaRewrites:t.manualRewrites-before.manualRewrites});}
 }
 return {format:'searchassist-simulator-investigation',schemaVersion:1,applicationVersion:'1.5',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',humanRatings:null,
  investigationVersion:INVESTIGATION_VERSION,benchmarkVersion:BENCHMARK_VERSION,config,runs,observations,pairs,benchmark};
}
