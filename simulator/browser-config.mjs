import {validateConfig} from './config.mjs';
export const BROWSER_DEFAULTS=Object.freeze({assignmentSlots:Object.freeze(Array.from({length:18},(_,i)=>i)),pacing:'none',headed:false,actionTimeoutMs:10000,maxRunWallMs:600000,interruptions:Object.freeze([])});
export function validateBrowserConfig(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a browser configuration object.');
  const {browser={},runner='browser',...base}=input;
  if(runner!=='browser')throw new Error('This command requires runner: browser.');
  if(!browser||typeof browser!=='object'||Array.isArray(browser)||Object.keys(browser).some(k=>!Object.hasOwn(BROWSER_DEFAULTS,k)))throw new Error('Unknown browser options.');
  const c=validateConfig({...base,runner:'model'}),b={...structuredClone(BROWSER_DEFAULTS),...browser};
  if(!Array.isArray(b.assignmentSlots)||!b.assignmentSlots.length||new Set(b.assignmentSlots).size!==b.assignmentSlots.length||b.assignmentSlots.some(i=>!Number.isInteger(i)||i<0||i>17))throw new Error('Choose unique assignmentSlots from 0 to 17.');
  if(!['none','modeled'].includes(b.pacing)||typeof b.headed!=='boolean')throw new Error('Unknown pacing or headed setting.');
  for(const [k,min,max] of [['actionTimeoutMs',1000,60000],['maxRunWallMs',1000,3600000]])if(!Number.isInteger(b[k])||b[k]<min||b[k]>max)throw new Error(`Invalid browser ${k}.`);
  if(!Array.isArray(b.interruptions)||b.interruptions.length>12)throw new Error('Configure at most 12 interruptions per session.');
  const points=new Set();
  for(const f of b.interruptions){
    if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!['taskIndex','afterAction','kind','holdMs'].includes(k)))throw new Error('Unknown interruption fields.');
    if(!Number.isInteger(f.taskIndex)||f.taskIndex<1||f.taskIndex>12||!Number.isInteger(f.afterAction)||f.afterAction<0||f.afterAction>=c.limits.maxActionsPerTrial)throw new Error('Choose an interruption task 1–12 and afterAction within the action budget.');
    if(!['manual','navigation','hidden','reload','restore'].includes(f.kind)||!Number.isInteger(f.holdMs)||f.holdMs<200||f.holdMs>5000)throw new Error('Unknown interruption kind or holdMs outside 200–5000.');
    const point=f.taskIndex+':'+f.afterAction;if(points.has(point))throw new Error('Schedule only one interruption at each task/action point.');points.add(point);
  }
  if(b.interruptions.some(f=>f.kind==='hidden')&&!b.headed)throw new Error('Native hidden-tab testing requires headed: true (use Xvfb on Linux CI).');
  return {...c,runner:'browser',browser:structuredClone(b)};
}
