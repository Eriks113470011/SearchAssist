def without_v51_registration(path,source):
    if path=='simulator/config.mjs':return source.replace("['v2','v3','v4','v5','v5.1']","['v2','v3','v4','v5']")
    if path=='simulator/policy.mjs':return source.replace("import {createPolicyV51} from './policy-v5-1.mjs';\n",'').replace(",'v5.1':'bounded-search-policies-v5.1'",'').replace(",'v5.1':createPolicyV51",'')
    return source
