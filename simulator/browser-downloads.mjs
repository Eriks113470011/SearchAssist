import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const nativeDownloads=new WeakMap();
// Native noDefaults contexts deliberately keep Playwright's download overrides off.
// Observe the actual browser download events and read only GUID files in our owned directory.
export function registerNativeDownloads(context,client,directory,timeout) {
  nativeDownloads.set(context,{client,directory,timeout});
  return ()=>nativeDownloads.delete(context);
}
export async function readBrowserDownload(page,selector) {
  const native=nativeDownloads.get(page.context());
  if(!native){const pending=page.waitForEvent('download');await page.locator(selector).click();const download=await pending;const failure=await download.failure();if(failure)throw new Error('Browser download failed: '+failure);return {text:await readFile(await download.path(),'utf8'),filename:download.suggestedFilename()};}
  let guid,filename,settled=false,timer,resolve,reject;
  const pending=new Promise((done,fail)=>{resolve=done;reject=fail;});
  // A download may fail while the triggering click is still awaiting completion.
  void pending.catch(()=>{});
  const onBegin=event=>{if(!guid){if(!/^[a-zA-Z0-9-]+$/.test(event.guid)){reject(new Error('Invalid native download GUID.'));return;}guid=event.guid;filename=event.suggestedFilename;}};
  const onProgress=event=>{if(event.guid!==guid||settled)return;if(event.state==='canceled'){settled=true;reject(new Error('Native browser download was canceled.'));}if(event.state==='completed'){settled=true;resolve();}};
  native.client.on('Browser.downloadWillBegin',onBegin);native.client.on('Browser.downloadProgress',onProgress);
  timer=setTimeout(()=>reject(new Error('Native browser download did not finish before the action limit.')),native.timeout);
  try{await page.locator(selector).click();await pending;return {text:await readFile(join(native.directory,guid),'utf8'),filename};}
  finally{clearTimeout(timer);native.client.removeListener('Browser.downloadWillBegin',onBegin);native.client.removeListener('Browser.downloadProgress',onProgress);}
}
