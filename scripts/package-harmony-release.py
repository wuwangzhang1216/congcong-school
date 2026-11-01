#!/usr/bin/env python3
"""Prepare a version-bound ArkWeb shell and immutable, verified offline assets."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MEDIA = {'audio', 'data', 'story-images', 'textbook-pages'}
KINDS = {'audio-web': '.', 'data': 'data', 'story-images': 'story-images', 'textbook-pages': 'textbook-pages'}
ORIGIN = 'https://cstf.invalid'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    if not name or name.rstrip('/') != p.as_posix() or p.is_absolute() or any(x in ('..', '.') for x in p.parts) or '\\' in name or ':' in name or '\0' in name:
        raise ValueError(f'Unsafe resource path: {name}')
    return p


def safe_name(name):
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name):
        raise ValueError(f'Unsafe release/asset name: {name}')
    return name


def verified(path, metadata):
    if path.is_symlink() or not path.is_file() or path.stat().st_size != metadata['bytes'] or digest(path) != metadata['sha256']:
        raise ValueError(f'Size/SHA-256 mismatch: {path}')


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f'scripts/{name}.py')
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def prepare(site, archives, output, destination, mirror=None):
    for target in (output, destination):
        if target == site or target.is_relative_to(site) or target == archives or target.is_relative_to(archives):
            raise ValueError('Outputs must be outside input directories')
    manifest = json.loads((archives / 'manifest.json').read_text())
    if manifest['schema_version'] != 2: raise ValueError('Harmony requires a schema 2 release, not legacy Opus resources')
    tag = safe_name(manifest['tag'])
    selected = [a for a in manifest['assets'] if a.get('kind') in KINDS and 'static' in a.get('destinations', {})]
    if {a['kind'] for a in selected} != set(KINDS): raise ValueError('Missing Harmony resource kind')
    if len({a['name'] for a in selected}) != len(selected): raise ValueError('Duplicate package name')
    inventory_meta = manifest['file_inventory'];safe_name(inventory_meta['name'])
    verified(archives / inventory_meta['name'], inventory_meta)
    groups = {a['name']: {} for a in selected}
    with (archives / inventory_meta['name']).open(encoding='utf-8') as stream:
        for line in stream:
            row = json.loads(line)
            if row['archive'] not in groups: continue
            name = safe_path(row['path']).as_posix()
            if name in groups[row['archive']]: raise ValueError('Duplicate inventory entry')
            if not isinstance(row['bytes'], int) or row['bytes'] < 0 or not re.fullmatch(r'[a-f0-9]{64}', row['sha256']):
                raise ValueError('Invalid inventory metadata')
            groups[row['archive']][name] = row
    public_rows = {}
    for a in selected:
        safe_name(a['name'])
        if not a['name'].endswith('.zip') or a['destinations']['static'] != KINDS[a['kind']]: raise ValueError('Unsupported archive layout')
        rows = groups[a['name']]
        if len(rows) != a['files'] or sum(r['bytes'] for r in rows.values()) != a['uncompressed_bytes']: raise ValueError('Incomplete inventory')
        verified(archives / a['name'], a)
        with zipfile.ZipFile(archives / a['name']) as z:
            members = [i for i in z.infolist() if not i.is_dir()]
            if len(members) != len(rows) or {i.filename for i in members} != set(rows): raise ValueError('ZIP membership differs')
            for i in z.infolist():
                safe_path(i.filename)
                mode = (i.external_attr >> 16) & 0o170000
                if mode not in (0, 0o100000, 0o040000): raise ValueError('Archive links/special files are unsupported')
                if i.is_dir(): continue
                if i.file_size != rows[i.filename]['bytes']: raise ValueError('ZIP member size differs')
                h = hashlib.sha256()
                with z.open(i) as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''): h.update(block)
                if h.hexdigest() != rows[i.filename]['sha256']: raise ValueError('ZIP member SHA-256 differs')
                relative = (PurePosixPath(KINDS[a['kind']]) / i.filename).as_posix()
                if a['kind'] == 'audio-web' and not (relative.startswith('audio/') and relative.endswith('.mp3')): raise ValueError('Audio ZIP must contain MP3 under audio/')
                if relative in public_rows: raise ValueError('Overlapping resource destinations')
                public_rows[relative] = rows[i.filename]
    # Every resource byte is checked against the release, not just the index count.
    for relative, row in public_rows.items(): verified(site / relative, row)
    actual_data = {p.relative_to(site).as_posix() for p in (site / 'data').rglob('*.json')}
    if actual_data != {p for p in public_rows if p.startswith('data/') and p.endswith('.json')}:
        raise ValueError('Site/release data membership differs')
    def check_refs(value):
        if isinstance(value, dict):
            for v in value.values(): check_refs(v)
        elif isinstance(value, list):
            for v in value: check_refs(v)
        elif isinstance(value, str) and value.startswith(('/audio/', '/story-images/', '/textbook-pages/')):
            if value[1:] not in public_rows: raise ValueError(f'Unpackaged media reference: {value}')
    for relative in actual_data: check_refs(json.loads((site / relative).read_text()))
    if not (site / 'index.html').is_file() or not (site / '_next/static').is_dir(): raise ValueError('Incomplete static export')
    shell = sorted(p for p in site.rglob('*') if p.is_file() and p.relative_to(site).parts[0] not in MEDIA and p.name != 'sw.js')
    for p in shell:
        relative = p.relative_to(site).as_posix();safe_path(relative)
        if p.is_symlink() or any(x.startswith('.') for x in p.relative_to(site).parts) or p.suffix in ('.zip', '.gz'):
            raise ValueError(f'Unexpected shell file: {relative}')
        # Includes pre-rendered HTML, RSC payloads and bundled interface audio URLs.
        if p.suffix in ('.html', '.js', '.json', '.txt'):
            text = p.read_text(encoding='utf-8')
            for ref in re.findall(r'/audio/[A-Za-z0-9_./-]+\.(?:mp3|opus)', text):
                resolved = ref[:-5] + '.mp3' if ref.endswith('.opus') else ref
                if resolved[1:] not in public_rows: raise ValueError(f'Unpackaged shell audio: {ref}')
    shell_hash = hashlib.sha256(''.join(f'{p.relative_to(site).as_posix()}\0{digest(p)}\n' for p in shell).encode()).hexdigest()
    resource_hash = hashlib.sha256(''.join(f'{name}\0{row["bytes"]}\0{row["sha256"]}\n' for name, row in sorted(public_rows.items())).encode()).hexdigest()
    # Code-only HAP updates reuse the exact same verified resource directory.
    # The completion receipt still binds the full plan (including shell hash).
    asset_tag = f'resources-{resource_hash[:24]}'
    if mirror:
        from urllib.parse import urlsplit
        import ipaddress
        u = urlsplit(mirror)
        try: private = any(ipaddress.ip_address(u.hostname) in ipaddress.ip_network(net) for net in ('10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16'))
        except ValueError: private = False
        if not u.hostname or ':' in u.hostname or u.username or u.password or u.query or u.fragment or u.scheme not in ('https', 'http') or (u.scheme == 'http' and not private):
            raise ValueError('Mirror must be HTTPS or an explicit private-IP LAN server')
    installer = load('install-release')
    output.parent.mkdir(parents=True, exist_ok=True);destination.parent.mkdir(parents=True, exist_ok=True)
    if output.exists(): raise ValueError('Use a new assets output directory; published bundles are immutable')
    if destination.exists() and not (destination / '.harmony-web-output').is_file(): raise ValueError('Refusing to replace an unmanaged shell')
    with tempfile.TemporaryDirectory(prefix='.harmony-', dir=output.parent) as temp:
        assets = Path(temp) / 'assets';raw = Path(temp) / 'site';assets.mkdir();raw.mkdir()
        plan = {'schema': 1, 'tag': asset_tag, 'releaseTag': tag, 'shellSha256': shell_hash, 'packages': []}
        for a in selected:
            inventory_name = a['name'] + '.files.jsonl'
            inventory_path = assets / inventory_name
            inventory_path.write_text(''.join(json.dumps(r, separators=(',', ':')) + '\n' for r in groups[a['name']].values()))
            try: os.link(archives / a['name'], assets / a['name'])
            except OSError: shutil.copy2(archives / a['name'], assets / a['name'])
            base = mirror.rstrip('/') if mirror else installer.asset_base(manifest, tag, a)
            plan['packages'].append({'name': a['name'], 'kind': a['kind'], 'directory': KINDS[a['kind']],
                'bytes': a['bytes'], 'sha256': a['sha256'], 'url': base + '/' + a['name'],
                'inventory': {'name': inventory_name, 'bytes': inventory_path.stat().st_size, 'sha256': digest(inventory_path)},
                'files': a['files'], 'uncompressedBytes': a['uncompressed_bytes']})
        (assets / 'manifest.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
        for p in shell:
            target = raw / p.relative_to(site);target.parent.mkdir(parents=True, exist_ok=True);shutil.copy2(p, target)
        metadata = {'assetTag': asset_tag, 'manifestSha256': digest(assets / 'manifest.json'),
            'assetBaseUrl': mirror.rstrip('/') if mirror else '', 'allowInsecureHttp': bool(mirror and urlsplit(mirror).scheme == 'http'),
            'downloadBytes': sum(a['bytes'] for a in selected),
            'requiredStorageBytes': sum(a['uncompressed_bytes'] for a in selected) + max(a['bytes'] + a['uncompressed_bytes'] for a in selected),
            'shellSha256': shell_hash}
        # Production downloads use the original immutable archive URLs; the small
        # generated plan and inventories travel in HAP, never at an unpublished URL.
        shutil.copy2(assets / 'manifest.json', raw / 'harmony-manifest.json')
        for entry in plan['packages']: shutil.copy2(assets / entry['inventory']['name'], raw / entry['inventory']['name'])
        (raw / 'harmony-build.json').write_text(json.dumps(metadata, indent=2) + '\n')
        (raw / '.harmony-web-output').write_text('generated by package-harmony-release.py\n')
        # Only replace a previous generated shell after every check has passed.
        backup = Path(tempfile.mkdtemp(prefix='.harmony-previous-', dir=output.parent)) / 'site' if destination.exists() else Path(temp) / 'previous-site'
        if destination.exists(): destination.rename(backup)
        try: shutil.move(str(raw), destination);shutil.move(str(assets), output)
        except BaseException:
            if destination.exists(): shutil.rmtree(destination)
            if backup.exists(): backup.rename(destination)
            raise
    return metadata


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--site', type=Path, required=True);p.add_argument('--archives', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--destination', type=Path, default=ROOT/'apps/harmony/entry/src/main/resources/rawfile/site')
    p.add_argument('--mirror', help='Explicit HTTPS mirror or private-IP LAN server; never a public HTTP server')
    a = p.parse_args();print(json.dumps(prepare(a.site.resolve(), a.archives.resolve(), a.output.resolve(), a.destination.resolve(), a.mirror), indent=2))

if __name__ == '__main__': main()
