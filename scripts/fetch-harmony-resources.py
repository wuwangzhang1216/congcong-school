#!/usr/bin/env python3
"""Cache only the immutable release archives required by the Harmony MP3 build."""
import argparse
import importlib.util
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('installer',ROOT/'scripts/install-release.py')
installer=importlib.util.module_from_spec(spec);spec.loader.exec_module(installer)
KINDS={'audio-web','data','story-images','textbook-pages'}


def fetch(tag,directory):
    installer.safe_name(tag)
    if directory.resolve().is_relative_to((ROOT/'apps/web/public').resolve()): raise ValueError('Keep archive cache outside Web public')
    directory.mkdir(parents=True,exist_ok=True)
    def download(url,name,metadata=None):
        installer.safe_name(name);path=directory/name
        if metadata and path.is_file() and path.stat().st_size==metadata['bytes'] and installer.sha256(path)==metadata['sha256']:
            print('Reusing '+name,flush=True);return
        temporary=path.with_name(path.name+'.part')
        try:
            print('Downloading '+name,flush=True);urllib.request.urlretrieve(url,temporary)
            if metadata and (temporary.stat().st_size!=metadata['bytes'] or installer.sha256(temporary)!=metadata['sha256']): raise ValueError('Size/SHA-256 mismatch: '+name)
            temporary.replace(path)
        finally:temporary.unlink(missing_ok=True)
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
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--tag',default=installer.DEFAULT_TAG);p.add_argument('--directory',type=Path,required=True);a=p.parse_args()
    print(f'Cached {fetch(a.tag,a.directory)} Harmony resource archives')
