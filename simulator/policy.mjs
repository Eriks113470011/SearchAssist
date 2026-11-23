import {createPolicyV2} from './policy-v2.mjs';
import {createPolicyV3} from './policy-v3.mjs';
export const MODEL_VERSIONS=Object.freeze({v2:'bounded-search-policies-v2',v3:'bounded-search-policies-v3'});
export function createPolicy(goal,startingQuery,profile,draw,version='v3'){
 if(!Object.hasOwn(MODEL_VERSIONS,version))throw new Error('Unsupported policy version.');
 return (version==='v2'?createPolicyV2:createPolicyV3)(goal,startingQuery,profile,draw);
}
