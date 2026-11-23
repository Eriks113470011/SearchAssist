import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateBroad} from './validation.mjs';
import {prepareOutput,writeValidationArtifacts} from './artifacts.mjs';
export async function runValidationCli(args){
 if(args.length===1&&args[0]==='--help'){process.stdout.write('Usage: npm run validate:broad -- --config configs/validation-challenges.json --output simulation-runs/challenges-001\nFrozen-policy synthetic MODEL challenges; browser coverage uses investigate separately.\n');return;}
 const values={};for(let i=0;i<args.length;i+=2){if(!['--config','--output'].includes(args[i])||values[args[i]]||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Unknown, duplicate or incomplete validation argument.');values[args[i]]=args[i+1];}
 if(!values['--config']||!values['--output'])throw new Error('Choose --config and a new --output simulation-runs/<name>.');
 const destination=await prepareOutput(values['--output']),text=await readFile(values['--config'],'utf8');if(Buffer.byteLength(text)>65536)throw new Error('Configuration exceeds 64 KB.');
 const result=await validateBroad(JSON.parse(text),{onProgress:p=>process.stderr.write(`Validation: seed ${p.seed}, ${p.policyVersion}\n`)});
 await writeValidationArtifacts(result,destination);
 process.stdout.write(JSON.stringify({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model',output:destination.output,challengeCases:result.cases.length,trials:result.rows.length,pairedComparisons:result.pairs.length,summaries:result.summaries.overall,humanRatings:null},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)runValidationCli(process.argv.slice(2)).catch(e=>{process.stderr.write('Broad validation: '+e.message+'\n');process.exitCode=1;});
