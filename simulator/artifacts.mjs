import {readFile,writeFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {simulationPayloads} from './report.mjs';
export const MAX_OUTPUT_BYTES=64*1024*1024;
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function sourcePaths(){const paths=['package.json'];for(const dir of ['simulator','dist'])for(const name of (await readdir(resolve(sourceRoot,dir))).sort())if(/\.(mjs|html|css)$/.test(name))paths.push(dir+'/'+name);return paths;}
export async function prepareOutput(value){
  const root=resolve('simulation-runs'),output=resolve(value);
  if(dirname(output)!==root||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(output.slice(root.length+1)))throw new Error('Output must be simulation-runs/<safe-name>, with no nested paths.');
  // Refuse collisions and symlink roots before doing a potentially expensive run.
  try {if((await lstat(root)).isSymbolicLink())throw new Error('The simulation-runs root must not be a symlink.');}catch(e){if(e.code!=='ENOENT')throw e;}
  try {await lstat(output);throw new Error('Output already exists; choose a new run name. Existing files are never overwritten.');}catch(e){if(e.code!=='ENOENT')throw e;}
  return {root,output};
}
export async function writeRunArtifacts(run,{root,output}) {
  const files=simulationPayloads(run);
  let sourceCommit=null,workingTreeDirty=null;
  try {sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();workingTreeDirty=!!execFileSync('git',['status','--porcelain'],{cwd:sourceRoot,stdio:['ignore','pipe','ignore'],encoding:'utf8'}).trim();}catch{}
  const sourceFiles=await Promise.all((await sourcePaths()).map(async path=>({path,sha256:hash(await readFile(resolve(sourceRoot,path)))})));
  const manifest={format:'searchassist-simulation-manifest',schemaVersion:1,applicationVersion:'1.3',dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:run.runner,browserVersion:run.browserVersion??null,browserMeasurementDefinition:run.browserMeasurementDefinition??null,reconciliationVersion:run.reconciliationVersion??null,pacing:run.config.browser?.pacing??null,interruptionVersion:run.interruptionVersion??null,runtime:{node:process.version,platform:process.platform,architecture:process.arch,icu:process.versions.icu},
    sourceCommit,workingTreeDirty,sourceIdentity:sourceCommit?'git-commit-plus-file-sha256':'file-sha256-no-git-commit-available',sourceFiles,
    configSha256:hash(files.get('config.json')),modelVersion:run.modelVersion,adapterVersion:run.adapterVersion,rngVersion:run.rngVersion,timingVersion:run.timingVersion,
    datasetVersion:run.datasetVersion,protocolVersion:run.protocolVersion,measurementDefinition:run.measurementDefinition,seed:run.config.masterSeed,
    seedKeyDefinition:'masterSeed + profile + replicateIndex + assignmentSlot + taskSetIndex + taskIndex + decision kind/attempt; timing has its own keys',
    units:{modeledActiveMs:'milliseconds',humanRatings:'unavailable',observedBrowserTiming:run.runner==='browser'?'recorded automation time; not human time':'unavailable'},resolvedProfiles:run.resolvedProfiles,
    simulatedSessions:run.sessions.length,totalTrials:run.sessions.length*12,maxOutputBytes:MAX_OUTPUT_BYTES,hashAlgorithm:'SHA-256',hashScope:'All listed payload files; manifest excludes itself. Hashes are not signatures.',
    files:[...files].map(([path,content])=>({path,bytes:Buffer.byteLength(content),sha256:hash(content)}))};
  files.set('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  if([...files.values()].reduce((n,s)=>n+Buffer.byteLength(s),0)>MAX_OUTPUT_BYTES)throw new Error('Output exceeds 64 MB; use fewer profiles/replicates or actions.');
  await mkdir(root,{recursive:true});if((await lstat(root)).isSymbolicLink())throw new Error('The simulation-runs root must not be a symlink.');
  await mkdir(output);await mkdir(resolve(output,'sessions'));
  for(const [path,content] of files)await writeFile(resolve(output,path),content,{flag:'wx'});
}
export async function writeBrowserFailure(failure,{root,output}) {
  await mkdir(root,{recursive:true});if((await lstat(root)).isSymbolicLink())throw new Error('The simulation-runs root must not be a symlink.');await mkdir(output);await writeFile(resolve(output,'failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});
}
