import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
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
function fixture(participant, count = 12) {
  const s = study.createSession({participant,order:'ABC',setRotation:0},at(0));
  for (let i=0;i<count;i++) {
    study.startTrial(s,at(i*1000));study.completeTrial(s,study.taskAt(s).target,at(i*1000+500));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:''},at(i*1000+500));
  }
  return JSON.stringify(study.snapshot(s,at(count*1000)));
}
async function downloaded(page, selector) {
  const pending = page.waitForEvent('download');await page.locator(selector).click();
  const download = await pending;
  assert.equal(await download.failure(),null);
  return readFile(await download.path(),'utf8');
}
async function visible(page, selector) {await page.locator(selector).waitFor({state:'visible'});}
async function checkSession(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key)),study.STORAGE_KEY);
}
try {
  browser = await chromium.launch({headless:true});
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
  await mkdir('test-results',{recursive:true});
  await fresh.evaluate(()=>window.scrollTo(0,0));
  await fresh.screenshot({path:'test-results/workspace-desktop.png',fullPage:true});
  await fresh.setViewportSize({width:390,height:844});
  await fresh.evaluate(()=>window.scrollTo(0,0));
  await fresh.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
  assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile layout overflows');
  await fresh.reload();await visible(fresh,'#review-files');
  assert.match(await fresh.locator('#duplicate-status').innerText(),/0 session/);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: assignment setup, pause/reload/resume, JSON import/export, replacement cancellation, saved ratings, CSV downloads, batch review, duplicates, mobile layout, and review clearing.');
} finally {
  if(browser)await browser.close();
  await new Promise(done=>server.close(done));
}
