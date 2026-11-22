import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as study from '../dist/study.mjs';
import {reviewFiles} from '../dist/workspace.mjs';
import {parseProject} from '../dist/review-project.mjs';
import {createReviewBundle} from '../dist/review-bundle.mjs';
import {readStoredFiles as unzip} from './zip-reader.mjs';
import {storedZip,crc32,MAX_ZIP_BYTES} from '../dist/zip.mjs';
const encoder=new TextEncoder(),decoder=new TextDecoder(),date='2026-11-17T12:00:00Z';
const at=ms=>({wall:Date.UTC(2026,10,17)+ms,mono:ms});
function file(participant='SECRET_001',count=12) {
  const s=study.createSession({participant,order:'ABC',setRotation:0},at(0));
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(i*1000));study.setQuery(s,'PRIVATE_QUERY');study.completeTrial(s,study.taskAt(s).target,at(i*1000+500));
    if(s.phase==='ratings')study.addRatings(s,{confidence:4,trust:5,ease:6,notes:'PRIVATE_OBSERVATION'},at(i*1000+500));
  }
  return {name:'PRIVATE_FILE.json',text:JSON.stringify(study.snapshot(s,at(count*1000)))};
}
const state=(files=[file()],options={})=>({entries:reviewFiles(files),planConfig:{prefix:'SECRET_',start:1,count:18},options,notes:{0:'PRIVATE_REVIEW_NOTE'}});
const json=(files,path)=>JSON.parse(decoder.decode(files.get(path)));

test('stored ZIP has standard CRC vectors and preserves UTF-8 payloads including empty files',()=>{
  assert.equal(crc32(encoder.encode('123456789')),0xcbf43926);assert.equal(crc32(new Uint8Array()),0);
  const input=[{path:'readme.txt',data:encoder.encode('Résumé → 日本語')},{path:'individual/empty.csv',data:new Uint8Array()}],out=unzip(storedZip(input));
  assert.equal(decoder.decode(out.get('readme.txt')),'Résumé → 日本語');assert.equal(out.get('individual/empty.csv').length,0);
});
test('ZIP rejects traversal, absolute/duplicate paths, invalid bytes, and oversized payloads',()=>{
  for(const path of ['../bad.txt','a/../bad.txt','/bad.txt','a\\bad.txt','.hidden','a//b.txt'])assert.throws(()=>storedZip([{path,data:new Uint8Array()}]),/paths/);
  assert.throws(()=>storedZip([{path:'a.txt',data:'text'}]),/bytes/);
  assert.throws(()=>storedZip([{path:'a.txt',data:new Uint8Array()},{path:'a.txt',data:new Uint8Array()}]),/paths/);
  assert.throws(()=>storedZip([]),/1–32/);assert.throws(()=>storedZip(Array.from({length:33},()=>({}))),/1–32/);
  assert.throws(()=>storedZip([{path:'huge.txt',data:new Uint8Array(MAX_ZIP_BYTES)}]),/32 MB/);
});
test('default bundles contain aggregate outputs with no identities, prefixes or free text',async()=>{
  const {bytes,manifest}=await createReviewBundle(state(),{generatedAt:date}),files=unzip(bytes);
  assert.equal(files.size,9);assert.equal(manifest.dataScope,'aggregate-only');assert.equal(manifest.bundleVersion,1);assert.equal(manifest.archiveEncryption,'none');
  assert.deepEqual([...files.keys()],['manifest.json','readme.txt','study-summary.html','study-summary.json','condition-summary.csv','paired-summary.csv','rating-distributions.csv','matched-ratings.csv','balance.csv']);
  for(const data of files.values())for(const secret of ['SECRET_','PRIVATE_FILE','PRIVATE_QUERY','PRIVATE_OBSERVATION','PRIVATE_REVIEW_NOTE'])assert.ok(!decoder.decode(data).includes(secret));
  assert.match(decoder.decode(files.get('readme.txt')),/does not contain a restorable workspace/);
});
test('manifest hashes and byte counts independently match every payload and exclude the manifest',async()=>{
  const {bytes,manifest}=await createReviewBundle(state(),{generatedAt:date}),files=unzip(bytes);
  assert.deepEqual(json(files,'manifest.json'),manifest);assert.equal(manifest.hashAlgorithm,'SHA-256');
  assert.equal(manifest.files.length,files.size-1);assert.ok(!manifest.files.some(f=>f.path==='manifest.json'));
  for(const f of manifest.files){const data=files.get(f.path);assert.equal(f.bytes,data.length);assert.equal(f.sha256,createHash('sha256').update(data).digest('hex'));}
});
test('full bundles require explicit opt-in and restore the same workspace decisions and notes',async()=>{
  const s=state([file(),file('SECRET_002',4),{name:'bad.json',text:'{'}],{includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false,choices:{0:false}});
  const {bytes,manifest}=await createReviewBundle(s,{includeIndividual:true,generatedAt:date}),files=unzip(bytes);
  assert.equal(manifest.dataScope,'includes-individual-data');assert.equal(files.size,16);
  const project=decoder.decode(files.get('individual/workspace.json')),restored=parseProject(project);
  assert.match(project,/PRIVATE_QUERY/);assert.match(project,/PRIVATE_REVIEW_NOTE/);assert.equal(restored.entries.length,3);assert.equal(restored.options.choices[0],false);assert.equal(restored.notes[0],'PRIVATE_REVIEW_NOTE');
  assert.deepEqual(restored.planConfig,s.planConfig);assert.equal(restored.options.includePartial,true);assert.equal(restored.options.pairedSuccessfulOnly,false);
  assert.match(decoder.decode(files.get('individual/inclusion-log.csv')),/PRIVATE_REVIEW_NOTE/);
  assert.ok(!decoder.decode(files.get('individual/participant-conditions.csv')).includes('PRIVATE_QUERY'));
  assert.equal(JSON.parse(project).savedAt,manifest.generatedAt);
});
test('all-excluded and invalid-only batches keep aggregate missing data and list unavailable individual reports',async()=>{
  for(const s of [state([file()],{choices:{0:false}}),state([{name:'bad.json',text:'{'}])]) {
    const {bytes,manifest}=await createReviewBundle(s,{includeIndividual:true,generatedAt:date}),files=unzip(bytes),r=json(files,'study-summary.json');
    assert.equal(r.review.includedRecordings,0);assert.equal(r.conditions[0].meanParticipantActiveMs,null);
    assert.equal(files.size,14);assert.equal(manifest.omittedFiles.length,2);assert.ok(!files.has('individual/participant-conditions.csv'));
    assert.equal(decoder.decode(files.get('condition-summary.csv')).split('\r\n').length,4);
  }
});
test('bundles preserve a single versioned snapshot, analysis settings and row counts',async()=>{
  const s=state([file(),file('SECRET_002',8)],{includePartial:true,excludeInterrupted:true,pairedSuccessfulOnly:false});
  const {bytes,manifest}=await createReviewBundle(s,{generatedAt:date}),files=unzip(bytes),summary=json(files,'study-summary.json');
  assert.equal(summary.applicationVersion,'1.4');assert.equal(summary.summaryVersion,2);assert.equal(manifest.generatedAt,summary.generatedAt);
  assert.deepEqual(manifest.settings,summary.settings);assert.deepEqual(manifest.review,summary.review);
  assert.match(decoder.decode(files.get('study-summary.html')),new RegExp(summary.generatedAt.replaceAll('.','\\.')));
  for(const [path,rows] of [['condition-summary.csv',3],['paired-summary.csv',3],['rating-distributions.csv',9],['matched-ratings.csv',9],['balance.csv',18]])assert.equal(decoder.decode(files.get(path)).split('\r\n').length,rows+1);
});
test('bundle creation is read-only and deterministic with a fixed snapshot timestamp',async()=>{
  const s=state(),before=JSON.stringify(s),one=await createReviewBundle(s,{generatedAt:date}),two=await createReviewBundle(s,{generatedAt:date});
  assert.deepEqual(one.bytes,two.bytes);assert.equal(JSON.stringify(s),before);
  const pending=createReviewBundle(s,{includeIndividual:true,generatedAt:date});s.notes[0]='Changed after request';s.options.choices={0:false};
  const result=await pending,files=unzip(result.bytes),restored=parseProject(decoder.decode(files.get('individual/workspace.json')));
  assert.equal(restored.notes[0],'PRIVATE_REVIEW_NOTE');assert.equal(restored.options.choices[0],undefined);assert.equal(result.manifest.review.includedRecordings,1);
});
test('invalid dates, opt-ins and empty or damaged workspaces fail without exporting',async()=>{
  await assert.rejects(createReviewBundle(state(),{generatedAt:'invalid'}),/date/);
  await assert.rejects(createReviewBundle(state(),{includeIndividual:'yes'}),/individual/);
  await assert.rejects(createReviewBundle(state([]),{generatedAt:date}),/Import session files/);
  const s=state();s.entries[0].session.schemaVersion=999;await assert.rejects(createReviewBundle(s,{generatedAt:date}),/invalid/);
});
