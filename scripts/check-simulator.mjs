import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
for(const name of await readdir(new URL('../simulator/',import.meta.url)))if(name.endsWith('.mjs'))execFileSync(process.execPath,['--check',fileURLToPath(new URL('../simulator/'+name,import.meta.url))],{stdio:'inherit'});
