import {diagnoseTrial} from './diagnostics.mjs';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {readBrowserDownload} from './browser-downloads.mjs';
import {taskSets,orders} from '../dist/study.mjs';
import {isSimulationRecording} from '../dist/simulation-session.mjs';
import {validateBrowserConfig} from './browser-config.mjs';
import {resolveProfile} from './config.mjs';
import {createPolicy,MODEL_VERSIONS} from './policy.mjs';
import {randomUnit,RNG_VERSION} from './random.mjs';
import {actionCost,TIMING_VERSION} from './timing.mjs';
import {MODEL_VERSION,SIMULATION_FORMAT} from './runner.mjs';
import {createBrowserAdapter,BROWSER_ADAPTER_VERSION} from './browser-adapter.mjs';
import {interruptBrowserTrial,INTERRUPTION_VERSION} from './browser-interruptions.mjs';
import {launchNativeBrowser} from './native-browser.mjs';
import {startBrowserServer} from './browser-server.mjs';
export const RECONCILIATION_VERSION='recorded-browser-actions-v2';
export async function runBrowserTrial({page,profile,config,agentKey,taskKey,signal,taskIndex,onPaused}) {
  const adapter=createBrowserAdapter(page),goal=(await page.locator('#study-banner h2').textContent()).trim(),initialQuery=await page.locator('#query').inputValue();
  const draw=(...keys)=>randomUnit(config.masterSeed,agentKey,taskKey,...keys),policy=createPolicy(goal,initialQuery,profile,draw,config.policyVersion),trace=[],ledger=[],occurrences={};
  const planned=(config.browser.interruptions??[]).map((f,i)=>({...f,id:`INT_${String(i+1).padStart(3,'0')}`})).filter(f=>f.taskIndex===taskIndex),interruptions=[];
  async function recoverAt(step){for(const entry of planned.filter(f=>f.afterAction===step)){interruptions.push(await interruptBrowserTrial({page,entry,signal,onPaused}));adapter.resetAfterRecovery();}}
  let active=0,termination='action-budget',finalQuery=initialQuery;
  async function spend(action,preview) {
    const cost=actionCost(action,preview,config.timing,profile.timeScale,draw,occurrences[action.type]??0);
    if(active+cost.durationMs>config.limits.maxModeledActiveMs)return null;
    if(config.browser.pacing==='modeled')await delay(cost.durationMs,undefined,{signal});
    return cost;
  }
  const acquire={type:'acquire_task',reason:'Read the public task prompt and prefilled query; no typing is charged.'};
  const first=await spend(acquire,{readingText:goal+' '+initialQuery,keyCount:0,clicks:0,waits:0});
  if(first){ledger.push(first);trace.push({...acquire,modeledAtMs:0,durationMs:first.durationMs});active=first.durationMs;}
  else termination='time-budget';
  await recoverAt(0);
  if(first)for(let i=0;i<config.limits.maxActionsPerTrial;i++) {
    signal?.throwIfAborted();
    if(!await page.locator('#pause-task').isVisible())throw new Error('The browser trial is unexpectedly paused or unavailable.');
    const observation=await adapter.observe(),action=policy.decide(structuredClone(observation),config.limits),preview=await adapter.preview(action),cost=await spend(action,preview);
    if(!cost){termination='time-budget';trace.push({type:'budget_stop',reason:'The next action would exceed the modeled-time limit.',attemptedAction:action.type,modeledAtMs:active,durationMs:0});break;}
    const decisionEvidence=policy.inspect(action.handle);
    const result=await adapter.execute(action);policy.receive(structuredClone(result));
    finalQuery=['submit','skip'].includes(action.type)?observation.query:(await adapter.observe()).query;
    trace.push({...action,decisionEvidence,...(result.card?{evidenceAfter:policy.inspect(result.card.handle)}:{}),queryBefore:observation.query,queryAfter:finalQuery,modeledAtMs:active,durationMs:cost.durationMs,...(result.card?{attendedText:result.card.text}:{}),...(result.suggestion?{attendedSuggestion:result.suggestion.query}:{})});
    ledger.push(cost);active+=cost.durationMs;occurrences[action.type]=(occurrences[action.type]??0)+1;
    if(action.type==='submit'){termination='submitted';break;}
    if(action.type==='skip'){termination='agent-skip';break;}
    await recoverAt(i+1);
  }
  if(interruptions.length!==planned.length)throw new Error('A scheduled interruption was not reached before the trial ended. Choose a smaller afterAction or a different trial.');
  let completionControl=null;
  if(['action-budget','time-budget'].includes(termination)) {
    if((await adapter.observe()).openDetail)await adapter.execute({type:'close_details'});
    await adapter.execute({type:'skip'});completionControl='Public Skip task control used to terminate a budget-stopped trial; cleanup overhead is observed, not a modeled policy action.';
  }
  return {interruptions,prompt:goal,initialQuery,finalQuery,selectedId:adapter.selectionId(),termination,completionControl,modeledActiveMs:active,
    manualRewrites:trace.filter(a=>a.type==='rewrite').length,modeledQueryChanges:trace.filter(a=>'queryBefore'in a&&a.queryBefore!==a.queryAfter).length,
    suggestionsApplied:trace.filter(a=>a.type==='apply_suggestion').length,suggestionsUndone:trace.filter(a=>a.type==='undo_suggestion').length,
    explanationsRead:trace.filter(a=>a.type==='read_explanation').length,resultOpens:trace.filter(a=>a.type==='open_details').length,
    actions:trace.filter(a=>!['acquire_task','budget_stop'].includes(a.type)).length,ledger,trace};
}
export function reconcileRecording(recording,trials,{participant,order,setRotation}) {
  assert.ok(isSimulationRecording(recording),'Missing synthetic browser provenance.');assert.equal(recording.humanRatings,null);assert.deepEqual(recording.ratings,[]);
  assert.equal(recording.participant,participant);assert.equal(recording.order,order);assert.equal(recording.setRotation,setRotation);assert.equal(recording.phase,'complete');assert.equal(recording.trials.length,12);assert.equal(trials.length,12);
  const output=trials.map((t,i)=>{
    const r=recording.trials[i],task=taskSets[(Math.floor(i/4)+setRotation)%3][i%4],events=recording.events.filter(e=>e.taskIndex===i);
    assert.equal(r.taskIndex,i+1);assert.equal(r.condition,order[Math.floor(i/4)]);assert.equal(t.prompt,task.prompt);assert.equal(r.targetId,task.target);
    for(const key of ['selectedId','initialQuery','finalQuery','resultOpens'])assert.equal(r[key],t[key],`Recorder mismatch for task ${i+1}: ${key}`);
    assert.equal(r.incorrectResultOpens,events.filter(e=>e.type==='result_opened'&&e.recordId!==task.target).length);
    assert.equal(r.success,r.selectedId===task.target);assert.equal(r.skipped,t.termination!=='submitted');
    const edits=t.trace.filter(a=>['rewrite','apply_suggestion','undo_suggestion'].includes(a.type)&&a.queryBefore!==a.queryAfter);
    const recordedEdits=events.filter(e=>['query','suggestion_applied','suggestion_undone'].includes(e.type));
    assert.equal(r.queryReformulations,edits.length);assert.deepEqual(recordedEdits.map(e=>e.query),edits.map(a=>a.queryAfter));
    assert.equal(events.filter(e=>e.type==='suggestion_applied').length,t.suggestionsApplied);assert.equal(events.filter(e=>e.type==='suggestion_undone').length,t.suggestionsUndone);
    assert.equal(events.filter(e=>e.type==='task_completed').length,1);assert.equal(events.filter(e=>e.type==='task_started').length,1);
    const faults=t.interruptions??[],restores=faults.filter(f=>['reload','restore'].includes(f.kind)).length;
    assert.ok(faults.every(f=>f.verified));assert.equal(r.pauseCount,faults.length);assert.equal(r.resumeCount,faults.length);assert.equal(r.restored,restores>0);
    const pauses=events.filter(e=>e.type==='task_paused'),resumes=events.filter(e=>e.type==='task_resumed');assert.equal(pauses.length,faults.length);assert.equal(resumes.length,faults.length);assert.equal(events.filter(e=>e.type==='session_restored').length,restores);
    assert.deepEqual(pauses.map(e=>e.reason),faults.map(f=>({manual:'manual',navigation:'navigation',hidden:'tab_hidden',reload:'page_exit',restore:'manual'}[f.kind])));
    for(let j=0;j<faults.length;j++){assert.equal(resumes[j].elapsedMs,pauses[j].elapsedMs);assert.ok(resumes[j].wallElapsedMs-pauses[j].wallElapsedMs>=faults[j].observedHoldMs-50);}

    for(const key of ['activeElapsedMs','wallElapsedMs'])assert.ok(Number.isFinite(r[key])&&r[key]>=0);
    if(!faults.length)assert.ok(Math.abs(r.activeElapsedMs-r.wallElapsedMs)<1000,'Unexpected browser clock divergence.');
    else assert.ok(r.wallElapsedMs-r.activeElapsedMs>=faults.reduce((n,f)=>n+f.observedHoldMs-50,0),'Controlled idle leaked into active timing.');
    const trial={...t,taskIndex:i+1,condition:r.condition,taskSet:r.taskSet,taskType:task.type,expectedTargetId:task.target,success:r.success,skipped:r.skipped,incorrectSelection:r.incorrectFinalSelection,
      pauseCount:r.pauseCount,resumeCount:r.resumeCount,restored:r.restored,incorrectResultOpens:r.incorrectResultOpens,observedBrowserActiveMs:r.activeElapsedMs,observedBrowserWallMs:r.wallElapsedMs,recordedQueryReformulations:r.queryReformulations,recordingVerified:true};return {...trial,diagnosis:diagnoseTrial(trial)};
  });
  return output;
}
export async function simulateBrowser(input={}, {onProgress=()=>{},onPaused}={}) {
  const config=validateBrowserConfig(input),sessions=[],controller=new AbortController();let browser,server,deadline,currentAssignment=null,currentTaskIndex=null;
  try {
    const {chromium}=await import('playwright');
    server=await startBrowserServer();
    deadline=setTimeout(()=>{controller.abort(new Error('Browser run exceeded maxRunWallMs.'));void browser?.close().catch(()=>{});},config.browser.maxRunWallMs);
    const nativeVisibility=config.browser.interruptions.some(f=>f.kind==='hidden');
    if(!nativeVisibility)browser=await chromium.launch({headless:!config.browser.headed,timeout:config.browser.launchTimeoutMs,...(process.env.SEARCHASSIST_CHROMIUM_PATH?{executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH}:{})});
    let browserVersion=browser?.version();
    for(const profileName of config.profiles)for(let replicate=0;replicate<config.replicates;replicate++)for(const slot of config.browser.assignmentSlots) {
      controller.signal.throwIfAborted();
      const participant=`SIM_${String(sessions.length+1).padStart(5,'0')}`,order=orders[slot%6],setRotation=Math.floor(slot/6),assignment={participant,order,setRotation};
      currentAssignment={...assignment,profile:profileName,replicate:replicate+1,slot};currentTaskIndex=null;
      onProgress({participant,profile:profileName,slot,completedSessions:sessions.length});
      const native=nativeVisibility?await launchNativeBrowser(chromium,{timeout:config.browser.launchTimeoutMs,downloadTimeout:config.browser.actionTimeoutMs,signal:controller.signal}):null;
      if(native){browser=native.browser;browserVersion??=browser.version();}
      const context=native?.context??await browser.newContext({acceptDownloads:true,serviceWorkers:'block',viewport:{width:1440,height:1000}}),errors=[],blockedExternalOrigins=new Set();
      try {
        context.setDefaultTimeout(config.browser.actionTimeoutMs);context.setDefaultNavigationTimeout(config.browser.actionTimeoutMs);
        await context.route('**/*',route=>{if(new URL(route.request().url()).origin===server.origin)return route.continue();blockedExternalOrigins.add(new URL(route.request().url()).origin);return route.abort();});
        const page=native?(context.pages()[0]??await context.newPage()):await context.newPage();if(native)await page.setViewportSize({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));
        await page.goto(server.origin+'/?simulation=1#study');if(config.browser.headed){await page.bringToFront();await page.waitForFunction(()=>!document.hidden);}await page.locator('#simulation-notice').waitFor({state:'visible'});
        await page.locator('#participant-code').fill(participant);await page.locator('#condition-order').selectOption(order);await page.locator('#set-rotation').selectOption(String(setRotation));
        await page.locator('#start-study input[type=checkbox]').check();await page.locator('#start-study button').click();
        const trials=[];
        for(let i=0;i<12;i++) {
          currentTaskIndex=i+1;
          await page.locator('#pause-task').waitFor({state:'visible'});
          trials.push(await runBrowserTrial({page,profile:resolveProfile(config,profileName),config,agentKey:[profileName,replicate,slot],taskKey:[(Math.floor(i/4)+setRotation)%3,i%4],signal:controller.signal,taskIndex:i+1,onPaused}));
          if((i+1)%4===0){await page.locator('#continue-simulation').waitFor({state:'visible'});assert.equal(await page.locator('#ratings-form').count(),0);await page.locator('#continue-simulation').click();}
        }
        // The evaluator downloads the tagged recording only after all policy decisions.
        const download=await readBrowserDownload(page,'#export-json');assert.ok(download.filename.endsWith('.simulation.json'));
        const recording=JSON.parse(download.text);
        const verified=reconcileRecording(recording,trials,assignment);assert.deepEqual(errors,[]);
        sessions.push({format:'searchassist-simulation-session',schemaVersion:1,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',...assignment,profile:profileName,replicate:replicate+1,assignmentSlot:slot,humanRatings:null,trials:verified,browserRecording:recording,blockedExternalOrigins:[...blockedExternalOrigins].sort()});
      } finally {if(native)await native.close();else await context.close();}
    }
    return {format:SIMULATION_FORMAT,schemaVersion:1,applicationVersion:'1.5',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',modelVersion:MODEL_VERSIONS[config.policyVersion],adapterVersion:BROWSER_ADAPTER_VERSION,rngVersion:RNG_VERSION,timingVersion:TIMING_VERSION,
      datasetVersion:'synthetic-directory-v1',protocolVersion:'controlled-tasks-v1',measurementDefinition:'modeled-operator-time-v1',browserMeasurementDefinition:'active-time-v2-automation',browserVersion,reconciliationVersion:RECONCILIATION_VERSION,
      browserControlMode:nativeVisibility?'owned-native-cdp-no-defaults':'playwright-isolated-context',interruptionVersion:INTERRUPTION_VERSION,humanRatings:null,config,resolvedProfiles:Object.fromEntries(config.profiles.map(p=>[p,resolveProfile(config,p)])),sessions};
  } catch(error) {
    const failure=new Error(controller.signal.aborted?'Browser run exceeded maxRunWallMs.':error.message,{cause:error});
    failure.simulationFailure={format:'searchassist-simulation-failure',schemaVersion:1,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',completedSessions:sessions.length,assignment:currentAssignment,taskIndex:currentTaskIndex,reason:failure.message};throw failure;
  } finally {clearTimeout(deadline);controller.abort();await browser?.close();await server?.close();}
}
