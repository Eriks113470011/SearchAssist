import {diagnoseTrial} from './diagnostics.mjs';
import {taskSets,orders} from '../dist/study.mjs';
import {records as directory} from '../dist/data.mjs';
import {validateConfig,resolveProfile} from './config.mjs';
import {randomUnit,RNG_VERSION} from './random.mjs';
import {createPolicy,MODEL_VERSIONS} from './policy.mjs';
import {createModelAdapter,ADAPTER_VERSION} from './model-adapter.mjs';
import {actionCost,TIMING_VERSION} from './timing.mjs';
export const SIMULATION_FORMAT='searchassist-simulation-run';
export const MODEL_VERSION=MODEL_VERSIONS.v4;
export function simulateTrial({task,condition,profile,config,agentKey,taskKey,records=directory}) {
  const draw=(...keys)=>randomUnit(config.masterSeed,agentKey,taskKey,...keys),adapter=createModelAdapter({condition,initialQuery:task.query,records});
  const policy=createPolicy(task.prompt,task.query,profile,draw,config.policyVersion),trace=[],ledger=[];let active=0,selectedId=null,reason='action-budget',rewrites=0,queryChanges=0,opens=0;
  const occurrences={},openedIds=[];
  const acquire={type:'acquire_task',reason:'Read the public task prompt and the prefilled query; no typing is charged.'};
  const initial=actionCost(acquire,{readingText:task.prompt+' '+task.query,keyCount:0,clicks:0,waits:0},config.timing,profile.timeScale,draw,0);
  if(initial.durationMs<=config.limits.maxModeledActiveMs){ledger.push(initial);active+=initial.durationMs;trace.push({...acquire,modeledAtMs:0,durationMs:initial.durationMs});}else reason='time-budget';
  if(reason!=='time-budget')for(let i=0;i<config.limits.maxActionsPerTrial;i++) {
    const observation=adapter.observe(),action=policy.decide(structuredClone(observation),config.limits),preview=adapter.preview(action);
    const cost=actionCost(action,preview,config.timing,profile.timeScale,draw,occurrences[action.type]??0);
    if(active+cost.durationMs>config.limits.maxModeledActiveMs){reason='time-budget';trace.push({type:'budget_stop',reason:'The next action would exceed the modeled-time limit.',attemptedAction:action.type,modeledAtMs:active,durationMs:0});break;}
    const decisionEvidence=policy.inspect(action.handle);
    const result=adapter.execute(action);policy.receive(structuredClone(result));
    trace.push({...action,decisionEvidence,...(result.card?{evidenceAfter:policy.inspect(result.card.handle)}:{}),queryBefore:observation.query,queryAfter:adapter.observe().query,modeledAtMs:active,durationMs:cost.durationMs,...(result.card?{attendedText:result.card.text}:{}),...(result.suggestion?{attendedSuggestion:result.suggestion.query}:{})});
    ledger.push(cost);active+=cost.durationMs;occurrences[action.type]=(occurrences[action.type]??0)+1;
    if(observation.query!==adapter.observe().query)queryChanges++;
    if(action.type==='rewrite')rewrites++;
    if(action.type==='open_details'){opens++;openedIds.push(adapter.selectionId(action.handle));}
    if(action.type==='submit'){selectedId=adapter.selectionId(action.handle);reason='submitted';break;}
    if(action.type==='skip'){reason='agent-skip';break;}
  }
  // Correctness is resolved only here, after the policy's terminal action, never fed back to it.
  const trial={taskType:task.type,prompt:task.prompt,initialQuery:task.query,finalQuery:adapter.observe().query,selectedId,expectedTargetId:task.target,
    success:reason==='submitted'&&selectedId===task.target,incorrectSelection:reason==='submitted'&&selectedId!==task.target,
    skipped:reason!=='submitted',termination:reason,modeledActiveMs:active,observedBrowserActiveMs:null,observedBrowserWallMs:null,
    manualRewrites:rewrites,modeledQueryChanges:queryChanges,suggestionsApplied:trace.filter(a=>a.type==='apply_suggestion').length,suggestionsUndone:trace.filter(a=>a.type==='undo_suggestion').length,explanationsRead:trace.filter(a=>a.type==='read_explanation').length,resultOpens:opens,incorrectResultOpens:openedIds.filter(id=>id!==task.target).length,actions:trace.filter(a=>a.type!=='acquire_task'&&a.type!=='budget_stop').length,ledger,trace};
  return {...trial,diagnosis:diagnoseTrial({...trial,condition},records)};
}
export function simulate(input={}) {
  const config=validateConfig(input),sessions=[];
  for(const profileName of config.profiles)for(let replicate=0;replicate<config.replicates;replicate++)for(let slot=0;slot<18;slot++) {
    const order=orders[slot%6],setRotation=Math.floor(slot/6),agentKey=[profileName,replicate,slot];
    const trials=[];
    for(let block=0;block<3;block++)for(let index=0;index<4;index++) {
      const taskSet=(block+setRotation)%3,task=taskSets[taskSet][index];
      trials.push({taskIndex:trials.length+1,condition:order[block],taskSet:taskSet+1,...simulateTrial({task,condition:order[block],profile:resolveProfile(config,profileName),config,agentKey,taskKey:[taskSet,index]})});
    }
    sessions.push({format:'searchassist-simulation-session',schemaVersion:1,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',participant:`SIM_${String(sessions.length+1).padStart(5,'0')}`,
      profile:profileName,replicate:replicate+1,order,setRotation,humanRatings:null,trials});
  }
  return {format:SIMULATION_FORMAT,schemaVersion:1,applicationVersion:'1.5',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model',modelVersion:MODEL_VERSIONS[config.policyVersion],adapterVersion:ADAPTER_VERSION,
    rngVersion:RNG_VERSION,timingVersion:TIMING_VERSION,datasetVersion:'synthetic-directory-v1',protocolVersion:'controlled-tasks-v1',
    measurementDefinition:'modeled-operator-time-v1',humanRatings:null,config,resolvedProfiles:Object.fromEntries(config.profiles.map(p=>[p,resolveProfile(config,p)])),sessions};
}
