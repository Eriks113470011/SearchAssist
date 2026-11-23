import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {investigate} from '../simulator/investigate.mjs';
import {validateBroad} from '../simulator/validation.mjs';
import {validationPayloads} from '../simulator/validation-report.mjs';
import {prepareOutput,writeInvestigationArtifacts,writeValidationArtifacts} from '../simulator/artifacts.mjs';
await mkdir('test-results',{recursive:true});
const config=JSON.parse(await readFile('configs/investigation-broad-browser.json','utf8'));
const result=await investigate(config,{onProgress:p=>console.log('Broad browser:',p.seed,p.policyVersion,p.variant)});
assert.equal(result.runs.length,4);assert.equal(result.observations.length,864);assert.equal(result.pairs.length,432);
assert.ok(result.observations.every(t=>t.recordingVerified&&t.interruptionCount===0&&t.verifiedInterruptions===0));
assert.equal(new Set(result.observations.map(t=>t.profile)).size,6);assert.equal(new Set(result.observations.map(t=>t.seed)).size,2);
await writeInvestigationArtifacts(result,await prepareOutput('simulation-runs/ci-broad-browser'));
// Challenge cases remain MODEL ONLY. This checks rendering, not fresh-case browser execution.
const challenges=await validateBroad({seeds:[101],profiles:['careful-scanner']});
await writeValidationArtifacts(challenges,await prepareOutput('simulation-runs/ci-challenge-layout'));
const browser=await chromium.launch({headless:true,timeout:30000,...(process.env.SEARCHASSIST_CHROMIUM_PATH?{executablePath:process.env.SEARCHASSIST_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(validationPayloads(challenges).get('report.html'));assert.ok(await page.getByText('runner MODEL ONLY',{exact:false}).count()>0);
 await page.screenshot({path:'test-results/broad-validation-desktop.png',fullPage:true});
 await page.pdf({path:'test-results/broad-validation-report.pdf',printBackground:true,preferCSSPageSize:true});
 await page.locator('details summary').first().click();assert.ok(await page.locator('details[open] pre').textContent());
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'test-results/broad-validation-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
}finally{await browser.close();}
console.log('Broad browser validation passed: 864 controlled tasks, all six profiles, two seeds, three assignment slots, raw recorder reconciliation; challenge-model report desktop/mobile/print checks. No policy success-rate threshold is asserted.');
