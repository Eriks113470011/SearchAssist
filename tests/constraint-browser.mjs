import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {investigate} from '../simulator/investigate.mjs';
import {simulateBrowser} from '../simulator/browser-runner.mjs';
import {prepareOutput,writeInvestigationArtifacts} from '../simulator/artifacts.mjs';
const input=JSON.parse(await readFile(new URL('../configs/investigation-constraints-browser.json',import.meta.url),'utf8'));
const destination=await prepareOutput('simulation-runs/ci-constraints-browser');let submissions=0;
const result=await investigate(input,{onProgress:console.log,browserRunner:async config=>{
 const run=await simulateBrowser(config);
 if(config.policyVersion==='v5')for(const s of run.sessions)for(const t of s.trials){
  assert.equal(t.recordingVerified,true);
  const submit=t.trace.find(a=>a.type==='submit');if(!submit)continue;
  submissions++;assert.equal(submit.decisionEvidence.constraints.qualified,true);assert.equal(submit.decisionEvidence.detailsVerified,true);
  assert.ok(t.trace.some(a=>a.type==='read_details'&&a.handle===submit.handle&&a.durationMs>0));
 }
 return run;
}});
assert.ok(submissions>0);await writeInvestigationArtifacts(result,destination);
console.log(`Verified ${submissions} V5 browser submissions used paid, qualifying evidence. Reports: ${destination.output}`);
