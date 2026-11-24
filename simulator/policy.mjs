import {createPolicyV2} from './policy-v2.mjs';
import {createPolicyV3} from './policy-v3.mjs';
import {createPolicyV4} from './policy-v4.mjs';
import {createPolicyV5} from './policy-v5.mjs';
export const MODEL_VERSIONS=Object.freeze({v2:'bounded-search-policies-v2',v3:'bounded-search-policies-v3',v4:'bounded-search-policies-v4',v5:'bounded-search-policies-v5'});
export function createPolicy(goal,startingQuery,profile,draw,version='v4'){
 if(!Object.hasOwn(MODEL_VERSIONS,version))throw new Error('Unsupported policy version.');
 return ({v2:createPolicyV2,v3:createPolicyV3,v4:createPolicyV4,v5:createPolicyV5}[version])(goal,startingQuery,profile,draw);
}
