import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {readStoredFiles} from './zip-reader.mjs';
import * as study from '../dist/study.mjs';

// A temporary local server and synthetic fixtures keep browser QA independent of hosting or participant data.
const root = resolve('dist');
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + (new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname));
    if (!path.startsWith(root + '/')) {response.writeHead(403).end();return;}
    const content = await readFile(path);
    response.writeHead(200, {'Content-Type': {'.html':'text/html','.mjs':'text/javascript','.css':'text/css'}[extname(path)] ?? 'application/octet-stream'}).end(content);
  } catch {response.writeHead(404).end();}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const upload = (name, text) => ({name, mimeType:'application/json', buffer:Buffer.from(text)});
const at = ms => ({wall:Date.UTC(2026,10,7)+ms,mono:ms});
function fixture(participant, count = 12, {durations={A:500,B:500,C:500},fail=[],interrupt=[],order='ABC',setRotation=0,ratings={A:{confidence:4,trust:5,ease:6},B:{confidence:4,trust:5,ease:6},C:{confidence:4,trust:5,ease:6}},submitLast=true}={}) {
  const s = study.createSession({participant,order,setRotation},at(0));
  let ms=0;
  for (let i=0;i<count;i++) {
    study.startTrial(s,at(ms));const task=study.taskAt(s),condition=s.order[Math.floor(i/4)],key=`${condition}:${task.type}`,d=durations[condition];
    if(interrupt.includes(key)){study.pauseTrial(s,'manual',at(ms+d/2));study.resumeTrial(s,at(ms+d/2+1000));ms+=1000;}
    ms+=d;study.completeTrial(s,fail.includes(key)?null:task.target,at(ms));
    if(s.phase==='ratings'){const values={...ratings[condition],notes:'PRIVATE_RATING_OBSERVATION'};if(i===count-1&&!submitLast)s.ratingDraft=values;else study.addRatings(s,values,at(ms));}
  }
  return JSON.stringify(study.snapshot(s,at(ms)));
}
async function downloaded(page, selector) {
  const pending = page.waitForEvent('download');await page.locator(selector).click();
  const download = await pending;
  assert.equal(await download.failure(),null);
  return readFile(await download.path(),'utf8');
}
async function downloadedBytes(page,selector) {
  const pending=page.waitForEvent('download');await page.locator(selector).click();const download=await pending;
  assert.equal(await download.failure(),null);return readFile(await download.path());
}
async function visible(page, selector) {await page.locator(selector).waitFor({state:'visible'});}
async function checkSession(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)),study.STORAGE_KEY);
}
try {
  browser = await chromium.launch({headless:true,...(process.env.SEARCHASSIST_CHROMIUM_PATH ? {executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH} : {})});
  const context = await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});
  context.setDefaultTimeout(15000);
  const page = await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url+'/#workspace');
  await visible(page,'#assignment-table');
  assert.equal(await page.locator('[data-assignment]').count(),18);
  const planCsv = await downloaded(page,'#download-plan');assert.equal(planCsv.split('\r\n').length,19);
  await page.locator('[data-assignment="6"]').click();
  await visible(page,'#start-study');
  assert.equal(await page.locator('#participant-code').inputValue(),'P007');
  assert.equal(await page.locator('#condition-order').inputValue(),'ABC');
  assert.equal(await page.locator('#set-rotation').inputValue(),'1');
  await page.locator('#start-study input[type=checkbox]').check();
  await page.locator('#start-study button').click();
  await visible(page,'#pause-task');
  await page.locator('#query').fill('library');
  await page.locator('#pause-task').click();await visible(page,'#resume-session');
  const paused = await checkSession(page);assert.equal(paused.currentTrial.query,'library');
  await page.reload();await visible(page,'#resume-session');
  const reloaded = await checkSession(page);assert.equal(reloaded.currentTrial.activeMs,paused.currentTrial.activeMs);
  await page.locator('#resume-session').click();assert.equal(await page.locator('#query').inputValue(),'library');
  await page.locator('#pause-task').click();await visible(page,'#export-json');
  const json = await downloaded(page,'#export-json');assert.equal(JSON.parse(json).participant,'P007');
  await page.locator('#import-session').setInputFiles(upload('invalid.json','{'));
  await page.locator('#import-status').filter({hasText:'not valid JSON'}).waitFor();
  assert.equal((await checkSession(page)).participant,'P007');
  // Dismiss the replacement prompt and verify current progress survives.
  const cancellation = new Promise(done => page.once('dialog', async dialog => {await dialog.dismiss();done();}));
  await page.locator('#import-session').setInputFiles(upload('valid.json',fixture('QA_REPLACE')));
  await cancellation;
  assert.equal((await checkSession(page)).participant,'P007');
  const fresh = await context.newPage();fresh.on('pageerror',error=>errors.push(error.message));
  await fresh.goto(url+'/#study');
  await fresh.locator('#import-session').setInputFiles(upload('saved.json',json));await visible(fresh,'#resume-session');
  await fresh.locator('#resume-session').click();assert.equal(await fresh.locator('#query').inputValue(),'library');
  await fresh.locator('#query').fill('library research');
  await fresh.locator('[data-record="library"]').click();await fresh.locator('#submit-result').click();
  for(let i=0;i<3;i++)await fresh.locator('#skip-task').click();
  await visible(fresh,'#ratings-form');
  await fresh.locator('input[name=confidence][value="6"]').check();
  await fresh.locator('textarea[name=notes]').fill('Draft observation');
  await fresh.reload();await visible(fresh,'#ratings-form');
  assert.equal(await fresh.locator('input[name=confidence][value="6"]').isChecked(),true);
  assert.equal(await fresh.locator('textarea[name=notes]').inputValue(),'Draft observation');
  const trials = await downloaded(fresh,'#export-csv');assert.equal(trials.split('\r\n').length,5);
  const summary = await downloaded(fresh,'#export-summary');assert.equal(summary.split('\r\n').length,4);
  await fresh.locator('a[data-view=workspace]').click();await visible(fresh,'#review-files');
  await fresh.locator('#review-files').setInputFiles([
    upload('one.json',fixture('QA_A')),upload('duplicate.json',fixture('qa_a')),
    upload('two.json',fixture('QA_B')),upload('partial.json',fixture('QA_C',1)),upload('bad.json','{')
  ]);
  await fresh.locator('#review-status').filter({hasText:'4 valid and 1 invalid'}).waitFor();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/1 session/);
  await fresh.locator('[data-review-id="0"]').check();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/2 session/);
  await fresh.locator('[data-review-id="1"]').check();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/Resolve repeated/);
  await fresh.locator('[data-review-id="1"]').uncheck();
  await fresh.locator('#include-partial').check();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/3 session/);
  const review = await downloaded(fresh,'#download-review');assert.equal(review.split('\r\n').length,10);
  const audit = await downloaded(fresh,'#download-audit');assert.equal(audit.split('\r\n').length,6);
  assert.equal((await checkSession(fresh)).participant,'P007');
  // Save a complete facilitator workspace, including choices, filters, notes, and a custom plan.
  await fresh.locator('[data-review-note="1"]').fill('Duplicate excluded; keep original export');
  await fresh.locator('#exclude-interrupted').check();
  await fresh.locator('#plan-prefix').fill('QA_');
  await fresh.locator('#plan-start').fill('19');
  await fresh.locator('#plan-count').fill('6');
  await fresh.locator('#assignment-form button').click();
  assert.match(await fresh.locator('#project-dirty').innerText(),/Unsaved/);
  const projectJson = await downloaded(fresh,'#save-project');
  const projectData = JSON.parse(projectJson);
  assert.equal(projectData.format,'searchassist-review-project');
  assert.equal(projectData.files.length,5);assert.equal(projectData.files[1].choice,false);
  assert.equal(projectData.files[1].decisionNote,'Duplicate excluded; keep original export');
  assert.equal(projectData.analysis.excludeInterrupted,true);
  assert.match(await fresh.locator('#project-dirty').innerText(),/No unsaved/);
  const savedReviewCsv = await downloaded(fresh,'#download-review');
  const savedAuditCsv = await downloaded(fresh,'#download-audit');
  assert.match(savedAuditCsv,/Duplicate excluded; keep original export/);
  await fresh.locator('#open-project').setInputFiles(upload('broken-project.json','{'));
  await fresh.locator('#project-status').filter({hasText:'not valid JSON'}).waitFor();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/3 session/);
  const badProject = structuredClone(projectData);badProject.files[0].session.trials[0].success=false;
  await fresh.locator('#open-project').setInputFiles(upload('damaged-recording.json',JSON.stringify(badProject)));
  await fresh.locator('#project-status').filter({hasText:'Recording 1 is invalid'}).waitFor();
  const cancelWorkspace = new Promise(done => fresh.once('dialog',async dialog=>{await dialog.dismiss();done();}));
  await fresh.locator('#open-project').setInputFiles(upload('workspace.json',projectJson));
  await cancelWorkspace;
  await fresh.locator('#project-status').filter({hasText:'Opening cancelled'}).waitFor();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/3 session/);
  await mkdir('test-results',{recursive:true});
  await fresh.evaluate(()=>window.scrollTo(0,0));
  await fresh.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
  await fresh.setViewportSize({width:390,height:844});
  await fresh.evaluate(()=>window.scrollTo(0,0));
  await fresh.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
  assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile layout overflows');
  await fresh.reload();await visible(fresh,'#review-files');
  assert.match(await fresh.locator('#duplicate-status').innerText(),/0 session/);
  await fresh.locator('#open-project').setInputFiles(upload('workspace.json',projectJson));
  await fresh.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/3 session/);
  assert.equal(await fresh.locator('#include-partial').isChecked(),true);
  assert.equal(await fresh.locator('#exclude-interrupted').isChecked(),true);
  assert.equal(await fresh.locator('#plan-prefix').inputValue(),'QA_');
  assert.equal(await fresh.locator('#plan-start').inputValue(),'19');
  assert.equal(await fresh.locator('[data-assignment]').count(),6);
  assert.equal(await fresh.locator('[data-review-note="1"]').inputValue(),'Duplicate excluded; keep original export');
  assert.equal(await downloaded(fresh,'#download-review'),savedReviewCsv);
  assert.equal(await downloaded(fresh,'#download-audit'),savedAuditCsv);
  assert.equal((await checkSession(fresh)).participant,'P007');
  const replacement = structuredClone(projectData);replacement.files[1].decisionNote='Replacement accepted';replacement.analysis.includePartial=false;
  const acceptWorkspace = new Promise(done=>fresh.once('dialog',async dialog=>{await dialog.accept();done();}));
  await fresh.locator('#open-project').setInputFiles(upload('replacement.json',JSON.stringify(replacement)));
  await acceptWorkspace;
  await fresh.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.match(await fresh.locator('#duplicate-status').innerText(),/2 session/);
  assert.equal(await fresh.locator('[data-review-note="1"]').inputValue(),'Replacement accepted');
  await fresh.locator('#plan-start').fill('50');
  await fresh.locator('#save-project').click();
  await fresh.locator('#project-status').filter({hasText:'Generate the assignment schedule'}).waitFor();
  assert.equal((await checkSession(fresh)).participant,'P007');
  const pairedPage=await context.newPage();pairedPage.on('pageerror',error=>errors.push(error.message));
  await pairedPage.goto(url+'/#workspace');
  assert.equal(await pairedPage.locator('#download-paired').isEnabled(),false);
  await pairedPage.locator('#review-files').setInputFiles([
    upload('pair-one.json',fixture('PAIR1',12,{durations:{A:1000,B:700,C:400},fail:['A:spelling']})),
    upload('pair-two.json',fixture('PAIR2',12,{durations:{A:2000,B:1000,C:500},interrupt:['B:alias']})),
    upload('pair-partial.json',fixture('PAIR3',8,{durations:{A:1000,B:900,C:500}}))
  ]);
  await pairedPage.locator('#review-status').filter({hasText:'3 valid and 0 invalid'}).waitFor();
  const pairedCells=()=>pairedPage.locator('#paired-table tbody tr').first().locator('td');
  assert.equal(await pairedCells().nth(1).innerText(),'2');
  assert.equal(await pairedCells().nth(2).innerText(),'+12.50 pp');
  assert.equal(await pairedCells().nth(4).innerText(),'7');
  assert.equal(await pairedCells().nth(5).innerText(),'-0.65 s');
  await pairedPage.locator('#include-partial').check();
  assert.equal(await pairedCells().nth(1).innerText(),'3');
  assert.equal(await pairedPage.locator('#paired-table tbody tr').nth(1).locator('td').nth(1).innerText(),'2');
  await pairedPage.locator('#exclude-interrupted').check();
  assert.equal(await pairedCells().nth(4).innerText(),'10');
  await pairedPage.locator('#paired-successful-only').uncheck();
  assert.equal(await pairedCells().nth(4).innerText(),'11');
  assert.equal(await pairedCells().nth(2).innerText(),'+8.33 pp');
  const pairedParticipantCsv=await downloaded(pairedPage,'#download-paired');
  assert.equal(pairedParticipantCsv.split('\r\n').length,10);
  assert.ok(pairedParticipantCsv.includes('"-300"'));assert.ok(!pairedParticipantCsv.includes('"\'-300"'));
  assert.equal((await downloaded(pairedPage,'#download-paired-summary')).split('\r\n').length,4);
  const pairedProject=await downloaded(pairedPage,'#save-project'),savedPaired=JSON.parse(pairedProject);
  assert.equal(savedPaired.projectVersion,2);assert.equal(savedPaired.analysis.pairedSuccessfulOnly,false);
  await pairedPage.reload();await visible(pairedPage,'#open-project');
  assert.equal(await pairedPage.locator('#download-paired').isEnabled(),false);
  await pairedPage.locator('#open-project').setInputFiles(upload('paired-project.json',pairedProject));
  await pairedPage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await pairedPage.locator('#paired-successful-only').isChecked(),false);
  assert.equal(await downloaded(pairedPage,'#download-paired'),pairedParticipantCsv);
  const legacy=structuredClone(savedPaired);legacy.projectVersion=1;delete legacy.analysis.pairedSuccessfulOnly;
  const acceptLegacy=new Promise(done=>pairedPage.once('dialog',async dialog=>{await dialog.accept();done();}));
  await pairedPage.locator('#open-project').setInputFiles(upload('v04-workspace.json',JSON.stringify(legacy)));await acceptLegacy;
  await pairedPage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await pairedPage.locator('#paired-successful-only').isChecked(),true);
  const damaged=structuredClone(savedPaired);delete damaged.analysis.pairedSuccessfulOnly;
  await pairedPage.locator('#open-project').setInputFiles(upload('damaged-v2.json',JSON.stringify(damaged)));
  await pairedPage.locator('#project-status').filter({hasText:'paired-timing setting is invalid'}).waitFor();
  assert.equal(await pairedPage.locator('#paired-successful-only').isChecked(),true);
  await pairedPage.evaluate(()=>window.scrollTo(0,0));
  await pairedPage.screenshot({path:'test-results/paired-desktop.png',fullPage:true});
  await pairedPage.setViewportSize({width:390,height:844});await pairedPage.evaluate(()=>window.scrollTo(0,0));
  await pairedPage.screenshot({path:'test-results/paired-mobile.png',fullPage:true});
  assert.equal(await pairedPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Paired layout overflows on mobile');
  const coveragePage=await context.newPage();coveragePage.on('pageerror',error=>errors.push(error.message));
  await coveragePage.goto(url+'/#workspace');
  assert.equal(await coveragePage.locator('#download-checks').isEnabled(),false);
  await coveragePage.locator('#plan-count').fill('4');await coveragePage.locator('#assignment-form button').click();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/4 planned.*4 not imported/);
  await coveragePage.locator('#review-files').setInputFiles([
    upload('matching.json',fixture('P001')),
    upload('wrong-duplicate.json',fixture('p001',12,{order:'CBA',setRotation:2})),
    upload('wrong-order.json',fixture('P002')),
    upload('partial.json',fixture('P003',4,{order:'BAC'})),
    upload('unplanned.json',fixture('OUTSIDE',12,{setRotation:2})),
    upload('P004.json','{')
  ]);
  await coveragePage.locator('#review-status').filter({hasText:'5 valid and 1 invalid'}).waitFor();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/3 planned code\(s\) imported.*1 not imported/);
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/0 matching plan, 1 assignment mismatch\(es\), 1 unplanned/);
  await coveragePage.locator('summary').filter({hasText:'Planned participant progress'}).click();
  await coveragePage.locator('summary').filter({hasText:'Condition order and task rotation counts'}).click();
  await coveragePage.locator('summary').filter({hasText:'Recording assignment checks'}).click();
  assert.equal(await coveragePage.locator('#coverage-progress tbody tr').count(),4);
  assert.equal(await coveragePage.locator('#coverage-balance tbody tr').count(),18);
  assert.equal(await coveragePage.locator('#coverage-progress tbody tr').nth(3).locator('td').last().innerText(),'Not imported in this batch');
  await coveragePage.locator('[data-review-id="0"]').check();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/1 matching plan/);
  await coveragePage.locator('[data-review-id="1"]').check();
  assert.equal(await coveragePage.locator('#coverage-progress tbody tr').first().locator('td').last().innerText(),'Conflicting selections');
  await coveragePage.locator('[data-review-id="1"]').uncheck();
  await coveragePage.locator('#include-partial').check();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/2 matching plan, 1 assignment mismatch\(es\), 1 unplanned/);
  const abc=coveragePage.locator('#coverage-balance tbody tr').first().locator('td');
  assert.equal(await abc.nth(2).innerText(),'1');assert.equal(await abc.nth(3).innerText(),'2');assert.equal(await abc.nth(5).innerText(),'1');
  await coveragePage.locator('[data-review-id="2"]').uncheck();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/2 matching plan, 0 assignment mismatch\(es\), 1 unplanned/);
  assert.equal(await coveragePage.locator('#coverage-checks tbody tr').nth(2).locator('td').nth(3).innerText(),'No');
  assert.match(await coveragePage.locator('#coverage-checks tbody tr').nth(2).locator('td').last().innerText(),/Order differs from plan/);
  const savedCoverage=await downloaded(coveragePage,'#download-coverage'),savedBalance=await downloaded(coveragePage,'#download-balance'),savedChecks=await downloaded(coveragePage,'#download-checks');
  assert.equal(savedCoverage.split('\r\n').length,5);assert.equal(savedBalance.split('\r\n').length,19);assert.equal(savedChecks.split('\r\n').length,7);
  await coveragePage.locator('#plan-prefix').fill('AUDIT_');await coveragePage.locator('#assignment-form button').click();
  assert.match(await coveragePage.locator('#coverage-status').innerText(),/0 planned code\(s\) imported.*4 not imported/);
  await coveragePage.locator('#plan-prefix').fill('P');await coveragePage.locator('#assignment-form button').click();
  assert.equal(await downloaded(coveragePage,'#download-coverage'),savedCoverage);
  const coverageProject=await downloaded(coveragePage,'#save-project');assert.equal(JSON.parse(coverageProject).projectVersion,2);
  await coveragePage.reload();await visible(coveragePage,'#open-project');
  await coveragePage.locator('#open-project').setInputFiles(upload('coverage-workspace.json',coverageProject));
  await coveragePage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await downloaded(coveragePage,'#download-coverage'),savedCoverage);
  assert.equal(await downloaded(coveragePage,'#download-balance'),savedBalance);
  assert.equal(await downloaded(coveragePage,'#download-checks'),savedChecks);
  await coveragePage.locator('summary').filter({hasText:'Planned participant progress'}).click();
  await coveragePage.locator('summary').filter({hasText:'Condition order and task rotation counts'}).click();
  await coveragePage.locator('summary').filter({hasText:'Recording assignment checks'}).click();
  await coveragePage.evaluate(()=>window.scrollTo(0,0));
  await coveragePage.screenshot({path:'test-results/coverage-desktop.png',fullPage:true});
  await coveragePage.setViewportSize({width:390,height:844});await coveragePage.evaluate(()=>window.scrollTo(0,0));
  await coveragePage.screenshot({path:'test-results/coverage-mobile.png',fullPage:true});
  assert.equal(await coveragePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Coverage layout overflows on mobile');
  // Reports share a read-only snapshot, invalidate after edits, and export offline HTML.
  assert.equal(await coveragePage.locator('#preview-summary').isEnabled(),true);
  assert.equal(await coveragePage.locator('#project-dirty').innerText(),'No unsaved workspace changes.');
  await coveragePage.locator('#preview-summary').click();
  const preview=coveragePage.frameLocator('#summary-frame');
  await preview.locator('h1').filter({hasText:'Study summary'}).waitFor();
  assert.equal(await preview.locator('tbody tr').count(),53);
  assert.equal(await coveragePage.locator('#summary-frame').getAttribute('sandbox'),'');
  assert.equal(await coveragePage.locator('#preview-summary').getAttribute('aria-expanded'),'true');
  const reportHtml=await downloaded(coveragePage,'#download-summary-html');
  const reportJson=await downloaded(coveragePage,'#download-summary-json'),report=JSON.parse(reportJson);
  assert.equal(report.review.importedFiles,6);assert.equal(report.review.includedRecordings,3);
  assert.equal(report.review.includedIncomplete,1);assert.equal(report.review.invalidFiles,1);
  assert.equal(report.coverage.matchingPlanIncluded,2);assert.equal(report.coverage.unplannedIncluded,1);
  assert.equal(report.balance.length,18);assert.equal(report.settings.includePartial,true);
  assert.ok(reportHtml.includes(report.generatedAt));
  assert.equal(await downloaded(coveragePage,'#download-summary-json'),reportJson);
  for(const privateText of ['P001','P003','OUTSIDE','matching.json','wrong-order.json']) {
    assert.ok(!reportHtml.includes(privateText));assert.ok(!reportJson.includes(privateText));
  }
  assert.equal(await coveragePage.locator('#project-dirty').innerText(),'No unsaved workspace changes.');
  const afterReport=JSON.parse(await downloaded(coveragePage,'#save-project')),beforeReport=JSON.parse(coverageProject);
  delete afterReport.savedAt;delete beforeReport.savedAt;assert.deepEqual(afterReport,beforeReport);
  await coveragePage.locator('#close-summary').click();
  assert.equal(await coveragePage.locator('#summary-preview').isVisible(),false);
  assert.equal(await coveragePage.locator('#preview-summary').evaluate(node=>node===document.activeElement),true);
  await coveragePage.locator('#preview-summary').click();
  await coveragePage.locator('#exclude-interrupted').check();
  assert.equal(await coveragePage.locator('#summary-preview').isVisible(),false);
  assert.equal(await coveragePage.locator('#summary-frame').getAttribute('srcdoc'),null);
  assert.equal(JSON.parse(await downloaded(coveragePage,'#download-summary-json')).settings.excludeInterrupted,true);
  await coveragePage.locator('#preview-summary').click();
  await coveragePage.locator('[data-review-note="0"]').fill('PRIVATE_REVIEW_NOTE');
  assert.equal(await coveragePage.locator('#summary-preview').isVisible(),false);
  assert.ok(!(await downloaded(coveragePage,'#download-summary-html')).includes('PRIVATE_REVIEW_NOTE'));
  await coveragePage.locator('#plan-prefix').fill('EDITED_');
  await coveragePage.locator('#preview-summary').click();
  await coveragePage.locator('#summary-status').filter({hasText:'Generate the assignment schedule'}).waitFor();
  assert.equal(await coveragePage.locator('#summary-preview').isVisible(),false);
  await coveragePage.locator('#assignment-form button').click();
  assert.equal(JSON.parse(await downloaded(coveragePage,'#download-summary-json')).coverage.plannedCodesImported,0);
  await coveragePage.locator('#preview-summary').click();
  const replaceReport=new Promise(done=>coveragePage.once('dialog',async dialog=>{await dialog.accept();done();}));
  await coveragePage.locator('#open-project').setInputFiles(upload('restored-report-workspace.json',coverageProject));await replaceReport;
  await coveragePage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await coveragePage.locator('#summary-preview').isVisible(),false);
  const restoredReport=JSON.parse(await downloaded(coveragePage,'#download-summary-json'));
  delete report.generatedAt;delete restoredReport.generatedAt;assert.deepEqual(restoredReport,report);
  await coveragePage.locator('#include-partial').uncheck();
  await coveragePage.locator('[data-review-id="0"]').uncheck();await coveragePage.locator('[data-review-id="4"]').uncheck();
  const emptyHtml=await downloaded(coveragePage,'#download-summary-html');assert.ok(emptyHtml.includes('No recordings are included'));
  assert.equal(JSON.parse(await downloaded(coveragePage,'#download-summary-json')).conditions[0].meanParticipantActiveMs,null);
  await coveragePage.locator('#clear-review').click();
  assert.equal(await coveragePage.locator('#download-summary-html').isEnabled(),false);
  assert.equal(await coveragePage.locator('#download-summary-json').isEnabled(),false);
  assert.equal(await coveragePage.locator('#preview-summary').isEnabled(),false);
  const reportPage=await context.newPage();reportPage.on('pageerror',error=>errors.push(error.message));
  const requests=[];reportPage.on('request',request=>requests.push(request.url()));
  await reportPage.setContent(reportHtml,{waitUntil:'load'});
  assert.equal(await reportPage.locator('table').count(),7);assert.equal(await reportPage.getByRole('region').count(),7);assert.equal(await reportPage.locator('section').count(),4);
  assert.deepEqual(requests,[],'Standalone report requested an external resource');
  await reportPage.screenshot({path:'test-results/summary-desktop.png',fullPage:true});
  await reportPage.pdf({path:'test-results/study-summary.pdf',printBackground:true,preferCSSPageSize:true});
  await reportPage.setViewportSize({width:390,height:844});
  assert.ok(await reportPage.locator('.table-wrap').first().evaluate(node=>node.scrollWidth>node.clientWidth));
  await reportPage.screenshot({path:'test-results/summary-mobile.png',fullPage:true});
  assert.equal(await reportPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Report layout overflows on mobile');
  const ratingsPage=await context.newPage();ratingsPage.on('pageerror',error=>errors.push(error.message));
  await ratingsPage.goto(url+'/#workspace');await visible(ratingsPage,'#ratings-table');
  assert.equal(await ratingsPage.locator('#download-ratings').isEnabled(),false);
  assert.equal(await ratingsPage.locator('#download-paired-ratings').isEnabled(),false);
  assert.equal(await ratingsPage.locator('#ratings-table tbody tr').count(),9);
  assert.equal(await ratingsPage.locator('#ratings-table tbody tr').first().locator('td').nth(4).innerText(),'—');
  const customRatings={A:{confidence:2,trust:4,ease:6},B:{confidence:6,trust:4,ease:2},C:{confidence:4,trust:7,ease:1}};
  await ratingsPage.locator('#review-files').setInputFiles([
    upload('PRIVATE_RATING_FILE.json',fixture('RATE_001',12,{ratings:customRatings})),
    upload('pending-rating.json',fixture('RATE_002',8,{ratings:customRatings,submitLast:false})),
    upload('PRIVATE_INVALID.json','{')
  ]);
  await ratingsPage.locator('#review-status').filter({hasText:'2 valid and 1 invalid'}).waitFor();
  const cells=()=>ratingsPage.locator('#ratings-table tbody tr').first().locator('td');
  assert.equal(await cells().nth(2).innerText(),'1');assert.equal(await cells().nth(4).innerText(),'2');assert.equal(await cells().nth(6).innerText(),'1');
  const direction=()=>ratingsPage.locator('#paired-ratings-table tbody tr').first().locator('td');
  assert.equal(await direction().nth(2).innerText(),'1');assert.equal(await direction().nth(4).innerText(),'1');
  assert.equal(await ratingsPage.locator('#paired-ratings-table tbody tr').nth(1).locator('td').nth(5).innerText(),'1');
  assert.equal(await ratingsPage.locator('#paired-ratings-table tbody tr').nth(2).locator('td').nth(6).innerText(),'1');
  await ratingsPage.locator('#include-partial').check();
  assert.equal(await cells().nth(2).innerText(),'2');assert.equal(await direction().nth(3).innerText(),'1');
  const bConfidence=ratingsPage.locator('#ratings-table tbody tr').nth(3).locator('td');
  assert.equal(await bConfidence.nth(2).innerText(),'1');assert.equal(await bConfidence.nth(3).innerText(),'1');
  const ratingsCsv=await downloaded(ratingsPage,'#download-ratings'),matchedCsv=await downloaded(ratingsPage,'#download-paired-ratings');
  assert.equal(ratingsCsv.split('\r\n').length,10);assert.equal(matchedCsv.split('\r\n').length,10);
  for(const text of [ratingsCsv,matchedCsv])for(const secret of ['RATE_001','PRIVATE_RATING_FILE','PRIVATE_RATING_OBSERVATION'])assert.ok(!text.includes(secret));
  await ratingsPage.locator('#exclude-interrupted').check();await ratingsPage.locator('#paired-successful-only').uncheck();
  assert.equal(await downloaded(ratingsPage,'#download-ratings'),ratingsCsv);
  assert.equal(await downloaded(ratingsPage,'#download-paired-ratings'),matchedCsv);
  const ratingsProject=await downloaded(ratingsPage,'#save-project');
  assert.equal(await ratingsPage.locator('#project-dirty').innerText(),'No unsaved workspace changes.');
  const ratingReport=JSON.parse(await downloaded(ratingsPage,'#download-summary-json'));
  assert.equal(ratingReport.summaryVersion,2);assert.equal(ratingReport.ratings[0].submittedRatings,2);
  assert.equal(ratingReport.pairedRatings[0].pairedParticipants,1);assert.equal(ratingReport.pairedRatings[0].higher,1);
  assert.equal(await ratingsPage.locator('#project-dirty').innerText(),'No unsaved workspace changes.');
  await ratingsPage.reload();await visible(ratingsPage,'#open-project');
  await ratingsPage.locator('#open-project').setInputFiles(upload('ratings-workspace.json',ratingsProject));
  await ratingsPage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await downloaded(ratingsPage,'#download-ratings'),ratingsCsv);assert.equal(await downloaded(ratingsPage,'#download-paired-ratings'),matchedCsv);
  await ratingsPage.locator('[data-review-id="0"]').uncheck();
  assert.equal(await direction().nth(2).innerText(),'0');assert.equal(await bConfidence.nth(4).innerText(),'—');
  await ratingsPage.locator('#preview-summary').click();
  await ratingsPage.frameLocator('#summary-frame').locator('h2').filter({hasText:'Confidence, trust, and ease'}).waitFor();
  await ratingsPage.locator('#close-summary').click();
  await ratingsPage.locator('[data-review-id="0"]').check();
  await ratingsPage.screenshot({path:'test-results/ratings-desktop.png',fullPage:true});
  await ratingsPage.setViewportSize({width:390,height:844});
  await ratingsPage.screenshot({path:'test-results/ratings-mobile.png',fullPage:true});
  assert.equal(await ratingsPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Ratings workspace overflows on mobile');
  await ratingsPage.locator('#clear-review').click();
  assert.equal(await ratingsPage.locator('#download-ratings').isEnabled(),false);assert.equal(await ratingsPage.locator('#download-paired-ratings').isEnabled(),false);
  const additionPage=await context.newPage();additionPage.on('pageerror',error=>errors.push(error.message));
  await additionPage.goto(url+'/#workspace');await visible(additionPage,'#add-review-files');
  assert.equal(await additionPage.locator('#undo-addition').isEnabled(),false);
  await additionPage.locator('#add-review-files').setInputFiles(upload('first.json',fixture('P001')));
  await additionPage.locator('#addition-status').filter({hasText:'1 file(s) added'}).waitFor();
  await additionPage.locator('#undo-addition').click();
  assert.equal(await additionPage.locator('#review-table tbody tr').count(),0);assert.equal(await additionPage.locator('#undo-addition').isEnabled(),false);
  assert.equal(await additionPage.locator('#add-review-files').evaluate(node=>node===document.activeElement),true);
  await additionPage.locator('#review-files').setInputFiles([upload('base.json',fixture('P001')),upload('partial-base.json',fixture('P002',4)),upload('old-invalid.json','{')]);
  await additionPage.locator('#review-status').filter({hasText:'2 valid and 1 invalid'}).waitFor();
  await additionPage.locator('#include-partial').check();await additionPage.locator('#exclude-interrupted').check();await additionPage.locator('#paired-successful-only').uncheck();
  await additionPage.locator('[data-review-id="0"]').uncheck();await additionPage.locator('[data-review-note="0"]').fill('Earlier decision');
  await additionPage.locator('#plan-count').fill('4');await additionPage.locator('#assignment-form button').click();
  await downloaded(additionPage,'#save-project');await additionPage.locator('#preview-summary').click();
  await additionPage.locator('#add-review-files').setInputFiles([upload('repeated.json',fixture('p002')),upload('new.json',fixture('P003')),upload('new-invalid.json','{')]);
  await additionPage.locator('#addition-status').filter({hasText:'3 file(s) added. 6 file(s) now'}).waitFor();
  assert.equal(await additionPage.locator('#summary-preview').isVisible(),false);
  assert.equal(await additionPage.locator('#review-table tbody tr').count(),6);
  assert.equal(await additionPage.locator('[data-review-note="0"]').inputValue(),'Earlier decision');
  assert.equal(await additionPage.locator('[data-review-id="0"]').isChecked(),false);
  assert.equal(await additionPage.locator('[data-review-id="1"]').isChecked(),false);assert.equal(await additionPage.locator('[data-review-id="3"]').isChecked(),false);
  assert.match(await additionPage.locator('#duplicate-status').innerText(),/1 session\(s\) included/);
  assert.equal(await additionPage.locator('#include-partial').isChecked(),true);assert.equal(await additionPage.locator('#exclude-interrupted').isChecked(),true);assert.equal(await additionPage.locator('#paired-successful-only').isChecked(),false);
  await additionPage.locator('[data-review-id="1"]').check();await additionPage.locator('[data-review-id="4"]').uncheck();
  await additionPage.locator('[data-review-note="0"]').fill('Edited after addition');await additionPage.locator('[data-review-note="4"]').fill('New-file note');
  const addedProject=await downloaded(additionPage,'#save-project'),addedJson=JSON.parse(addedProject);
  assert.equal(addedJson.files.length,6);assert.equal(addedJson.files[0].choice,false);assert.equal(addedJson.files[1].choice,true);assert.equal(addedJson.files[0].decisionNote,'Edited after addition');
  assert.equal(await additionPage.locator('#undo-addition').isEnabled(),true,'Saving must not reset undo');
  // Limit and read failures leave both the combined review and its undo intact.
  await additionPage.locator('#add-review-files').setInputFiles(Array.from({length:61},(_,i)=>upload(`limit-${i}.json`,'{}')));
  await additionPage.locator('#addition-status').filter({hasText:'combined review must contain at most 60'}).waitFor();
  await additionPage.locator('#add-review-files').setInputFiles(upload('too-big.json',' '.repeat(10*1024*1024)));
  await additionPage.locator('#addition-status').filter({hasText:'combined review must contain at most 60'}).waitFor();
  await additionPage.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){if(this.name==='broken-read.json')return Promise.reject(new Error('Synthetic read failure'));return original.call(this);};});
  await additionPage.locator('#add-review-files').setInputFiles(upload('broken-read.json',fixture('P004')));
  await additionPage.locator('#addition-status').filter({hasText:'Synthetic read failure'}).waitFor();
  const afterFailure=JSON.parse(await downloaded(additionPage,'#save-project'));delete afterFailure.savedAt;delete addedJson.savedAt;assert.deepEqual(afterFailure,addedJson);
  assert.equal(await additionPage.locator('#undo-addition').isEnabled(),true);
  await additionPage.locator('#preview-summary').click();await additionPage.locator('#undo-addition').click();
  assert.equal(await additionPage.locator('#summary-preview').isVisible(),false);
  assert.equal(await additionPage.locator('#review-table tbody tr').count(),3);assert.equal(await additionPage.locator('[data-review-note="0"]').inputValue(),'Edited after addition');
  assert.equal(await additionPage.locator('[data-review-id="1"]').isChecked(),true);assert.equal(await additionPage.locator('#plan-count').inputValue(),'4');
  const undone=JSON.parse(await downloaded(additionPage,'#save-project'));assert.equal(undone.files.length,3);assert.equal(undone.files[0].choice,false);assert.equal(undone.files[1].choice,true);
  assert.equal(undone.files[2].error,'This file is not valid JSON.');assert.equal(await additionPage.locator('#undo-addition').isEnabled(),false);
  // A later duplicate keeps an existing explicit choice instead of selecting the new copy.
  await additionPage.locator('#add-review-files').setInputFiles(upload('later-duplicate.json',fixture('p002')));
  await additionPage.locator('#addition-status').filter({hasText:'1 file(s) added. 4 file(s) now'}).waitFor();
  assert.equal(await additionPage.locator('[data-review-id="1"]').isChecked(),true);assert.equal(await additionPage.locator('[data-review-id="3"]').isChecked(),false);
  await additionPage.screenshot({path:'test-results/addition-desktop.png',fullPage:true});
  await additionPage.setViewportSize({width:390,height:844});await additionPage.screenshot({path:'test-results/addition-mobile.png',fullPage:true});
  assert.equal(await additionPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Addition controls overflow on mobile');
  // Reopening preserves data but intentionally resets this-visit undo state.
  const reopenAdded=await downloaded(additionPage,'#save-project');
  await additionPage.reload();await visible(additionPage,'#open-project');
  await additionPage.locator('#open-project').setInputFiles(upload('added-workspace.json',reopenAdded));
  await additionPage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await additionPage.locator('#review-table tbody tr').count(),4);assert.equal(await additionPage.locator('#undo-addition').isEnabled(),false);
  // Oversized individual files are isolated without reading them or dropping valid additions.
  await additionPage.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){if(this.name==='oversized.json')throw new Error('Oversized source must not be read');return original.call(this);};});
  await additionPage.locator('#add-review-files').setInputFiles([upload('oversized.json',' '.repeat(1024*1024+1)),upload('good-addition.json',fixture('P005'))]);
  await additionPage.locator('#addition-status').filter({hasText:'2 file(s) added. 6 file(s) now'}).waitFor();
  const isolated=JSON.parse(await downloaded(additionPage,'#save-project'));assert.equal(isolated.files[4].error,'Choose a session JSON file smaller than 1 MB.');assert.equal(isolated.files[5].session.participant,'P005');
  // Clearing during a delayed read cancels that read's eventual state update.
  await additionPage.evaluate(()=>{const original=File.prototype.text;window.releaseAdditionRead=null;File.prototype.text=function(){if(this.name==='delayed.json'){const f=this;return new Promise(resolve=>{window.releaseAdditionRead=()=>original.call(f).then(resolve);});}return original.call(this);};});
  await additionPage.locator('#add-review-files').setInputFiles(upload('delayed.json',fixture('P006')));
  await additionPage.waitForFunction(()=>typeof window.releaseAdditionRead==='function');
  await additionPage.locator('#clear-review').click();await additionPage.evaluate(()=>window.releaseAdditionRead());
  await additionPage.waitForFunction(()=>document.querySelector('#add-review-files').value==='');
  assert.equal(await additionPage.locator('#review-table tbody tr').count(),0);assert.equal(await additionPage.locator('#undo-addition').isEnabled(),false);
  assert.match(await additionPage.locator('#review-status').innerText(),/Review cleared/);
  const bundlePage=await context.newPage();bundlePage.on('pageerror',error=>errors.push(error.message));
  await bundlePage.goto(url+'/#workspace');await visible(bundlePage,'#download-bundle');
  assert.equal(await bundlePage.locator('#download-bundle').isEnabled(),false);assert.equal(await bundlePage.locator('#bundle-individual').isChecked(),false);
  await bundlePage.locator('#review-files').setInputFiles([upload('PRIVATE_BUNDLE_FILE.json',fixture('BUNDLE_SECRET_001')),upload('partial.json',fixture('BUNDLE_SECRET_002',8)),upload('invalid.json','{')]);
  await bundlePage.locator('#review-status').filter({hasText:'2 valid and 1 invalid'}).waitFor();
  await bundlePage.locator('#include-partial').check();await bundlePage.locator('#exclude-interrupted').check();await bundlePage.locator('#paired-successful-only').uncheck();
  await bundlePage.locator('[data-review-id="0"]').uncheck();await bundlePage.locator('[data-review-note="0"]').fill('PRIVATE_BUNDLE_NOTE');
  const beforeBundle=JSON.parse(await downloaded(bundlePage,'#save-project'));
  await bundlePage.locator('[data-review-note="0"]').fill('PRIVATE_BUNDLE_NOTE edited');
  const currentSummary=JSON.parse(await downloaded(bundlePage,'#download-summary-json'));
  const aggregateZip=await downloadedBytes(bundlePage,'#download-bundle');await writeFile('test-results/review-bundle-aggregate.zip',aggregateZip);
  const aggregate=readStoredFiles(aggregateZip),manifest=JSON.parse(new TextDecoder().decode(aggregate.get('manifest.json')));
  assert.equal(aggregate.size,9);assert.equal(manifest.dataScope,'aggregate-only');assert.equal(manifest.generatedAt,currentSummary.generatedAt);
  assert.ok(![...aggregate.keys()].some(path=>path.startsWith('individual/')));
  for(const secret of ['BUNDLE_SECRET_','PRIVATE_BUNDLE_FILE','PRIVATE_BUNDLE_NOTE','PRIVATE_RATING_OBSERVATION'])assert.ok(!aggregateZip.includes(Buffer.from(secret)));
  assert.match(await bundlePage.locator('#project-dirty').innerText(),/Unsaved workspace changes/);
  await bundlePage.locator('#bundle-individual').check();
  const fullZip=await downloadedBytes(bundlePage,'#download-bundle');await writeFile('test-results/review-bundle-full.zip',fullZip);
  const full=readStoredFiles(fullZip),fullManifest=JSON.parse(new TextDecoder().decode(full.get('manifest.json')));
  assert.equal(full.size,16);assert.equal(fullManifest.dataScope,'includes-individual-data');assert.equal(fullManifest.generatedAt,currentSummary.generatedAt);
  const embedded=JSON.parse(new TextDecoder().decode(full.get('individual/workspace.json')));
  assert.equal(embedded.files[0].decisionNote,'PRIVATE_BUNDLE_NOTE edited');assert.equal(embedded.files[0].choice,false);assert.equal(embedded.analysis.includePartial,true);
  assert.match(await bundlePage.locator('#project-dirty').innerText(),/Unsaved workspace changes/);
  const afterBundle=JSON.parse(await downloaded(bundlePage,'#save-project'));afterBundle.files[0].decisionNote='PRIVATE_BUNDLE_NOTE';delete afterBundle.savedAt;delete beforeBundle.savedAt;assert.deepEqual(afterBundle,beforeBundle);
  // Extracted backup reopens in the existing project workflow; ZIP itself is not an import format.
  const acceptBundleWorkspace=new Promise(done=>bundlePage.once('dialog',async dialog=>{await dialog.accept();done();}));
  await bundlePage.locator('#open-project').setInputFiles(upload('extracted-workspace.json',new TextDecoder().decode(full.get('individual/workspace.json'))));await acceptBundleWorkspace;
  await bundlePage.locator('#project-status').filter({hasText:'Workspace opened'}).waitFor();
  assert.equal(await bundlePage.locator('[data-review-note="0"]').inputValue(),'PRIVATE_BUNDLE_NOTE edited');
  await bundlePage.locator('#plan-prefix').fill('EDITED_');await bundlePage.locator('#download-bundle').click();
  await bundlePage.locator('#bundle-status').filter({hasText:'Generate the assignment schedule'}).waitFor();
  await bundlePage.locator('#plan-prefix').fill('P');await bundlePage.locator('#assignment-form button').click();
  let bundleDownloads=0;bundlePage.on('download',()=>bundleDownloads++);
  // Hash errors cannot produce a partial archive or mark the workspace saved.
  await bundlePage.evaluate(()=>{window.originalDigest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=()=>Promise.reject(new Error('Synthetic hash failure'));});
  await bundlePage.locator('#download-bundle').click();await bundlePage.locator('#bundle-status').filter({hasText:'Synthetic hash failure'}).waitFor();
  assert.equal(bundleDownloads,0);assert.equal(await bundlePage.locator('#download-bundle').isEnabled(),true);
  await bundlePage.evaluate(()=>{let first=true;window.releaseBundleHash=null;crypto.subtle.digest=(...args)=>{if(first){first=false;return new Promise(resolve=>{window.releaseBundleHash=()=>window.originalDigest(...args).then(resolve);});}return window.originalDigest(...args);};});
  await bundlePage.locator('#download-bundle').click();await bundlePage.waitForFunction(()=>typeof window.releaseBundleHash==='function');
  assert.equal(await bundlePage.locator('#download-bundle').isEnabled(),false);assert.equal(await bundlePage.locator('#bundle-individual').isEnabled(),false);
  await bundlePage.locator('#include-partial').uncheck();await bundlePage.evaluate(()=>window.releaseBundleHash());
  await bundlePage.locator('#bundle-status').filter({hasText:'workspace changed while the bundle was being prepared'}).waitFor();
  assert.equal(bundleDownloads,0);assert.equal(await bundlePage.locator('#download-bundle').isEnabled(),true);
  await bundlePage.evaluate(()=>{crypto.subtle.digest=window.originalDigest;});
  // No included data still yields explicit aggregate missing values and an omission list.
  const emptyZip=await downloadedBytes(bundlePage,'#download-bundle');await writeFile('test-results/review-bundle-empty.zip',emptyZip);
  const empty=readStoredFiles(emptyZip),emptyManifest=JSON.parse(new TextDecoder().decode(empty.get('manifest.json')));
  assert.equal(emptyManifest.review.includedRecordings,0);assert.equal(emptyManifest.omittedFiles.length,2);assert.equal(empty.size,14);
  await bundlePage.screenshot({path:'test-results/bundle-desktop.png',fullPage:true});
  await bundlePage.setViewportSize({width:390,height:844});await bundlePage.screenshot({path:'test-results/bundle-mobile.png',fullPage:true});
  assert.equal(await bundlePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Bundle controls overflow on mobile');
  await bundlePage.locator('#clear-review').click();assert.equal(await bundlePage.locator('#download-bundle').isEnabled(),false);
  assert.equal((await checkSession(fresh)).participant,'P007');
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: study/workspace/paired regressions, coverage summaries, assignment mismatches, unplanned codes, duplicate/partial decisions, all 18 balance cells, coverage CSVs, plan regeneration, workspace round-trips, aggregate report preview/downloads/privacy/invalidation, submitted rating distributions and matched directions, rating CSVs and workspace round-trips, additive imports/undo/duplicate rechecks/limits/read failures/stale reads, aggregate/full/empty ZIP bundles, snapshot integrity and cancelled hash operations, offline print PDF, recording isolation, and desktop/mobile layout.');
} finally {
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
}
