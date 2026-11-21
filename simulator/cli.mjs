import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {simulate} from './runner.mjs';
import {simulationPayloads,summarizeRun} from './report.mjs';
export const MAX_OUTPUT_BYTES=64*1024*1024;
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourcePaths=['simulator/config.mjs','simulator/random.mjs','simulator/text.mjs','simulator/policy.mjs','simulator/model-adapter.mjs','simulator/timing.mjs','simulator/runner.mjs','simulator/report.mjs','simulator/cli.mjs','dist/data.mjs','dist/engine.mjs','dist/study.mjs','dist/app.mjs'];
const hash=data=>createHash('sha256').update(data).digest('hex');
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
  const root=resolve('simulation-runs'),output=resolve(values['--output']);
  if(dirname(output)!==root||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(output.slice(root.length+1)))throw new Error('Output must be simulation-runs/<safe-name>, with no nested paths.');
  let input={};
  if(values['--config']){const text=await readFile(values['--config'],'utf8');if(Buffer.byteLength(text)>65536)throw new Error('Configuration files are limited to 64 KB.');input=JSON.parse(text);}
  if(values['--seed']!==undefined)input.masterSeed=Number(values['--seed']);
  if(values['--profile'])input.profiles=[values['--profile']];
  // Refuse collisions and symlink roots before doing a potentially expensive run.
  try {if((await lstat(root)).isSymbolicLink())throw new Error('The simulation-runs root must not be a symlink.');}catch(e){if(e.code!=='ENOENT')throw e;}
  try {await lstat(output);throw new Error('Output already exists; choose a new run name. Existing files are never overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const run=simulate(input),files=simulationPayloads(run);
  let sourceCommit=null,workingTreeDirty=null;
  try {sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();workingTreeDirty=!!execFileSync('git',['status','--porcelain'],{cwd:sourceRoot,stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();}catch{}
  const sourceFiles=await Promise.all(sourcePaths.map(async path=>({path,sha256:hash(await readFile(resolve(sourceRoot,path)))})));
  const manifest={format:'searchassist-simulation-manifest',schemaVersion:1,applicationVersion:'1.1',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model',runtime:{node:process.version,platform:process.platform,architecture:process.arch,icu:process.versions.icu},
    sourceCommit,workingTreeDirty,sourceIdentity:sourceCommit?'git-commit-plus-file-sha256':'file-sha256-no-git-commit-available',sourceFiles,
    configSha256:hash(files.get('config.json')),modelVersion:run.modelVersion,adapterVersion:run.adapterVersion,rngVersion:run.rngVersion,timingVersion:run.timingVersion,
    datasetVersion:run.datasetVersion,protocolVersion:run.protocolVersion,measurementDefinition:run.measurementDefinition,seed:run.config.masterSeed,
    seedKeyDefinition:'masterSeed + profile + replicateIndex + assignmentSlot + taskSetIndex + taskIndex + decision kind/attempt; timing has its own keys',
    units:{modeledActiveMs:'milliseconds',humanRatings:'unavailable',observedBrowserTiming:'unavailable'},resolvedProfiles:run.resolvedProfiles,
    simulatedSessions:run.sessions.length,totalTrials:run.sessions.length*12,maxOutputBytes:MAX_OUTPUT_BYTES,hashAlgorithm:'SHA-256',hashScope:'All listed payload files; manifest excludes itself. Hashes are not signatures.',
    files:[...files].map(([path,content])=>({path,bytes:Buffer.byteLength(content),sha256:hash(content)}))};
  files.set('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  if([...files.values()].reduce((n,s)=>n+Buffer.byteLength(s),0)>MAX_OUTPUT_BYTES)throw new Error('Output exceeds 64 MB; use fewer profiles/replicates or actions.');
  await mkdir(root,{recursive:true});if((await lstat(root)).isSymbolicLink())throw new Error('The simulation-runs root must not be a symlink.');
  await mkdir(output);await mkdir(resolve(output,'sessions'));
  for(const [path,content] of files)await writeFile(resolve(output,path),content,{flag:'wx'});
  const summary=summarizeRun(run);
  process.stdout.write(JSON.stringify({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',output,simulatedSessions:summary.simulatedSessions,totalTrials:summary.totalTrials,
    conditions:summary.conditions.map(r=>({condition:r.condition,correct:r.successes,attempted:r.trials,skips:r.skips,meanModeledActiveMs:r.meanModeledActiveMs})),humanRatings:null},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runCli(process.argv.slice(2)).catch(error=>{process.stderr.write('Simulator: '+error.message+'\n');process.exitCode=1;});
