import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {readFile} from 'node:fs/promises';
import {SIMULATION_STORAGE_KEY,validateSimulationRecording} from '../dist/simulation-session.mjs';
const focusSessions=new WeakMap();
async function focusSession(page){let session=focusSessions.get(page);if(!session){session=await page.context().newCDPSession(page);focusSessions.set(page,session);}return session;}
export const INTERRUPTION_VERSION='browser-recovery-v1';
// Evaluator-only control plane. Checkpoints and exports are never passed to the search policy.
export async function syntheticCheckpoint(page) {
  const text=await page.evaluate(key=>sessionStorage.getItem(key),SIMULATION_STORAGE_KEY);
  return validateSimulationRecording(text);
}
async function downloadPaused(page) {
  const pending=page.waitForEvent('download');await page.locator('#export-json').click();const file=await pending;
  assert.equal(await file.failure(),null);assert.ok(file.suggestedFilename().endsWith('.simulation.json'));
  return validateSimulationRecording(await readFile(await file.path(),'utf8'));
}
function sameProgress(before,after) {
  for(const key of ['participant','order','setRotation','taskIndex','startedAt'])assert.deepEqual(after[key],before[key],`Recovery changed ${key}.`);
  assert.deepEqual(after.trials,before.trials,'Recovery changed completed trials.');assert.deepEqual(after.ratings,[]);assert.equal(after.humanRatings,null);
  for(const key of ['initialQuery','query','previousQuery','queryReformulations'])assert.deepEqual(after.currentTrial[key],before.currentTrial[key],`Recovery changed ${key}.`);
}
export async function interruptBrowserTrial({page,entry,signal,onPaused=async()=>{}}) {
  signal?.throwIfAborted();
  const before=await syntheticCheckpoint(page);assert.equal(before.phase,'tasks');assert.equal(before.taskIndex+1,entry.taskIndex);assert.equal(before.currentTrial.runningAtSave,true);
  const queryBefore=await page.locator('#query').inputValue();assert.equal(queryBefore,before.currentTrial.query);
  const visibilityBefore=await page.evaluate(()=>document.visibilityState);assert.equal(visibilityBefore,'visible');
  const dialogWasOpen=await page.locator('#detail-dialog').isVisible(),dialogClosedForControl=dialogWasOpen&&['manual','navigation','restore'].includes(entry.kind);
  let cover,nativeFocus,windowIds=null,visibilityDuring=visibilityBefore,pausedStart,pausedEnd;
  try {
    if(dialogClosedForControl)await page.locator('#detail-dialog .dialog-close').click();
    if(entry.kind==='manual'||entry.kind==='restore')await page.locator('#pause-task').click();
    if(entry.kind==='navigation'){await page.locator('[data-view="research"]').click();await page.locator('#view-research').waitFor({state:'visible'});}
    if(entry.kind==='reload')await page.reload();
    if(entry.kind==='hidden') {
      // Playwright enables focus emulation on pages. Disable that override temporarily
      // so tab activation produces native document visibility rather than an emulated visible state.
      await page.bringToFront();nativeFocus=await focusSession(page);
      // Some Chromium versions skip a false command on a new agent whose local state
      // is already false, even while Playwright's original agent emulates focus.
      // Establish true on this agent, then disable it to clear the page-level override.
      await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:true});await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:false});await page.waitForFunction(()=>!document.hidden);
      const popup=page.waitForEvent('popup');await page.evaluate(()=>{window.open('about:blank','_blank');});cover=await popup;await cover.bringToFront();
      const originalTarget=await nativeFocus.send('Target.getTargetInfo'),coverSession=await page.context().newCDPSession(cover);
      try{const coverTarget=await coverSession.send('Target.getTargetInfo');const originalWindow=await nativeFocus.send('Browser.getWindowForTarget',{targetId:originalTarget.targetInfo.targetId}),coverWindow=await coverSession.send('Browser.getWindowForTarget',{targetId:coverTarget.targetInfo.targetId});windowIds={original:originalWindow.windowId,cover:coverWindow.windowId};assert.equal(windowIds.original,windowIds.cover,'Hidden-tab test needs an actual sibling tab in the same browser window.');}finally{await coverSession.detach();}
      try{await page.waitForFunction(()=>document.hidden,null,{timeout:5000,polling:50});}catch{throw new Error('Native hidden-tab state was not observed. Use headed Chromium with a real display or Xvfb; no visibility event is faked.');}
      visibilityDuring=await page.evaluate(()=>document.visibilityState);assert.equal(visibilityDuring,'hidden');
    }
    if(!['hidden','navigation'].includes(entry.kind))await page.locator('#resume-session').waitFor({state:'visible'});
    else await page.waitForFunction(key=>{const s=JSON.parse(sessionStorage.getItem(key));return s?.currentTrial?.runningAtSave===false;},SIMULATION_STORAGE_KEY,{polling:50});
    pausedStart=await syntheticCheckpoint(page);sameProgress(before,pausedStart);assert.equal(pausedStart.currentTrial.runningAtSave,false);
    const expectedReason={manual:'manual',navigation:'navigation',hidden:'tab_hidden',reload:'restored',restore:'manual'}[entry.kind];assert.equal(pausedStart.currentTrial.pauseReason,expectedReason);
    assert.equal(pausedStart.currentTrial.pauseCount,before.currentTrial.pauseCount+1);
    const holdStarted=performance.now();await delay(entry.holdMs,undefined,{signal});const observedHoldMs=Math.round(performance.now()-holdStarted);
    if(cover){await page.bringToFront();await page.waitForFunction(()=>!document.hidden);await cover.close();cover=null;await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:true});nativeFocus=null;}
    if(entry.kind==='navigation')await page.locator('[data-view="study"]').click();
    await page.locator('#resume-session').waitFor({state:'visible'});assert.equal(await page.locator('#pause-task').isVisible(),false,'Recovery resumed automatically.');
    pausedEnd=await downloadPaused(page);sameProgress(before,pausedEnd);
    assert.equal(pausedEnd.currentTrial.activeMs,pausedStart.currentTrial.activeMs,'Paused active time advanced.');
    assert.ok(pausedEnd.currentTrial.wallElapsedMs-pausedStart.currentTrial.wallElapsedMs>=observedHoldMs-50,'Paused wall time did not include the controlled idle interval.');
    if(entry.kind==='restore') {
      page.once('dialog',d=>d.accept());await page.locator('#clear-session').click();await page.locator('#start-study').waitFor({state:'visible'});
      await page.locator('#import-simulation').setInputFiles({name:'recovery.simulation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pausedEnd))});
      await page.locator('#resume-session').waitFor({state:'visible'});pausedEnd=await downloadPaused(page);sameProgress(before,pausedEnd);
      assert.equal(pausedEnd.currentTrial.activeMs,pausedStart.currentTrial.activeMs);
    }
    const restores=['reload','restore'].includes(entry.kind)?1:0;
    const restoredEvents=s=>s.events.filter(e=>e.taskIndex===before.taskIndex&&e.type==='session_restored').length;
    assert.equal(restoredEvents(pausedEnd)-restoredEvents(before),restores);
    assert.equal(pausedEnd.currentTrial.restored,before.currentTrial.restored||restores===1);
    await onPaused(page,entry);
    const pausedActive=pausedEnd.currentTrial.activeMs;
    await page.locator('#resume-session').click();await page.locator('#pause-task').waitFor({state:'visible'});
    const after=await syntheticCheckpoint(page);sameProgress(before,after);assert.equal(after.currentTrial.runningAtSave,true);assert.equal(after.currentTrial.resumeCount,before.currentTrial.resumeCount+1);assert.ok(after.currentTrial.activeMs>=pausedActive);
    assert.equal(await page.locator('#query').inputValue(),queryBefore);assert.equal(await page.locator('#simulation-notice').isVisible(),true);assert.equal(await page.locator('#ratings-form').count(),0);
    return {...entry,dialogWasOpen,dialogClosedForControl,queryBefore,queryAfter:after.currentTrial.query,previousQueryBefore:before.currentTrial.previousQuery,previousQueryAfter:after.currentTrial.previousQuery,
      completedTrialsBefore:before.trials.length,completedTrialsAfter:after.trials.length,observedHoldMs,
      activePausedStartMs:pausedStart.currentTrial.activeMs,activePausedEndMs:pausedEnd.currentTrial.activeMs,
      wallPausedStartMs:pausedStart.currentTrial.wallElapsedMs,wallPausedEndMs:pausedEnd.currentTrial.wallElapsedMs,
      pauseCountBefore:before.currentTrial.pauseCount,pauseCountAfter:after.currentTrial.pauseCount,resumeCountBefore:before.currentTrial.resumeCount,resumeCountAfter:after.currentTrial.resumeCount,
      restoreEventsBefore:restoredEvents(before),restoreEventsAfter:restoredEvents(after),restoredAfter:after.currentTrial.restored,
      pauseReason:expectedReason,nativeWindowId:windowIds?.original??null,coverWindowId:windowIds?.cover??null,visibilityMethod:entry.kind==='hidden'?'native-tab-focus-override-disabled':'not-applicable',visibilityBefore,visibilityDuring,visibilityAfter:await page.evaluate(()=>document.visibilityState),verified:true};
  }catch(error){throw new Error(`[${entry.id} ${entry.kind}, task ${entry.taskIndex}, after action ${entry.afterAction}] ${error.message}`,{cause:error});}
  finally{if(cover){await page.bringToFront().catch(()=>{});await cover.close().catch(()=>{});}if(nativeFocus){await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:true}).catch(()=>{});// Keep this agent attached until its isolated context closes; detaching a focused
      // agent can clear the page-level override again on some Chromium versions.
      }}
}
