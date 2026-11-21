import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startBrowserServer} from '../simulator/browser-server.mjs';
import {createBrowserAdapter} from '../simulator/browser-adapter.mjs';
import {simulateBrowser} from '../simulator/browser-runner.mjs';
import {prepareOutput,writeRunArtifacts} from '../simulator/artifacts.mjs';
import {renderSimulationReport} from '../simulator/report.mjs';
import {SIMULATION_STORAGE_KEY} from '../dist/simulation-session.mjs';
import {STORAGE_KEY,validateSession} from '../dist/study.mjs';
await mkdir('test-results',{recursive:true});
const server=await startBrowserServer();let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.SEARCHASSIST_CHROMIUM_PATH?{executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH}:{})});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.get(server.origin+'/../package.json')).status(),404);assert.equal((await context.request.get(server.origin+'/simulation-runs/private.json')).status(),404);
 // Preserve an existing participant-format QA recording in this tab while synthetic mode uses its own key.
 await page.goto(server.origin+'/#study');await page.locator('#participant-code').fill('NORMAL_QA');await page.locator('#start-study input[type=checkbox]').check();await page.locator('#start-study button').click();await page.locator('#pause-task').click();
 const normal=await page.evaluate(key=>sessionStorage.getItem(key),STORAGE_KEY);
 await page.goto(server.origin+'/?simulation=1#study');assert.equal(await page.locator('#resume-session').count(),0);assert.equal(await page.locator('#import-session').count(),0);
 await page.locator('#participant-code').fill('SIM_ADAPTER');await page.locator('#condition-order').selectOption('CBA');await page.locator('#start-study input[type=checkbox]').check();await page.locator('#start-study button').click();
 const adapter=createBrowserAdapter(page),state=await adapter.observe(),handle=state.candidates[0].handle;
 assert.equal(state.query,'calender');assert.equal(state.suggestionAvailable,true);assert.ok(!JSON.stringify(state).includes('calendar"'));
 assert.match((await adapter.execute({type:'read_card',handle})).card.text,/Calendar/);
 await adapter.execute({type:'read_explanation',handle});await adapter.execute({type:'read_suggestion'});await adapter.execute({type:'apply_suggestion'});
 assert.equal((await adapter.observe()).query,'calendar');await assert.rejects(()=>adapter.preview({type:'read_card',handle}),/stale/);
 await adapter.execute({type:'undo_suggestion'});assert.equal((await adapter.observe()).query,'calender');
 const current=(await adapter.observe()).candidates[0].handle;await adapter.execute({type:'open_details',handle:current,read:false});await adapter.execute({type:'read_details',handle:current});await assert.rejects(()=>adapter.preview({type:'rewrite',query:'account'}),/Close/);
 await page.screenshot({path:'test-results/browser-runner-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/browser-runner-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1440,height:1000});
 await adapter.execute({type:'close_details'});await adapter.execute({type:'rewrite',query:'zzzznothing'});assert.equal((await adapter.observe()).totalResults,0);await adapter.execute({type:'skip'});
 // Paging on public controls and a real incorrect submission are valid synthetic actions.
 await page.locator('#query').fill('');await page.locator('#query').press('Enter');const paging=createBrowserAdapter(page);assert.equal((await paging.observe()).candidates.length,12);await paging.execute({type:'show_more'});assert.equal((await paging.observe()).candidates.length,24);
 const first=(await paging.observe()).candidates[0].handle;await paging.execute({type:'read_card',handle:first});await paging.execute({type:'open_details',handle:first,read:false});await paging.execute({type:'submit',handle:first});assert.ok(paging.selectionId());
 await page.locator('#skip-task').click();await page.locator('#skip-task').click();await page.locator('#continue-simulation').waitFor({state:'visible'});assert.equal(await page.locator('#ratings-form').count(),0);await page.locator('#continue-simulation').click();await page.locator('#pause-task').click();
 const pending=page.waitForEvent('download');await page.locator('#export-json').click();const download=await pending,recordingText=await readFile(await download.path(),'utf8'),recording=JSON.parse(recordingText);
 assert.ok(download.suggestedFilename().endsWith('.simulation.json'));assert.deepEqual(recording.ratings,[]);assert.equal(recording.humanRatings,null);assert.throws(()=>validateSession(recordingText),/Simulated data/);
 const csvPending=page.waitForEvent('download');await page.locator('#export-csv').click();const csvDownload=await csvPending;assert.match(await readFile(await csvDownload.path(),'utf8'),/"synthetic","uncalibrated","browser"/);assert.equal(await page.locator('#export-summary').count(),0);
 assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),STORAGE_KEY),normal);assert.ok(await page.evaluate(key=>sessionStorage.getItem(key),SIMULATION_STORAGE_KEY));
 await page.reload();await page.locator('#start-study').waitFor({state:'visible'});assert.equal(await page.locator('#resume-session').count(),0);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),SIMULATION_STORAGE_KEY),null);assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),STORAGE_KEY),normal);
 await page.goto(server.origin+'/#study');await page.locator('#import-session').setInputFiles({name:'SIM.simulation.json',mimeType:'application/json',buffer:Buffer.from(recordingText)});await page.locator('#import-status').filter({hasText:'Simulated data cannot'}).waitFor();assert.equal(JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),STORAGE_KEY)).participant,'NORMAL_QA');
 await page.goto(server.origin+'/#workspace');await page.locator('#review-files').setInputFiles({name:'SIM.simulation.json',mimeType:'application/json',buffer:Buffer.from(recordingText)});await page.locator('#review-status').filter({hasText:'0 valid and 1 invalid'}).waitFor();
 assert.deepEqual(errors,[]);await context.close();await browser.close();browser=null;
 // The supplied full configuration exercises every profile and all 18 order/rotation assignments.
 const config=JSON.parse(await readFile('configs/simulator-browser-profiles.json','utf8'));
 const run=await simulateBrowser(config,{onProgress:p=>console.log(`Browser ${p.completedSessions+1}/108: ${p.profile} slot ${p.slot}`)});
 assert.equal(run.sessions.length,108);assert.ok(run.sessions.every(s=>s.trials.length===12&&s.trials.every(t=>t.recordingVerified)));
 const destination=await prepareOutput('simulation-runs/ci-browser-profiles');await writeRunArtifacts(run,destination);
 // Replayed decisions and modeled costs are deterministic; observed automation time is intentionally not.
 const replay=await simulateBrowser({profiles:['careful-scanner'],browser:{assignmentSlots:[0]}});
 assert.deepEqual(replay.sessions[0].trials.map(t=>t.trace),run.sessions[0].trials.map(t=>t.trace));assert.deepEqual(replay.sessions[0].trials.map(t=>t.ledger),run.sessions[0].trials.map(t=>t.ledger));
 const fastTiming={keyMs:[1,1,1],wordMs:[1,1,1],decisionMs:[1,1,1],pointClickMs:[1,1,1],systemWaitMs:0};
 const paced=await simulateBrowser({profiles:['careful-scanner'],timing:fastTiming,browser:{assignmentSlots:[7],pacing:'modeled'}});assert.ok(paced.sessions[0].trials.every(t=>t.observedBrowserActiveMs+3>=t.modeledActiveMs));
 const stopped=await simulateBrowser({profiles:['careful-scanner'],limits:{maxModeledActiveMs:1000},browser:{assignmentSlots:[14]}});assert.ok(stopped.sessions[0].trials.every(t=>t.termination==='time-budget'&&t.skipped&&t.recordingVerified));
 await assert.rejects(()=>simulateBrowser({profiles:['careful-scanner'],browser:{assignmentSlots:[0],pacing:'modeled',maxRunWallMs:1000}}),e=>e.simulationFailure?.format==='searchassist-simulation-failure'&&/maxRunWallMs/.test(e.message));
 browser=await chromium.launch({headless:true,...(process.env.SEARCHASSIST_CHROMIUM_PATH?{executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH}:{})});const reportPage=await browser.newPage({viewport:{width:1440,height:1000}});await reportPage.setContent(renderSimulationReport(run));await reportPage.screenshot({path:'test-results/browser-report-desktop.png',fullPage:true});await reportPage.pdf({path:'test-results/browser-report.pdf',printBackground:true,preferCSSPageSize:true});await reportPage.setViewportSize({width:390,height:844});await reportPage.screenshot({path:'test-results/browser-report-mobile.png',fullPage:true});assert.equal(await reportPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('Browser runner checks passed: 108 sessions, 1296 reconciled tasks, replayed decisions/costs, paced waits, budget stops, run timeout, adapter actions, storage isolation, synthetic imports, null ratings, and desktop/mobile/print reports.');
}finally{await browser?.close();await server.close();}
