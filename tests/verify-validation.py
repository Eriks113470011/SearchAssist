"""Independent matrix, oracle, source, paired-outcome and sampled-timing checks.
These checks validate artifacts, not human behavior or policy effectiveness.
"""
from pathlib import Path
from itertools import product
from collections import Counter
import csv, hashlib, json, math, sys

root=Path(sys.argv[1])
digest=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((root/'manifest.json').read_text())
assert m['format']=='searchassist-broad-validation-manifest' and m['runner']=='model'
assert m['dataOrigin']=='synthetic' and m['calibrationStatus']=='uncalibrated' and m['humanRatings'] is None
assert sum(f['bytes'] for f in m['files'])+(root/'manifest.json').stat().st_size<=m['maxOutputBytes']==64*1024*1024
assert {p.name for p in root.iterdir()}=={'manifest.json'}|{f['path'] for f in m['files']}
for f in m['files']:
    assert not Path(f['path']).is_absolute() and '..' not in Path(f['path']).parts
    b=(root/f['path']).read_bytes()
    assert len(b)==f['bytes'] and digest(b)==f['sha256']
for f in m['sourceFiles']:
    assert not Path(f['path']).is_absolute() and '..' not in Path(f['path']).parts
    assert digest(Path(f['path']).read_bytes())==f['sha256']
frozen=json.loads(Path('tests/fixtures/policy-v4-reference.json').read_text())
assert m['sourcePolicyCommit']==frozen['sourceCommit']=='a83b40f53c47d61c0e70c1c94bae84bfe3e0571c'
for f in frozen['sourceFiles']:
    source=Path(f['path']).read_text()
    # Preserve the original reference hash; remove only additive V5 registry/config entries.
    if f['path']=='simulator/config.mjs':source=source.replace("['v2','v3','v4','v5']","['v2','v3','v4']")
    if f['path']=='simulator/policy.mjs':source=source.replace("import {createPolicyV5} from './policy-v5.mjs';\n",'').replace(",v5:'bounded-search-policies-v5'",'').replace(',v5:createPolicyV5','')
    assert digest(source.encode())==f['sha256'],f['path']
assert digest((root/'config.json').read_bytes())==m['configSha256']
assert digest(Path('simulator/validation-cases.json').read_bytes())==m['caseSuiteSha256']
assert m['caseSuiteSha256']==frozen['challengeSuiteSha256']
r=json.loads((root/'validation.json').read_text()); c=json.loads((root/'config.json').read_text())
assert r['format']=='searchassist-broad-validation' and r['config']==c and r['runner']=='model'
assert r['dataOrigin']=='synthetic' and r['calibrationStatus']=='uncalibrated' and r['humanRatings'] is None
assert c['policyVersions']==['v3','v4']
assert r['caseSuiteSha256']==m['caseSuiteSha256']
source_cases=json.loads(Path('simulator/validation-cases.json').read_text())
assert r['cases']==[x for x in source_cases['cases'] if x['id'] in c['caseIds']]
assert json.loads((root/'cases.json').read_text())['cases']==r['cases']
cases={x['id']:x for x in r['cases']}
key=lambda t:tuple(t[k] for k in ['seed','policyVersion','profile','caseId','condition','recordOrder'])
rows=r['rows']; index={key(t):t for t in rows}
expected=set(product(c['seeds'],c['policyVersions'],c['profiles'],c['caseIds'],c['conditions'],c['recordOrders']))
assert set(index)==expected and len(index)==len(rows)<=20000
limits=r['resolvedSimulation']['limits']
assert limits=={'maxActionsPerTrial':24,'maxRewrites':4,'maxModeledActiveMs':120000}
assert r['resolvedSimulation']['profileOverrides']=={}
def classify(selected,answers):
    if selected is None: return 'answerable-skip' if answers else 'correct-abstention'
    return 'correct-selection' if selected in answers else 'wrong-selection'
for t in rows:
    fixture=cases[t['caseId']]; answers=fixture['acceptableIds']
    assert t['family']==fixture['family'] and t['initialQuery']==fixture['query']
    assert t['expectedAction']==('select-acceptable' if answers else 'abstain')
    assert t['outcome']==classify(t['selectedId'],answers)
    assert math.isfinite(t['modeledActiveMs']) and 0<=t['modeledActiveMs']<=limits['maxModeledActiveMs']
    assert 0<=t['actions']<=limits['maxActionsPerTrial'] and 0<=t['manualRewrites']<=limits['maxRewrites']
    assert len(t['traceSha256'])==64 and t['termination'] in ['submitted','agent-skip','time-budget','action-budget']
    assert (t['termination']=='submitted')==(t['selectedId'] is not None)
    if t['selectedId'] is not None:
        assert t['selectedId'] in {x['id'] for x in fixture['records']}
        assert t['submissionEligible'] is True and t['submissionScore']>=t['submissionThreshold']
        assert t['submissionGoalOverlap']>=0.25
    else:
        assert all(t[k] is None for k in ['submissionEligible','submissionScore','submissionThreshold','submissionGoalOverlap'])
    assert isinstance(t['acceptableReturned'],bool) if answers else t['acceptableReturned'] is None
pairs=r['pairs']; seen=set()
for p in pairs:
    tail=(p['profile'],p['caseId'],p['condition'],p['recordOrder'])
    before=index[(p['seed'],'v3',*tail)]; after=index[(p['seed'],'v4',*tail)]
    k=key(after);assert k not in seen;seen.add(k)
    assert p['beforeOutcome']==before['outcome'] and p['afterOutcome']==after['outcome']
    assert p['family']==before['family']==after['family']
    assert p['deltaModeledActiveMs']==after['modeledActiveMs']-before['modeledActiveMs']
assert seen=={k for k in index if k[1]=='v4'} and len(pairs)*2==len(rows)
outcomes=['correct-selection','wrong-selection','answerable-skip','correct-abstention']
dimensions={'overall':['policyVersion'],'family':['policyVersion','family'],'profile':['policyVersion','profile'],'condition':['policyVersion','condition'],'seed':['policyVersion','seed'],'recordOrder':['policyVersion','recordOrder']}
def same_csv(value,exported):
    if value is None: return exported==''
    if isinstance(value,bool): return exported==str(value).lower()
    return exported==str(value)
for filename,source in [('outcomes.csv',rows),('comparisons.csv',pairs)]:
    exported=list(csv.DictReader((root/filename).open()))
    assert len(exported)==len(source)
    for actual,expected_row in zip(exported,source):
        assert actual['dataOrigin']=='synthetic' and actual['calibrationStatus']=='uncalibrated'
        for field,value in expected_row.items(): assert same_csv(value,actual[field]),(filename,field,value,actual[field])
for name,dims in dimensions.items():
    groups=r['summaries'][name];expected_groups={tuple(t[k] for k in dims) for t in rows}
    assert {tuple(g[k] for k in dims) for g in groups}==expected_groups and len(groups)==len(expected_groups)
    exported=list(csv.DictReader((root/(name+'.csv')).open()));assert len(exported)==len(groups)
    for g,e in zip(groups,exported):
        ts=[t for t in rows if all(t[k]==g[k] for k in dims)];counts=Counter(t['outcome'] for t in ts)
        assert g['tasks']==len(ts) and all(g[o]==counts[o] for o in outcomes)
        assert math.isclose(g['meanModeledActiveMs'],sum(t['modeledActiveMs'] for t in ts)/len(ts),rel_tol=1e-12)
        for field,value in g.items(): assert same_csv(value,e[field])
sample_keys=set()
for s in r['samples']:
    row=index[key(s)]
    assert all(s[k]==v for k,v in row.items())
    sk=(s['caseId'],s['policyVersion'],s['outcome']);assert sk not in sample_keys;sample_keys.add(sk)
    evidence={'trace':s['trace'],'ledger':s['ledger']}
    # JS JSON.stringify preserves insertion order and emits integral numbers without .0.
    b=json.dumps(evidence,separators=(',',':'),ensure_ascii=False).encode()
    assert digest(b)==s['traceSha256']
    assert sum(x['durationMs'] for x in s['ledger'])==s['modeledActiveMs']
    assert len(s['ledger'])==sum(a['type']!='budget_stop' for a in s['trace'])
    elapsed=0
    for a in s['trace']:
        assert a['modeledAtMs']==elapsed
        elapsed+=a['durationMs']
    assert elapsed==s['modeledActiveMs']
assert sample_keys=={(t['caseId'],t['policyVersion'],t['outcome']) for t in rows}
html=(root/'report.html').read_text()
assert 'SIMULATED / UNCALIBRATED' in html and 'MODEL ONLY' in html and 'must not be treated as independent volunteers' in html
print(f'Verified broad validation: {len(rows)} trials, {len(pairs)} pairs, {len(cases)} fixtures, frozen sources, complete oracle outcomes/CSVs and {len(r["samples"])} sampled ledgers.')
