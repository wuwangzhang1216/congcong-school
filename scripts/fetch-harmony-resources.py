#!/usr/bin/env python3
"""Cache only the immutable release archives required by the Harmony MP3 build."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'scripts/install-release.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
KINDS={'audio-web','data','story-images','textbook-pages'}


def fetch(tag,directory,*,timeout=30,attempts=5):
    installer.safe_name(tag)
    if directory.resolve().is_relative_to((ROOT/'apps/web/public').resolve()): raise ValueError('Keep archive cache outside Web public')
    directory.mkdir(parents=True,exist_ok=True)
    def download(url,name,metadata=None):
        installer.safe_name(name)
        installer.download_file(url,directory/name,metadata,timeout=timeout,attempts=attempts)
    base=installer.RELEASE_ROOT+'/'+tag
    download(base+'/manifest.json','manifest.json')
    manifest=json.loads((directory/'manifest.json').read_text())
    if manifest.get('tag')!=tag or manifest.get('schema_version')!=2:raise ValueError('Manifest version mismatch')
    items=[a for a in manifest['assets'] if a.get('kind') in KINDS and 'static' in a.get('destinations',{})]
    if {a['kind'] for a in items}!=KINDS or len({a['name'] for a in items})!=len(items):raise ValueError('Incomplete/duplicate resource selection')
    inventory=manifest['file_inventory'];installer.safe_name(inventory['name'])
    download(installer.resource_base(manifest,tag)+'/'+inventory['name'],inventory['name'],inventory)
    for asset in items:
        installer.safe_name(asset['name'])
        if not asset['name'].endswith('.zip'):raise ValueError('Only ZIP resources are supported')
        download(installer.asset_base(manifest,tag,asset)+'/'+asset['name'],asset['name'],asset)
    return len(items)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag',default=installer.DEFAULT_TAG)
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--download-timeout',type=float,default=30,help='Connection/read timeout in seconds (default: 30)')
    parser.add_argument('--download-attempts',type=int,default=5,help='Maximum attempts per download (default: 5)')
    args=parser.parse_args()
    if not 0 < args.download_timeout < float('inf') or args.download_attempts < 1:
        parser.error('--download-timeout must be positive and finite; --download-attempts must be at least 1')
    count=fetch(args.tag,args.directory,timeout=args.download_timeout,attempts=args.download_attempts)
    print(f'Cached {count} Harmony resource archives')
