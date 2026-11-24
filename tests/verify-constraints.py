"""Independent coverage, classification, gates, cost, pairing and artifact checks; no human validity claim."""
import csv,hashlib,itertools,json,math,sys
from pathlib import Path
root=Path(sys.argv[1]);m=json.loads((root/'manifest.json').read_text())
assert m['format']=='searchassist-constraint-validation-manifest'
assert {p.name for p in root.iterdir()}=={'manifest.json'}|{f['path'] for f in m['files']}
for f in m['files']:
 p=Path(f['path']);assert not p.is_absolute() and '..' not in p.parts
 b=(root/p).read_bytes();assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
for f in m['sourceFiles']:assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
freeze=json.loads(Path('simulator/constraint-freeze.json').read_text())
for f in freeze['sourceFiles']:assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()==f['sha256']
assert hashlib.sha256(Path('simulator/constraint-cases.json').read_bytes()).hexdigest()==freeze['freshCasesSha256']
r=json.loads((root/'validation.json').read_text());c=r['config'];cases={x['id']:x for x in r['cases']}
assert r['format']=='searchassist-constraint-validation' and r['humanRatings'] is None and r['runner']=='model'
assert r['dataOrigin']=='synthetic' and r['calibrationStatus']=='uncalibrated'
assert c==json.loads((root/'config.json').read_text()) and c['policyVersions']==['v4','v5']
assert hashlib.sha256((root/'config.json').read_bytes()).hexdigest()==m['configSha256']
assert r['caseSuiteSha256']==freeze['freshCasesSha256']
fields=['seed','policyVersion','profile','caseId','condition','recordOrder']
key=lambda t:tuple(t[k] for k in fields)
idx={key(t):t for t in r['rows']}
assert len(idx)==len(r['rows'])
assert set(idx)==set(itertools.product(c['seeds'],c['policyVersions'],c['profiles'],cases,c['conditions'],c['recordOrders']))
for t in r['rows']:
 case=cases[t['caseId']];ids=case['acceptableIds'];selected=t['selectedId']
 assert case['split'] in c['splits'] and t['split']==case['split']
 expected=('correct-selection' if selected in ids else 'wrong-selection') if selected is not None else ('answerable-skip' if ids else 'correct-abstention')
 assert t['outcome']==expected
 assert 0<=t['modeledActiveMs']<=r['resolvedSimulation']['limits']['maxModeledActiveMs'] and t['actions']<=r['resolvedSimulation']['limits']['maxActionsPerTrial']
 if selected is not None:
  assert t['submissionEligible'] is True and t['submissionScore']>=t['submissionThreshold']
  if t['policyVersion']=='v5':assert t['submissionQualified'] is True and t['submissionDetailsVerified'] is True
for s in r['samples']:
 assert all(s[k]==idx[key(s)][k] for k in idx[key(s)])
 assert s['modeledActiveMs']==sum(x['durationMs'] for x in s['ledger'])==sum(x['durationMs'] for x in s['trace'])
 # JSON separators match JS stringify for these integer-valued trace/ledger records, except insignificant float spelling.
 submit=next((a for a in s['trace'] if a['type']=='submit'),None)
 if s['policyVersion']=='v5' and submit:
  evidence=submit['decisionEvidence'];checks=evidence['constraints']
  assert checks['qualified'] and evidence['detailsVerified'] and checks['contradiction'] is None
  assert checks['serviceSupported'] and all(x['status']=='supported' for x in checks['requirements'])
  reads=[a for a in s['trace'] if a['type']=='read_details' and a['handle']==submit['handle']]
  assert reads and reads[-1]['durationMs']>0 and reads[-1]['modeledAtMs']<submit['modeledAtMs']
expected_pairs={key(t) for t in r['rows'] if t['policyVersion']=='v5'};actual=set()
for p in r['pairs']:
 k=(p['seed'],'v5',p['profile'],p['caseId'],p['condition'],p['recordOrder']);a=idx[k];b=idx[(k[0],'v4',*k[2:])]
 assert p['beforeOutcome']==b['outcome'] and p['afterOutcome']==a['outcome'] and p['deltaModeledActiveMs']==a['modeledActiveMs']-b['modeledActiveMs']
 actual.add(k)
assert actual==expected_pairs and len(actual)==len(r['pairs'])
for name,groups in r['summaries'].items():
 assert sum(g['tasks'] for g in groups)==len(r['rows'])
 for g in groups:
  ds=[k for k in g if k not in ['tasks','meanModeledActiveMs','correct-selection','wrong-selection','answerable-skip','correct-abstention']]
  rows=[t for t in r['rows'] if all(t[k]==g[k] for k in ds)]
  assert len(rows)==g['tasks']
  for o in ['correct-selection','wrong-selection','answerable-skip','correct-abstention']:assert g[o]==sum(t['outcome']==o for t in rows)
  assert math.isclose(g['meanModeledActiveMs'],sum(t['modeledActiveMs'] for t in rows)/len(rows),rel_tol=1e-12)
for name,expected in [('outcomes.csv',r['rows']),('comparisons.csv',r['pairs'])]:
 with (root/name).open() as f:rows=list(csv.DictReader(f))
 assert len(rows)==len(expected)
 for row,t in zip(rows,expected):
  for k,v in t.items():
   value='' if v is None else str(v).lower() if isinstance(v,bool) else str(v)
   assert row[k]==value,(name,k,row[k],value)
assert 'V4 / V5 constraint validation' in (root/'report.html').read_text()
print(f'Verified {len(r["rows"])} constraint trials, {len(r["pairs"])} pairs; full coverage, outcomes, submission gates, costs, frozen sources and artifacts.')
