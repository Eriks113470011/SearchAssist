import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerNativeDownloads,readBrowserDownload} from '../simulator/browser-downloads.mjs';
test('native download reads completed browser GUID bytes and releases event listeners',async()=>{
 const root=await mkdtemp(join(tmpdir(),'searchassist-download-test-')),context={},client=new EventEmitter(),guid='01234567-89ab-cdef';
 const unregister=registerNativeDownloads(context,client,root,1000);
 try{const page={context:()=>context,locator:()=>({click:async()=>{client.emit('Browser.downloadWillBegin',{guid,suggestedFilename:'SIM.browser-recording.simulation.json'});await writeFile(join(root,guid),'synthetic bytes ✓');client.emit('Browser.downloadProgress',{guid,state:'completed'});}})};
 assert.deepEqual(await readBrowserDownload(page,'#export-json'),{filename:'SIM.browser-recording.simulation.json',text:'synthetic bytes ✓'});assert.equal(client.listenerCount('Browser.downloadProgress'),0);assert.equal(client.listenerCount('Browser.downloadWillBegin'),0);
 }finally{unregister();await rm(root,{recursive:true,force:true});}
});
test('native canceled downloads fail without reading a payload',async()=>{
 const context={},client=new EventEmitter(),off=registerNativeDownloads(context,client,'/unused',1000);
 const page={context:()=>context,locator:()=>({click:async()=>{client.emit('Browser.downloadWillBegin',{guid:'valid-guid',suggestedFilename:'SIM.json'});client.emit('Browser.downloadProgress',{guid:'valid-guid',state:'canceled'});}})};
 try{await assert.rejects(()=>readBrowserDownload(page,'#export-json'),/canceled/);assert.equal(client.listenerCount('Browser.downloadProgress'),0);}finally{off();}
});
test('native download rejects unsafe GUIDs and timed-out downloads',async()=>{
 const context={},client=new EventEmitter(),off=registerNativeDownloads(context,client,'/unused',20);
 try{const page={context:()=>context,locator:()=>({click:async()=>{client.emit('Browser.downloadWillBegin',{guid:'../outside',suggestedFilename:'ignored.json'});}})};await assert.rejects(()=>readBrowserDownload(page,'#export-json'),/Invalid native download GUID/);
 await assert.rejects(()=>readBrowserDownload({context:()=>context,locator:()=>({click:async()=>{}})},'#export-json'),/did not finish/);assert.equal(client.listenerCount('Browser.downloadWillBegin'),0);
 }finally{off();}
});
