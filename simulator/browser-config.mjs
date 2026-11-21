import {validateConfig} from './config.mjs';
export const BROWSER_DEFAULTS=Object.freeze({assignmentSlots:Object.freeze(Array.from({length:18},(_,i)=>i)),pacing:'none',headed:false,actionTimeoutMs:10000,maxRunWallMs:600000});
export function validateBrowserConfig(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a browser configuration object.');
  const {browser={},runner='browser',...base}=input;
  if(runner!=='browser')throw new Error('This command requires runner: browser.');
  if(!browser||typeof browser!=='object'||Array.isArray(browser)||Object.keys(browser).some(k=>!Object.hasOwn(BROWSER_DEFAULTS,k)))throw new Error('Unknown browser options.');
  const c=validateConfig({...base,runner:'model'}),b={...structuredClone(BROWSER_DEFAULTS),...browser};
  if(!Array.isArray(b.assignmentSlots)||!b.assignmentSlots.length||new Set(b.assignmentSlots).size!==b.assignmentSlots.length||b.assignmentSlots.some(i=>!Number.isInteger(i)||i<0||i>17))throw new Error('Choose unique assignmentSlots from 0 to 17.');
  if(!['none','modeled'].includes(b.pacing)||typeof b.headed!=='boolean')throw new Error('Unknown pacing or headed setting.');
  for(const [k,min,max] of [['actionTimeoutMs',1000,60000],['maxRunWallMs',1000,3600000]])if(!Number.isInteger(b[k])||b[k]<min||b[k]>max)throw new Error(`Invalid browser ${k}.`);
  return {...c,runner:'browser',browser:structuredClone(b)};
}
