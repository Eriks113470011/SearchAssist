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
assert manifest['runner'] in ['model', 'browser'] and manifest['schemaVersion'] == 1
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
assert len(sessions) == manifest['simulatedSessions'] == len(config['profiles']) * len(config.get('browser', {}).get('assignmentSlots', list(range(18)))) * config['replicates']
assert len({s['participant'] for s in sessions}) == len(sessions)
coverage = Counter()
trials = []
for session in sessions:
    assert session['format'] == 'searchassist-simulation-session' and session['humanRatings'] is None
    assert session['participant'].startswith('SIM_') and session['dataOrigin'] == 'synthetic'
    assert len(session['trials']) == 12
    if manifest['runner'] == 'browser':
        recording = session['browserRecording']
        assert recording['dataOrigin'] == 'synthetic' and recording['format'] == 'searchassist-simulation-browser-recording'
        assert recording['runner'] == 'browser' and recording['humanRatings'] is None and recording['ratings'] == []
        assert recording['phase'] == 'complete' and len(recording['trials']) == 12
    coverage[session['profile'], session['order'], session['setRotation']] += 1
    for t in session['trials']:
        assert t['success'] == (t['termination'] == 'submitted' and t['selectedId'] == t['expectedTargetId'])
        assert t['incorrectSelection'] == (t['termination'] == 'submitted' and t['selectedId'] != t['expectedTargetId'])
        assert t['skipped'] == (t['termination'] != 'submitted')
        if manifest['runner'] == 'browser':
            r = session['browserRecording']['trials'][t['taskIndex'] - 1]
            assert t['recordingVerified'] and t['observedBrowserActiveMs'] == r['activeElapsedMs'] and t['observedBrowserWallMs'] == r['wallElapsedMs']
            assert t['selectedId'] == r['selectedId'] and t['finalQuery'] == r['finalQuery'] and t['resultOpens'] == r['resultOpens']
            assert t['recordedQueryReformulations'] == t['modeledQueryChanges'] == r['queryReformulations']
            faults = t.get('interruptions', [])
            assert len(faults) == sum(f['taskIndex'] == t['taskIndex'] for f in config['browser'].get('interruptions', []))
            assert r['pauseCount'] == r['resumeCount'] == len(faults)
            assert r['restored'] == any(f['kind'] in ['reload', 'restore'] for f in faults)
            for f in faults:
                assert f['verified'] and f['taskIndex'] == t['taskIndex']
                assert f['queryBefore'] == f['queryAfter'] and f['previousQueryBefore'] == f['previousQueryAfter']
                assert f['completedTrialsBefore'] == f['completedTrialsAfter'] == t['taskIndex'] - 1
                assert f['activePausedStartMs'] == f['activePausedEndMs']
                assert f['observedHoldMs'] >= f['holdMs'] - 20
                assert f['wallPausedEndMs'] - f['wallPausedStartMs'] >= f['observedHoldMs'] - 50
                assert f['pauseCountAfter'] == f['pauseCountBefore'] + 1 and f['resumeCountAfter'] == f['resumeCountBefore'] + 1
                assert f['visibilityBefore'] == f['visibilityAfter'] == 'visible'
                assert f['restoreEventsAfter'] - f['restoreEventsBefore'] == int(f['kind'] in ['reload', 'restore'])
                if f['kind'] == 'hidden':
                    assert isinstance(f['nativeWindowId'], int) and f['nativeWindowId'] == f['coverWindowId']
                    assert f['visibilityDuring'] == 'hidden' and f['visibilityMethod'] == 'native-sibling-tab-no-default-overrides'
        else:
            assert t['observedBrowserActiveMs'] is None and t['observedBrowserWallMs'] is None
        assert math.isfinite(t['modeledActiveMs']) and 0 <= t['modeledActiveMs'] <= config['limits']['maxModeledActiveMs']
        assert t['actions'] <= config['limits']['maxActionsPerTrial']
        assert sum(x['durationMs'] for x in t['ledger']) == t['modeledActiveMs']
        assert sum(x['durationMs'] for x in t['trace']) == t['modeledActiveMs']
        for x in t['ledger']:
            assert sum(x[k] for k in ['readingMs', 'decisionMs', 'typingMs', 'pointClickMs', 'systemWaitMs']) == x['durationMs']
        assert t['manualRewrites'] == sum(x['type'] == 'rewrite' for x in t['trace'])
        assert t['modeledQueryChanges'] == sum(x.get('queryBefore') != x.get('queryAfter') for x in t['trace'] if 'queryBefore' in x)
        d=t['diagnosis']
        assert d['category'] == ('correct' if t['success'] else 'wrong-selection' if t['incorrectSelection'] else t['termination'] if t['termination'] in ['action-budget','time-budget'] else 'target-not-returned' if not d['targetEverReturned'] else 'target-not-inspected' if not d['targetInspected'] else 'target-inspected-not-selected')
        assert d['targetEverReturned'] == any(q['targetRank'] is not None for q in d['queries'])
        for a in t['trace']:
            for k in ['decisionEvidence','evidenceAfter']:
                e=a.get(k)
                if e:
                    assert math.isclose(e['score'],e['overlap']+e['rankBoost']+e['noise'],abs_tol=1e-12)
                    if e['version']=='topic-query-evidence-v1':
                        assert e['querySupport'] in [0,1] and e['queryWeight']==0.4
                        assert math.isclose(e['overlap'],e['goalOverlap']+(1-e['goalOverlap'])*e['queryWeight']*e['querySupport'],abs_tol=1e-12)
                    if e['version'] in ['topic-overlap-v1','topic-query-evidence-v1'] and e['eligible']:
                        assert e['matchedTopicTerms'] and e.get('goalOverlap',e['overlap'])>=e['minimumOverlap']
            if a['type']=='submit' and config['policyVersion'] in ['v3','v4','v5','v5.1']:
                assert a['decisionEvidence']['eligible']
                assert a['decisionEvidence']['score']>=a['decisionEvidence']['threshold']
                if config['policyVersion'] in ['v5','v5.1']:
                    assert a['decisionEvidence']['constraints']['qualified'] and a['decisionEvidence']['detailsVerified']
        trials.append(t)
assert len(trials) == manifest['totalTrials']
assert len(coverage) == len(config['profiles']) * len(config.get('browser', {}).get('assignmentSlots', list(range(18)))) and set(coverage.values()) == {config['replicates']}
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
        if manifest['runner'] == 'browser':
            assert math.isclose(float(row['meanObservedBrowserActiveMs']), sum(t['observedBrowserActiveMs'] for t in group) / len(group), rel_tol=1e-12)
            assert math.isclose(float(row['meanObservedBrowserWallMs']), sum(t['observedBrowserWallMs'] for t in group) / len(group), rel_tol=1e-12)
        assert math.isclose(float(row['meanModeledActiveMs']), sum(t['modeledActiveMs'] for t in group) / len(group), rel_tol=1e-12)
with (root / 'interruptions.csv').open() as f:
    faults = list(csv.DictReader(f))
    assert len(faults) == sum(len(t.get('interruptions', [])) for t in trials)
    assert all(f['verified'] == 'true' and f['dataOrigin'] == 'synthetic' and f['runner'] == 'browser' for f in faults)
assert metadata['summary']['interruptionCount'] == metadata['summary']['verifiedInterruptions'] == len(faults)
with (root / 'failures.csv').open() as f:
    failures=list(csv.DictReader(f))
assert len(failures)==sum(not t['success'] for t in trials)
assert 'SIMULATED / UNCALIBRATED' in (root/'failure-inspector.html').read_text()
assert 'SIMULATED / UNCALIBRATED' in (root / 'report.html').read_text()
print(f'Verified synthetic run: {len(sessions)} sessions, {len(trials)} tasks, all coverage cells, source/payload hashes, timing ledgers, and CSV outcomes.')
