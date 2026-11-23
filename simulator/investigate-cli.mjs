import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {investigate} from './investigate.mjs';
import {prepareOutput,writeInvestigationArtifacts} from './artifacts.mjs';
export async function runInvestigationCli(args){
 if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: npm run investigate -- --config configs/investigation-smoke.json --output simulation-runs/investigation-001\nSynthetic software checks only. Fresh output names required.\n');return;}
 const values={};for(let i=0;i<args.length;i+=2){if(!['--config','--output'].includes(args[i])||values[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown, duplicate or incomplete investigation argument.');values[args[i]]=args[i+1];}
 if(!values['--config']||!values['--output'])throw new Error('Choose --config and a new --output simulation-runs/<name>.');
 const destination=await prepareOutput(values['--output']),text=await readFile(values['--config'],'utf8');if(Buffer.byteLength(text)>65536)throw new Error('Configuration exceeds 64 KB.');
 const result=await investigate(JSON.parse(text),{onProgress:p=>process.stderr.write(`Investigation: seed ${p.seed}, ${p.policyVersion}, ${p.variant}\n`)});await writeInvestigationArtifacts(result,destination);
 process.stdout.write(JSON.stringify({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',output:destination.output,runs:result.runs.length,tasks:result.observations.length,comparisons:result.pairs.length,benchmarkCases:result.benchmark.length,humanRatings:null},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runInvestigationCli(process.argv.slice(2)).catch(e=>{process.stderr.write('Investigation: '+e.message+'\n');process.exitCode=1;});
