import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {investigate} from '../simulator/investigate.mjs';
import {investigationPayloads} from '../simulator/investigation-report.mjs';
import {prepareOutput,writeInvestigationArtifacts,writeRunArtifacts} from '../simulator/artifacts.mjs';
import {simulateBrowser} from '../simulator/browser-runner.mjs';
import {renderFailureInspector} from '../simulator/diagnostics.mjs';
await mkdir('test-results',{recursive:true});
const config=JSON.parse(await readFile('configs/investigation-browser.json','utf8'));
const result=await investigate(config,{onProgress:p=>console.log('Browser investigation:',p.seed,p.policyVersion,p.variant)});
assert.deepEqual(result.config.policyVersions,['v3','v4']);
assert.equal(result.runs.length,8);assert.equal(result.observations.length,384);assert.equal(result.pairs.length,480);
assert.ok(result.observations.every(t=>t.recordingVerified&&t.interruptionCount===t.verifiedInterruptions));
assert.equal(result.observations.reduce((n,t)=>n+t.verifiedInterruptions,0),120);
await writeInvestigationArtifacts(result,await prepareOutput('simulation-runs/ci-investigation-browser'));
// A standalone tagged browser run supplies full traces for failure-inspector layout checks.
const run=await simulateBrowser({...config.simulation,policyVersion:'v3',browser:{assignmentSlots:[0],pacing:'none'}});
await writeRunArtifacts(run,await prepareOutput('simulation-runs/ci-failure-inspector'));
const browser=await chromium.launch({headless:true,...(process.env.SEARCHASSIST_CHROMIUM_PATH?{executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(investigationPayloads(result).get('report.html'));await page.screenshot({path:'test-results/investigation-desktop.png',fullPage:true});await page.pdf({path:'test-results/investigation-report.pdf',printBackground:true,preferCSSPageSize:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/investigation-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.setViewportSize({width:1440,height:1000});await page.setContent(renderFailureInspector(run));assert.ok(await page.locator('details').count()>0);await page.locator('details summary').first().click();
 assert.ok(await page.getByText('Decision evidence:',{exact:false}).count()>0);await page.screenshot({path:'test-results/failure-inspector-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/failure-inspector-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
}finally{await browser.close();}
console.log('Investigation browser checks passed: 8 paired runs, 384 tasks, 120 verified interruptions, legacy/revised policies, all four controls, independent tagged recordings and report/inspector desktop/mobile/print layouts.');
