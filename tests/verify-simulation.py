"""Independent verification of synthetic model artifacts; not empirical validation of human behavior."""
from pathlib import Path
from collections import Counter
import csv
import hashlib
import json
import math
import sys

root = Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
assert manifest['dataOrigin'] == 'synthetic' and manifest['calibrationStatus'] == 'uncalibrated'
assert manifest['runner'] == 'model' and manifest['schemaVersion'] == 1
expected = {'manifest.json'} | {f['path'] for f in manifest['files']}
assert expected == {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
for f in manifest['files']:
    assert not Path(f['path']).is_absolute() and '..' not in Path(f['path']).parts
    b = (root / f['path']).read_bytes()
    assert len(b) == f['bytes'] and hashlib.sha256(b).hexdigest() == f['sha256']
for f in manifest['sourceFiles']:
    b = Path(f['path']).read_bytes()
    assert hashlib.sha256(b).hexdigest() == f['sha256']
assert hashlib.sha256((root / 'config.json').read_bytes()).hexdigest() == manifest['configSha256']
metadata = json.loads((root / 'run.json').read_text())
config = json.loads((root / 'config.json').read_text())
assert metadata['humanRatings'] is None and metadata['dataOrigin'] == 'synthetic'
assert metadata['config'] == config and metadata['resolvedProfiles'] == manifest['resolvedProfiles']
sessions = [json.loads((root / p).read_text()) for p in metadata['sessionFiles']]
assert len(sessions) == manifest['simulatedSessions'] == len(config['profiles']) * 18 * config['replicates']
assert len({s['participant'] for s in sessions}) == len(sessions)
coverage = Counter()
trials = []
for session in sessions:
    assert session['format'] == 'searchassist-simulation-session' and session['humanRatings'] is None
    assert session['participant'].startswith('SIM_') and session['dataOrigin'] == 'synthetic'
    assert len(session['trials']) == 12
    coverage[session['profile'], session['order'], session['setRotation']] += 1
    for t in session['trials']:
        assert t['success'] == (t['termination'] == 'submitted' and t['selectedId'] == t['expectedTargetId'])
        assert t['incorrectSelection'] == (t['termination'] == 'submitted' and t['selectedId'] != t['expectedTargetId'])
        assert t['skipped'] == (t['termination'] != 'submitted')
        assert t['observedBrowserActiveMs'] is None and t['observedBrowserWallMs'] is None
        assert math.isfinite(t['modeledActiveMs']) and 0 <= t['modeledActiveMs'] <= config['limits']['maxModeledActiveMs']
        assert t['actions'] <= config['limits']['maxActionsPerTrial']
        assert sum(x['durationMs'] for x in t['ledger']) == t['modeledActiveMs']
        assert sum(x['durationMs'] for x in t['trace']) == t['modeledActiveMs']
        for x in t['ledger']:
            assert sum(x[k] for k in ['readingMs', 'decisionMs', 'typingMs', 'pointClickMs', 'systemWaitMs']) == x['durationMs']
        assert t['manualRewrites'] == sum(x['type'] == 'rewrite' for x in t['trace'])
        assert t['modeledQueryChanges'] == sum(x.get('queryBefore') != x.get('queryAfter') for x in t['trace'] if 'queryBefore' in x)
        trials.append(t)
assert len(trials) == manifest['totalTrials']
assert len(coverage) == len(config['profiles']) * 18 and set(coverage.values()) == {config['replicates']}
with (root / 'trials.csv').open() as f:
    rows = list(csv.DictReader(f))
    assert len(rows) == len(trials) and all(r['dataOrigin'] == 'synthetic' and r['calibrationStatus'] == 'uncalibrated' for r in rows)
with (root / 'conditions.csv').open() as f:
    for row in csv.DictReader(f):
        group = [t for t in trials if t['condition'] == row['condition']]
        assert int(row['trials']) == len(group)
        assert int(row['successes']) == sum(t['success'] for t in group)
        assert int(row['incorrectSelections']) == sum(t['incorrectSelection'] for t in group)
        assert int(row['skips']) == sum(t['skipped'] for t in group)
        assert math.isclose(float(row['meanModeledActiveMs']), sum(t['modeledActiveMs'] for t in group) / len(group), rel_tol=1e-12)
assert 'SIMULATED / UNCALIBRATED' in (root / 'report.html').read_text()
print(f'Verified synthetic run: {len(sessions)} sessions, {len(trials)} tasks, all coverage cells, source/payload hashes, timing ledgers, and CSV outcomes.')
