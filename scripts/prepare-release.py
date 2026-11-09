#!/usr/bin/env python3
"""Build allowlisted store/source ZIPs; never publish or copy Git history."""
import hashlib
import json
import re
import struct
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = [
    'manifest.json', 'model.js', 'ui.js', 'styles.css', 'LICENSE',
    'extension/background.js', 'extension/controller.js',
    'extension/panel.html', 'extension/panel.js', 'extension/panel.css',
    *[f'extension/icons/{size}.png' for size in [16, 32, 48, 128]],
]
PUBLIC = [
    '.gitignore', 'README.md', 'PRIVACY.md', 'index.html', 'app.js',
    'docs/DESIGN.md', 'docs/VALIDATION.md', 'docs/STORE.md',
    'extension/icons/mark.svg',
]
SECRET = re.compile(r"/(?:Users|home)/[^\s'\"<>]+|codex@local(?:host)|"
                    r'-----BEGIN [A-Z ]*PRIVATE KEY-----|'
                    r'\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b')


def public_files(root):
    files = set(RUNTIME + PUBLIC)
    for directory in ['tests', 'scripts', 'docs/preview', 'store']:
        for path in (root / directory).rglob('*'):
            if path.suffix in {'.js', '.cjs', '.py', '.html', '.css', '.png', '.jpg'}:
                files.add(path.relative_to(root).as_posix())
    return sorted(files)


def read_files(root, names):
    result = {}
    for name in names:
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f'Unsafe source path: {name}')
        data = path.read_bytes()
        if path.suffix not in {'.png', '.jpg'} and SECRET.search(data.decode('utf-8')):
            raise ValueError(f'Private path / credential pattern in public file: {name}')
        result[name] = data
    return result


def validate_runtime(files):
    try:
        manifest = json.loads(files['manifest.json'])
    except (json.JSONDecodeError, KeyError) as error:
        raise ValueError('Missing or invalid release manifest') from error
    if manifest['manifest_version'] != 3 or not re.fullmatch(r'\d+\.\d+\.\d+', manifest['version']):
        raise ValueError('Unexpected manifest version')
    if set(manifest['permissions']) != {'sidePanel', 'tabs', 'storage', 'alarms'}:
        raise ValueError('Review changed permissions before release')
    if manifest.get('host_permissions') or manifest.get('content_scripts'):
        raise ValueError('Review added site access before release')
    if manifest['background']['service_worker'] != 'extension/background.js' or manifest['side_panel']['default_path'] != 'extension/panel.html':
        raise ValueError('Update packaging for changed runtime entry points')
    if manifest['icons'].get('128') != 'extension/icons/128.png':
        raise ValueError('Missing store icon')
    for icons in [manifest['icons'], manifest['action']['default_icon']]:
        for size, name in icons.items():
            if name not in RUNTIME or name != f'extension/icons/{size}.png':
                raise ValueError(f'Unexpected icon path: {name}')
    for size in [16, 32, 48, 128]:
        name = f'extension/icons/{size}.png'
        data = files[name]
        if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (size, size):
            raise ValueError(f'Invalid icon dimensions: {name}')
    panel = files['extension/panel.html'].decode()
    for resource in ['../styles.css', 'panel.css', '../model.js', '../ui.js', 'panel.js']:
        if resource not in panel:
            raise ValueError(f'Review changed panel resource: {resource}')
    if "importScripts('../model.js', 'controller.js')" not in files['extension/background.js'].decode():
        raise ValueError('Review changed worker imports')
    return manifest['version']


def write_zip(path, files):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with ZipFile(temporary, 'w') as archive:
        for name, data in sorted(files.items()):
            info = ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compress_type=ZIP_DEFLATED)
    with ZipFile(temporary) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != set(files):
            raise ValueError(f'ZIP integrity check failed: {path.name}')
    temporary.replace(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    path.with_suffix(path.suffix + '.sha256').write_text(f'{digest}  {path.name}\n')
    print(f'{path.relative_to(ROOT)}: {len(files)} files; SHA-256 {digest}')


def main():
    runtime = read_files(ROOT, RUNTIME)
    version = validate_runtime(runtime)
    source = read_files(ROOT, public_files(ROOT))
    for name in ['store/assets/overview.jpg', 'store/assets/icons.jpg']:
        if name not in source:
            raise ValueError('Rebuild store previews first: node tests/run-browser.cjs')
    # Self-check the release boundary, independent of archive creation.
    assert len(runtime) == 14 and 'manifest.json' in runtime
    assert not any('/.git/' in name or name.startswith('docs/research/') or 'UI_HANDOFF' in name for name in source)
    output = ROOT / 'dist'
    output.mkdir(exist_ok=True)
    write_zip(output / f'ArcLike-{version}.zip', runtime)
    write_zip(output / f'ArcLike-{version}-source.zip', source)


if __name__ == '__main__':
    main()
