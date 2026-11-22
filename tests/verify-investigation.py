"""Independent structural/hash/pairing checks, not validation of human behavior."""
from pathlib import Path
import csv, hashlib, json, math, sys
root = Path(sys.argv[1])
manifest = json.loads((root/'manifest.json').read_text())
assert manifest['format'] == 'searchassist-investigation-manifest'
assert manifest['dataOrigin'] == 'synthetic' and manifest['humanRatings'] is None
assert {p.name for p in root.iterdir()} == {'manifest.json'} | {f['path'] for f in manifest['files']}
for f in manifest['files']:
    assert not Path(f['path']).is_absolute() and '..' not in Path(f['path']).parts
    b = (root/f['path']).read_bytes()
    assert len(b) == f['bytes'] and hashlib.sha256(b).hexdigest() == f['sha256']
for f in manifest['sourceFiles']:
    assert hashlib.sha256(Path(f['path']).read_bytes()).hexdigest() == f['sha256']
assert hashlib.sha256((root/'config.json').read_bytes()).hexdigest() == manifest['configSha256']
r = json.loads((root/'investigation.json').read_text())
c = json.loads((root/'config.json').read_text())
assert r['format'] == 'searchassist-simulator-investigation' and r['config'] == c
assert r['dataOrigin'] == 'synthetic' and r['calibrationStatus'] == 'uncalibrated' and r['humanRatings'] is None
assert len(r['runs']) == len(c['seeds'])*2*len(c['variants'])
rows = r['observations']
slots = len(c['simulation'].get('browser', {}).get('assignmentSlots', range(18)))
per_run = len(c['simulation']['profiles'])*c['simulation']['replicates']*slots*12
assert len(rows) == len(r['runs'])*per_run
def key(t):
    return (t['seed'],t['policyVersion'],t['variant'],t['profile'],t['replicate'],t['order'],t['setRotation'],t['taskIndex'])
index = {key(t):t for t in rows}
assert len(index) == len(rows)
for run in r['runs']:
    group = [t for t in rows if (t['seed'],t['policyVersion'],t['variant']) == (run['seed'],run['policyVersion'],run['variant'])]
    assert len(group) == per_run
    assert run['config']['masterSeed'] == run['seed'] and run['config']['policyVersion'] == run['policyVersion']
    for profile in c['simulation']['profiles']:
        actual = run['config']['profileOverrides'].get(profile, {})
        expected = dict(c['simulation']['profileOverrides'].get(profile, {}))
        if run['variant'] == 'no-recognition-noise': expected['recognitionNoise'] = 0
        if run['variant'] == 'no-typing-errors': expected['typingErrorRate'] = 0
        assert actual == expected
    if run['variant'] == 'no-interruptions': assert run['config']['browser']['interruptions'] == []
    for condition in run['summary']['conditions']:
        ts = [t for t in group if t['condition'] == condition['condition']]
        assert condition['trials'] == len(ts)
        assert condition['successes'] == sum(t['outcome'] == 'correct' for t in ts)
        assert condition['incorrectSelections'] == sum(t['outcome'] == 'wrong' for t in ts)
        assert condition['skips'] == sum(t['outcome'] == 'skipped' for t in ts)
    for t in group:
        assert t['outcome'] in ['correct','wrong','skipped']
        if c['simulation']['runner'] == 'browser':
            assert t['recordingVerified'] is True and t['observedBrowserActiveMs'] >= 0
            expected_faults = sum(f['taskIndex'] == t['taskIndex'] for f in run['config']['browser']['interruptions'])
            assert t['interruptionCount'] == t['verifiedInterruptions'] == expected_faults
        else:
            assert t['recordingVerified'] is None and t['observedBrowserActiveMs'] is None
expected_pairs = set()
for t in rows:
    if t['policyVersion'] == 'v3': expected_pairs.add(('policy',key(t)))
    if t['variant'] != 'baseline': expected_pairs.add(('control',key(t)))
actual_pairs = set()
for p in r['pairs']:
    after_key = (p['seed'],p['afterPolicy'],p['afterVariant'],p['profile'],p['replicate'],p['order'],p['setRotation'],p['taskIndex'])
    before_key = (p['seed'],p['beforePolicy'],p['beforeVariant'],*after_key[3:])
    before, after = index[before_key],index[after_key]
    assert p['beforeOutcome'] == before['outcome'] and p['afterOutcome'] == after['outcome']
    assert p['beforeCategory'] == before['category'] and p['afterCategory'] == after['category']
    assert p['deltaModeledActiveMs'] == after['modeledActiveMs']-before['modeledActiveMs']
    assert p['deltaRewrites'] == after['manualRewrites']-before['manualRewrites']
    actual_pairs.add((p['comparison'],after_key))
assert actual_pairs == expected_pairs and len(actual_pairs) == len(r['pairs'])
assert len(r['benchmark']) == len(c['seeds'])*2*len(c['simulation']['profiles'])*10*3
assert {b['split'] for b in r['benchmark']} == {'development','held-out'}
for filename, count in [('outcomes.csv',len(rows)),('comparisons.csv',len(r['pairs'])),('benchmark.csv',len(r['benchmark']))]:
    with (root/filename).open() as f:
        exported = list(csv.DictReader(f))
    assert len(exported) == count and all(t['dataOrigin'] == 'synthetic' for t in exported)
with (root/'groups.csv').open() as f:
    groups = list(csv.DictReader(f))
assert sum(int(g['tasks']) for g in groups) == len(rows)
for g in groups:
    ts = [t for t in rows if all(str(t[k]) == g[k] for k in ['seed','policyVersion','variant','profile','condition','taskType'])]
    assert int(g['tasks']) == len(ts)
    for field, outcome in [('correct','correct'),('wrong','wrong'),('skipped','skipped')]: assert int(g[field]) == sum(t['outcome'] == outcome for t in ts)
    assert math.isclose(float(g['meanModeledActiveMs']),sum(t['modeledActiveMs'] for t in ts)/len(ts),rel_tol=1e-12)
assert 'SIMULATED / UNCALIBRATED' in (root/'report.html').read_text()
print(f'Verified investigation: {len(r["runs"])} runs, {len(rows)} tasks, {len(r["pairs"])} matched comparisons; source/payload hashes, controls, coverage and CSVs.')
