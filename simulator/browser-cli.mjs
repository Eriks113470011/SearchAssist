import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArguments} from './cli.mjs';
import {prepareOutput,writeRunArtifacts,writeBrowserFailure} from './artifacts.mjs';
import {validateBrowserConfig} from './browser-config.mjs';
import {simulateBrowser} from './browser-runner.mjs';
const help='Usage: npm run simulate:browser -- --config configs/simulator-browser-smoke.json --output simulation-runs/browser-001 [--seed 42] [--profile careful-scanner] [--headed] [--pacing none|modeled]\nRuns a shipped local app in fresh isolated Chromium contexts. No external target URL or existing browser profile is accepted. All results are synthetic and uncalibrated.\n';
export function parseBrowserArguments(args) {
  if(args.length===1&&args[0]==='--help')return {help:true};
  if(args.includes('--help'))throw new Error('Use --help by itself.');
  const rest=[],overrides={};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--headed'){if(overrides.headed)throw new Error('Duplicate --headed.');overrides.headed=true;}
    else if(args[i]==='--pacing'){if(Object.hasOwn(overrides,'pacing')||!['none','modeled'].includes(args[i+1]))throw new Error('Choose --pacing none or modeled once.');overrides.pacing=args[++i];}
    else rest.push(args[i]);
  }
  return {values:parseArguments(rest),overrides};
}
export async function runBrowserCli(args) {
  const parsed=parseBrowserArguments(args);if(parsed.help){process.stdout.write(help);return;}
  const {values,overrides}=parsed,destination=await prepareOutput(values['--output']);let input={};
  if(values['--config']){const text=await readFile(values['--config'],'utf8');if(Buffer.byteLength(text)>65536)throw new Error('Configuration files are limited to 64 KB.');input=JSON.parse(text);}
  if(values['--seed']!==undefined)input.masterSeed=Number(values['--seed']);if(values['--profile'])input.profiles=[values['--profile']];
  const config=validateBrowserConfig({...input,browser:{...input.browser,...overrides}});
  try {
    const run=await simulateBrowser(config,{onProgress:p=>process.stderr.write(`[synthetic browser] ${p.participant}: ${p.profile}, assignment ${p.slot+1}/18\n`)});
    await writeRunArtifacts(run,destination);
    process.stdout.write(JSON.stringify({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',pacing:config.browser.pacing,output:destination.output,simulatedSessions:run.sessions.length,totalTrials:run.sessions.length*12,recordingVerified:true,verifiedInterruptions:run.sessions.flatMap(s=>s.trials).reduce((n,t)=>n+(t.interruptions?.length??0),0),humanRatings:null},null,2)+'\n');
  }catch(error){if(error.simulationFailure)await writeBrowserFailure(error.simulationFailure,destination);throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runBrowserCli(process.argv.slice(2)).catch(error=>{process.stderr.write('Browser simulator: '+error.message+'\n');process.exitCode=1;});
