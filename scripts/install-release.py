#!/usr/bin/env python3
"""Install or upgrade verified release resources, source, or a ready-to-serve site."""
import argparse
import hashlib
import json
import os
import re
import shutil
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

DEFAULT_TAG = 'v1.8.3'
RELEASE_ROOT = 'https://github.com/wuwangzhang1216/congcong-school/releases/download'
DESTINATIONS = {
    'audio.tar.gz': 'apps/web/public',
    'data.zip': 'apps/web/public/data',
    'data-source.zip': 'data',
    'story-images.zip': 'apps/web/public/story-images',
    'textbook-pages.zip': 'apps/web/public/textbook-pages',
}


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_name(name):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name):
        raise ValueError(f'Unsafe asset name: {name}')
    return name


def resource_base(manifest, requested_tag):
    """A primary release may keep large resources on another release in this repo."""
    return f"{RELEASE_ROOT}/{safe_name(manifest.get('resource_tag', requested_tag))}"


def asset_base(manifest, requested_tag, asset):
    """Reuse immutable archives from another release in the same repository."""
    tag = asset.get('release_tag')
    return f'{RELEASE_ROOT}/{safe_name(tag)}' if tag is not None else resource_base(manifest, requested_tag)


def target_path(destination, name):
    parts = PurePosixPath(name.replace('\\', '/'))
    if not name or parts.is_absolute() or '..' in parts.parts or ':' in name:
        raise ValueError(f'Unsafe archive path: {name}')
    target = destination.joinpath(*parts.parts)
    if not target.resolve().is_relative_to(destination.resolve()):
        raise ValueError(f'Archive path escapes destination: {name}')
    return target


def install_plan(manifest, mode='source', with_source=False):
    assets = manifest['assets']
    names = [safe_name(a['name']) for a in assets]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate asset name')
    if manifest['schema_version'] == 1:
        destinations = dict(DESTINATIONS)
        if 'audio-web-mp3.tar.gz' in names:
            destinations['audio-web-mp3.tar.gz'] = 'apps/web/public'
        if mode == 'static':
            destinations = {n: ('.' if d == 'apps/web/public' else d.removeprefix('apps/web/public/'))
                            for n, d in destinations.items() if n != 'data-source.zip'}
            destinations['web-app.zip'] = '.'
        selected = [(a, destinations[a['name']]) for a in assets if a['name'] in destinations]
        if set(destinations) != {a['name'] for a, _ in selected}:
            raise ValueError('Incomplete legacy release manifest')
        return selected
    if manifest['schema_version'] != 2:
        raise ValueError('Unsupported manifest version')
    selected = [(a, a['destinations'][mode]) for a in assets
                if mode in a.get('destinations', {}) and (a.get('kind') != 'source' or with_source)]
    if not selected or not any(a.get('kind') == 'audio-web' for a, _ in selected):
        raise ValueError('Release has no installable Web audio')
    for _, destination in selected:
        target_path(Path('/installation'), destination)
    return selected


def verify_required_content(root, manifest, mode):
    """An overlay must never masquerade as a complete installation."""
    expected = manifest.get('requires_content', {}).get('json_without_audio_sha256', {})
    public = root / 'apps/web/public' if mode == 'source' else root
    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if k not in ('audio', 'generatedAt')}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value
    for relative, fingerprint in expected.items():
        path = target_path(public, relative)
        if not path.is_file():
            raise ValueError(f'Overlay requires the existing complete resource installation: {relative}')
        content = json.loads(path.read_text(encoding='utf-8'))
        actual = hashlib.sha256(json.dumps(clean(content), ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        if actual != fingerprint:
            raise ValueError(f'Overlay base content differs; preserve local changes before upgrading: {relative}')


def read_inventory(cache, manifest, selected):
    if manifest['schema_version'] == 1:
        return None
    item = manifest['file_inventory']
    path = cache / safe_name(item['name'])
    if path.stat().st_size != item['bytes'] or sha256(path) != item['sha256']:
        raise ValueError('File inventory size/SHA-256 mismatch')
    wanted = {a['name'] for a, _ in selected}
    result, counts, sizes = {}, {}, {}
    with path.open(encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line)
            if row['archive'] not in wanted:
                continue
            key = (row['archive'], row['path'])
            if key in result:
                raise ValueError(f'Duplicate inventory entry: {key}')
            result[key] = row
            counts[row['archive']] = counts.get(row['archive'], 0) + 1
            sizes[row['archive']] = sizes.get(row['archive'], 0) + row['bytes']
    for asset, _ in selected:
        name = asset['name']
        if counts.get(name, 0) != asset['files'] or sizes.get(name, 0) != asset['uncompressed_bytes']:
            raise ValueError(f'Incomplete file inventory: {name}')
    return result


def installed_files(root, selected, inventory):
    """Resolve every inventory path before checking or trusting local content."""
    destinations = {a['name']: d for a, d in selected}
    return [(archive, target_path(root, str(PurePosixPath(destinations[archive]) / name)), row)
            for (archive, name), row in inventory.items()]


def matches_file(path, row):
    return path.is_file() and path.stat().st_size == row['bytes'] and sha256(path) == row['sha256']


def pending_archives(root, selected, inventory):
    """Reuse installed bytes only after comparison with the target release inventory."""
    if inventory is None:
        return selected
    changed = set()
    for archive, path, row in installed_files(root, selected, inventory):
        if archive not in changed and not matches_file(path, row):
            changed.add(archive)
    return [(a, d) for a, d in selected if a['name'] in changed]


def extract(path, destination, expected=None):
    destination.mkdir(parents=True, exist_ok=True)
    seen = set()

    def save(name, stream, size, mode=0o644):
        name = name.replace('\\', '/')
        target = target_path(destination, name)
        if name in seen:
            raise ValueError(f'Duplicate archive path: {name}')
        seen.add(name)
        row = expected.get((path.name, name)) if expected is not None else None
        if expected is not None and (row is None or size != row['bytes']):
            raise ValueError(f'Unlisted or wrong-sized archive member: {name}')
        target.parent.mkdir(parents=True, exist_ok=True)
        with stream, target.open('wb') as dest:
            shutil.copyfileobj(stream, dest)
        target.chmod(0o755 if mode & 0o111 else 0o644)
        if row is not None and sha256(target) != row['sha256']:
            raise ValueError(f'Archive member SHA-256 mismatch: {name}')

    if path.suffix == '.zip':
        with zipfile.ZipFile(path) as archive:
            for item in archive.infolist():
                target_path(destination, item.filename)
                if (item.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('Archive links are not supported')
                if not item.is_dir():
                    save(item.filename, archive.open(item), item.file_size, item.external_attr >> 16)
    else:
        with tarfile.open(path, 'r|gz') as archive:
            for item in archive:
                if not item.isfile():
                    raise ValueError('Only regular archive files are supported')
                save(item.name, archive.extractfile(item), item.size, item.mode)
    if expected is not None and seen != {name for archive, name in expected if archive == path.name}:
        raise ValueError(f'Missing archive members: {path.name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', default=DEFAULT_TAG)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--mode', choices=['source', 'static'], default='source')
    parser.add_argument('--with-source', action='store_true', help='Also replace source files; back up local edits first')
    parser.add_argument('--archives-dir', type=Path, help='Use already downloaded archives and manifest')
    parser.add_argument('--verify-only', action='store_true', help='Verify installed files against the inventory without downloading packages or writing')
    parser.add_argument('--full-download', action='store_true', help='Download and reinstall all selected packages, even if local files match')
    parser.add_argument('--dry-run', action='store_true', help='Check local files and show required packages without installing')
    parser.add_argument('--asset-kind', action='append', help='Install only selected resource kinds (for example source-data for CI)')
    args = parser.parse_args()
    safe_name(args.tag)
    if args.tag == 'latest':
        with urllib.request.urlopen('https://api.github.com/repos/wuwangzhang1216/ChinaTextbookStudyFree/releases/latest', timeout=60) as response:
            args.tag = safe_name(json.load(response)['tag_name'])
    if args.with_source and args.mode != 'source':
        parser.error('--with-source requires --mode source')
    if args.verify_only and (args.full_download or args.dry_run):
        parser.error('--verify-only cannot be combined with --full-download or --dry-run')
    root = args.root.resolve()
    with tempfile.TemporaryDirectory(prefix='china-study-assets-') as temporary:
        cache = args.archives_dir.resolve() if args.archives_dir else Path(temporary)
        base = f'{RELEASE_ROOT}/{args.tag}'

        def download(name, location=None):
            safe_name(name)
            if not args.archives_dir:
                print(f'Downloading {name}…', flush=True)
                urllib.request.urlretrieve((location or base) + '/' + name, cache / name)

        download('manifest.json')
        manifest = json.loads((cache / 'manifest.json').read_text(encoding='utf-8'))
        if manifest.get('tag') != args.tag:
            raise ValueError('Manifest tag mismatch')
        base = resource_base(manifest, args.tag)
        verify_required_content(root, manifest, args.mode)
        selected = install_plan(manifest, args.mode, args.with_source)
        if args.asset_kind:
            selected = [(asset, destination) for asset, destination in selected if asset.get('kind') in args.asset_kind]
            if set(args.asset_kind) != {asset.get('kind') for asset, _ in selected}:
                raise ValueError('Requested asset kind is absent or unavailable in this installation mode')
        if manifest['schema_version'] == 2:
            download(manifest['file_inventory']['name'])
        inventory = read_inventory(cache, manifest, selected)
        if args.verify_only:
            if inventory is None:
                raise ValueError('--verify-only requires a schema 2 release')
            for _, target, row in installed_files(root, selected, inventory):
                if not matches_file(target, row):
                    raise ValueError(f'Installed file mismatch: {target}')
            print(f'Verified {len(inventory):,} installed files in {root}')
            return
        if inventory is not None and not args.full_download:
            print('Checking installed resources against the release inventory…', flush=True)
        elif inventory is None:
            print('Legacy release has no file inventory; all selected packages are required.', flush=True)
        pending = selected if args.full_download else pending_archives(root, selected, inventory)
        needed = {a['name'] for a, _ in pending}
        for item, _ in selected:
            action = 'Required' if item['name'] in needed else 'Unchanged; skipping'
            print(f"{action}: {item['name']} ({item['bytes']:,} bytes)", flush=True)
        total = sum(a['bytes'] for a, _ in pending)
        print(f'Packages required: {len(pending)}/{len(selected)}; {total:,} bytes', flush=True)
        if args.dry_run:
            return
        # Check every required package before extracting or changing any installed file.
        for item, _ in pending:
            name = item['name']
            download(name, asset_base(manifest, args.tag, item))
            path = cache / name
            if path.stat().st_size != item['bytes'] or sha256(path) != item['sha256']:
                raise ValueError(f'Size/SHA-256 mismatch: {name}')
            print(f'Verified {name}', flush=True)
        # Stage alongside the destination so final per-file replacements are atomic.
        root.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.china-study-stage-', dir=root.parent) as staged:
            stage = Path(staged)
            for item, destination in pending:
                print(f"Staging {item['name']}…", flush=True)
                extract(cache / item['name'], target_path(stage, destination), inventory)
            staged_files = [p for p in stage.rglob('*') if p.is_file()]
            # Preflight existing symlinks/path blockers before committing any file.
            for path in staged_files:
                target = target_path(root, path.relative_to(stage).as_posix())
                if target.is_dir():
                    raise ValueError(f'A directory blocks an installed file: {target}')
                for parent in target.parents:
                    if parent == root.parent:
                        break
                    if parent.exists() and not parent.is_dir():
                        raise ValueError(f'A file blocks an installed directory: {parent}')
            root.mkdir(parents=True, exist_ok=True)
            for path in staged_files:
                target = target_path(root, path.relative_to(stage).as_posix())
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(path, target)
            receipt = dict(manifest, installed_mode=args.mode, installed_with_source=args.with_source)
            if args.asset_kind:
                receipt['installed_asset_kinds'] = args.asset_kind
            (root / 'ASSETS-VERSION.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(f'Installed {args.tag}: {len(staged_files):,} files in {root}')


if __name__ == '__main__':
    main()
