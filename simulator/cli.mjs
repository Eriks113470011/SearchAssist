import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {simulate} from './runner.mjs';
import {summarizeRun} from './report.mjs';
import {prepareOutput,writeRunArtifacts} from './artifacts.mjs';
export {MAX_OUTPUT_BYTES} from './artifacts.mjs';
const help='Usage: npm run simulate -- --config configs/simulator-smoke.json --output simulation-runs/smoke-001 [--seed 42] [--profile careful-scanner]\nOutputs are synthetic and uncalibrated. Output must be a new simulation-runs/<name> directory. No network or API key is used.\n';
export function parseArguments(args) {
  const values={};
  for(let i=0;i<args.length;i++) {
    const arg=args[i];if(arg==='--help'&&args.length===1)return {help:true};
    if(!['--config','--output','--seed','--profile'].includes(arg)||Object.hasOwn(values,arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown, duplicate, or incomplete CLI option.\n'+help);
    values[arg]=args[++i];
  }
  if(!values['--output'])throw new Error('Choose --output simulation-runs/<name>.');
  if(values['--seed']!==undefined&&!/^\d+$/.test(values['--seed']))throw new Error('Seed must be an unsigned decimal integer.');
  return values;
}
export async function runCli(args) {
  const values=parseArguments(args);if(values.help){process.stdout.write(help);return;}
  const destination=await prepareOutput(values['--output']);
  let input={};
  if(values['--config']){const text=await readFile(values['--config'],'utf8');if(Buffer.byteLength(text)>65536)throw new Error('Configuration files are limited to 64 KB.');input=JSON.parse(text);}
  if(values['--seed']!==undefined)input.masterSeed=Number(values['--seed']);
  if(values['--profile'])input.profiles=[values['--profile']];
  const run=simulate(input);await writeRunArtifacts(run,destination);
  const summary=summarizeRun(run);
  process.stdout.write(JSON.stringify({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',output:destination.output,simulatedSessions:summary.simulatedSessions,totalTrials:summary.totalTrials,
    conditions:summary.conditions.map(r=>({condition:r.condition,correct:r.successes,attempted:r.trials,skips:r.skips,meanModeledActiveMs:r.meanModeledActiveMs})),humanRatings:null},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runCli(process.argv.slice(2)).catch(error=>{process.stderr.write('Simulator: '+error.message+'\n');process.exitCode=1;});
