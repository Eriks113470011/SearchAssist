export const PROFILES = Object.freeze({
  'careful-scanner': Object.freeze({scanLimit:5,threshold:0.42,rankBias:0.01,recognitionNoise:0.10,verifyDetails:true,suggestionAcceptance:0.35,explanationAttention:0.35,vocabulary:'broad',timeScale:1.2,typingErrorRate:0.02}),
  'first-result-chooser': Object.freeze({scanLimit:1,threshold:0.15,rankBias:0.12,recognitionNoise:0.24,verifyDetails:false,suggestionAcceptance:0.15,explanationAttention:0.05,vocabulary:'basic',timeScale:0.8,typingErrorRate:0.08}),
  'frequent-reformulator': Object.freeze({scanLimit:3,threshold:0.5,rankBias:0.02,recognitionNoise:0.15,verifyDetails:false,suggestionAcceptance:0.1,explanationAttention:0.15,vocabulary:'broad',timeScale:1,typingErrorRate:0.03}),
  'limited-vocabulary': Object.freeze({scanLimit:2,threshold:0.48,rankBias:0.04,recognitionNoise:0.2,verifyDetails:false,suggestionAcceptance:0.4,explanationAttention:0.15,vocabulary:'basic',timeScale:1.4,typingErrorRate:0.08}),
  'explanation-reader': Object.freeze({scanLimit:4,threshold:0.42,rankBias:0.01,recognitionNoise:0.1,verifyDetails:true,suggestionAcceptance:0.4,explanationAttention:1,vocabulary:'broad',timeScale:1.1,typingErrorRate:0.02}),
  'cautious-suggestion-user': Object.freeze({scanLimit:4,threshold:0.48,rankBias:0.02,recognitionNoise:0.12,verifyDetails:true,suggestionAcceptance:1,explanationAttention:0.5,vocabulary:'broad',timeScale:1.2,typingErrorRate:0.02})
});
export const DEFAULT_CONFIG = Object.freeze({format:'searchassist-simulation-config',schemaVersion:1,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model',
  policyVersion:'v4',masterSeed:42,profiles:Object.freeze(Object.keys(PROFILES)),replicates:1,
  limits:Object.freeze({maxActionsPerTrial:24,maxRewrites:4,maxModeledActiveMs:120000}),
  timing:Object.freeze({keyMs:Object.freeze([100,200,400]),wordMs:Object.freeze([180,300,500]),decisionMs:Object.freeze([400,900,1800]),pointClickMs:Object.freeze([400,800,1400]),systemWaitMs:100}),
  profileOverrides:Object.freeze({})});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function keys(x,allowed,label) {if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw new Error(`Unknown or invalid ${label} fields.`);}
function integer(n,min,max,label){if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be an integer from ${min} to ${max}.`);}
function bounded(n,min,max,label){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error(`${label} is outside its permitted range.`);}
export function validateConfig(input={}) {
  keys(input,Object.keys(DEFAULT_CONFIG),'configuration');
  const c=structuredClone(DEFAULT_CONFIG);Object.assign(c,input);
  for(const [key,value] of Object.entries({format:DEFAULT_CONFIG.format,schemaVersion:1,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'model'}))if(c[key]!==value)throw new Error(`Unsupported ${key}; this runner produces uncalibrated synthetic model data only.`);
  if(!['v2','v3','v4','v5'].includes(c.policyVersion))throw new Error('Unsupported policyVersion.');
  integer(c.masterSeed,0,0xffffffff,'masterSeed');integer(c.replicates,1,10,'replicates');
  if(!Array.isArray(c.profiles)||!c.profiles.length||c.profiles.length>6||new Set(c.profiles).size!==c.profiles.length||c.profiles.some(p=>typeof p!=='string'||!Object.hasOwn(PROFILES,p)))throw new Error('Choose unique known profile names.');
  if(c.profiles.length*18*c.replicates>324)throw new Error('A run is limited to 324 simulated sessions.');
  keys(c.limits,Object.keys(DEFAULT_CONFIG.limits),'limits');c.limits={...DEFAULT_CONFIG.limits,...c.limits};
  integer(c.limits.maxActionsPerTrial,4,80,'maxActionsPerTrial');integer(c.limits.maxRewrites,0,8,'maxRewrites');integer(c.limits.maxModeledActiveMs,1000,600000,'maxModeledActiveMs');
  keys(c.timing,Object.keys(DEFAULT_CONFIG.timing),'timing');c.timing={...structuredClone(DEFAULT_CONFIG.timing),...c.timing};
  for(const key of ['keyMs','wordMs','decisionMs','pointClickMs']) {
    const v=c.timing[key];if(!Array.isArray(v)||v.length!==3)throw new Error(`${key} needs [minimum, mode, maximum].`);
    for(const n of v)bounded(n,1,10000,key);
    if(v[0]>v[1]||v[1]>v[2])throw new Error(`${key} must be ordered minimum <= mode <= maximum.`);
  }
  bounded(c.timing.systemWaitMs,0,10000,'systemWaitMs');keys(c.profileOverrides,Object.keys(PROFILES),'profileOverrides');
  for(const [name,overrides] of Object.entries(c.profileOverrides)) {
    keys(overrides,Object.keys(PROFILES[name]),'profile override');
    for(const [key,n] of Object.entries(overrides)) {
      if(key==='verifyDetails'){if(typeof n!=='boolean')throw new Error('verifyDetails must be boolean.');}
      else if(key==='vocabulary'){if(!['basic','broad'].includes(n))throw new Error('Unknown vocabulary.');}
      else if(key==='scanLimit')integer(n,1,24,key);
      else if(key==='timeScale')bounded(n,0.25,4,key);
      else bounded(n,0,1,key);
    }
  }
  return structuredClone(c);
}
export function resolveProfile(config,name){return {...PROFILES[name],...config.profileOverrides[name]};}
