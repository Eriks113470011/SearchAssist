import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {registerNativeDownloads} from './browser-downloads.mjs';
// Own process/profile only. No caller-supplied CDP endpoint or personal data directory.
// noDefaults on the fresh default context prevents focus emulation from being enabled.
export async function launchNativeBrowser(chromium,{timeout,signal}) {
  const root=await mkdtemp(join(tmpdir(),'searchassist-native-')),profile=join(root,'profile'),downloads=join(root,'downloads');
  await mkdir(profile);await mkdir(downloads);let browser,child,closePromise,unregister,stderr='';
  const close=()=>closePromise??=(async()=>{
    signal?.removeEventListener('abort',abort);unregister?.();
    await browser?.close().catch(()=>{});
    if(child?.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await Promise.race([exited,delay(2000)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
    await rm(root,{recursive:true,force:true});
  })();
  const abort=()=>{if(child?.pid&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');};
  let exited;
  try {
    signal?.throwIfAborted();
    child=spawn(process.env.SEARCHASSIST_CHROMIUM_PATH||chromium.executablePath(),[
      '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
      '--no-first-run','--no-default-browser-check','--disable-sync','--disable-background-networking',
      '--disable-extensions','--disable-component-update','--disable-default-apps','--disable-dev-shm-usage',
      '--disable-popup-blocking','--no-sandbox','about:blank'
    ],{stdio:['ignore','ignore','pipe']});
    let launchError;child.on('error',e=>{launchError=e;});exited=new Promise(done=>{child.once('exit',done);child.once('error',done);});child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-4000);});
    signal?.addEventListener('abort',abort,{once:true});
    const deadline=performance.now()+timeout;let port;
    while(performance.now()<deadline){
      signal?.throwIfAborted();if(launchError)throw launchError;if(child.exitCode!==null||child.signalCode!==null)throw new Error('Native Chromium exited during startup. '+stderr);
      try{const value=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];if(/^\d+$/.test(value)&&Number(value)>0&&Number(value)<65536){port=Number(value);break;}}catch(e){if(e.code!=='ENOENT')throw e;}
      await delay(50,undefined,{signal});
    }
    if(!port)throw new Error('Native Chromium did not expose its owned loopback debugging port before the startup limit.');
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true,isLocal:true,artifactsDir:downloads,timeout});
    const context=browser.contexts()[0];if(!context)throw new Error('Native Chromium did not expose its fresh default context.');
    const client=await browser.newBrowserCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true});unregister=registerNativeDownloads(context,client,downloads,timeout);
    return {browser,context,close};
  }catch(error){await close();throw error;}
}
