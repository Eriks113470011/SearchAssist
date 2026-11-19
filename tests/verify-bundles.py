"""Independent ZIP/CRC/SHA and snapshot validation of Chromium downloads (synthetic data only)."""
from pathlib import Path, PurePosixPath
import csv
import hashlib
import io
import json
import zipfile

for path in sorted(Path('test-results').glob('review-bundle-*.zip')):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, 'ZIP CRC failure'
        names = archive.namelist()
        assert len(names) == len(set(names))
        assert all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and '\\' not in n for n in names)
        manifest = json.loads(archive.read('manifest.json'))
        assert manifest['format'] == 'searchassist-review-bundle' and manifest['bundleVersion'] == 1
        assert set(names) == {'manifest.json'} | {f['path'] for f in manifest['files']}
        for f in manifest['files']:
            content = archive.read(f['path'])
            assert len(content) == f['bytes'] and hashlib.sha256(content).hexdigest() == f['sha256']
        summary = json.loads(archive.read('study-summary.json'))
        assert summary['generatedAt'] == manifest['generatedAt']
        assert summary['settings'] == manifest['settings'] and summary['review'] == manifest['review']
        for filename, key in [('condition-summary.csv', 'conditions'), ('paired-summary.csv', 'paired'), ('balance.csv', 'balance')]:
            rows = list(csv.DictReader(io.StringIO(archive.read(filename).decode())))
            assert len(rows) == len(summary[key])
            for actual, expected in zip(rows, summary[key]):
                for k, value in expected.items():
                    if value is None:
                        assert actual[k] == ''
                    elif isinstance(value, (float, int)):
                        assert float(actual[k]) == value
                    else:
                        assert actual[k] == value
        if manifest['dataScope'] == 'aggregate-only':
            assert not any(n.startswith('individual/') for n in names)
            for name in names:
                text = archive.read(name).decode()
                assert not any(secret in text for secret in ['BUNDLE_SECRET_', 'PRIVATE_BUNDLE_FILE', 'PRIVATE_BUNDLE_NOTE', 'PRIVATE_RATING_OBSERVATION'])
        else:
            project = json.loads(archive.read('individual/workspace.json'))
            assert project['projectVersion'] == 2 and project['savedAt'] == manifest['generatedAt']
            assert len(project['files']) == manifest['review']['importedFiles']
        print(f'{path.name}: verified {len(names)} ZIP members, CRC32, manifest SHA-256, and aggregate values')
assert len(list(Path('test-results').glob('review-bundle-*.zip'))) == 3, 'Expected all three browser bundle fixtures'
