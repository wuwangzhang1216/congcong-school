#!/usr/bin/env python3
"""Stage only exported website files and public media, never local backups."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from media_types import MEDIA_FOLDERS, expected_extension_type, media_content_type, write_media_manifest

ROOT = Path(__file__).resolve().parents[2]
DIRECTORIES = {'_next','audio','data','story-images','textbook-pages','book','grade',
               'lesson','reading','stories','profile','review','shop','404','jump','league','number-sense','icons'}
ROOT_FILES = {'index.html','index.txt','404.html','icon.svg','robots.txt','sitemap.xml',
              'content-revision.html','content-revision-status.json','manifest.webmanifest','sw.js'}


def preserve_media_timestamp(path, destination, rel):
    # Next export resets public-file mtimes on every build. Preserve the source
    # timestamp after checking its contents, so unchanged media are not reuploaded.
    if rel.parts[0] not in {'audio','story-images','textbook-pages'}:
        return
    original = ROOT/'apps/web/public'/rel
    if not original.is_file():
        raise ValueError(f'Missing original public media: {rel}')
    if hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(original.read_bytes()).digest():
        raise ValueError(f'Export differs from original public media: {rel}')
    stat = original.stat()
    os.utime(destination, ns=(stat.st_atime_ns,stat.st_mtime_ns))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'apps/web/out')
    parser.add_argument('--destination', type=Path, default=ROOT/'deploy-output/site')
    parser.add_argument('--previous-site', type=Path, help='Verified previous snapshot; preserve timestamps only for identical media.')
    args = parser.parse_args()
    subprocess.run([sys.executable, str(ROOT / 'scripts/checks/content-retention.py'),
                    '--public', str(args.source)], check=True)
    args.destination.mkdir(parents=True, exist_ok=False)
    counts = Counter()
    media_overrides = {}
    size = 0
    unchanged_media = 0
    for path in sorted(args.source.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(args.source)
        if path.is_symlink() or any(part.startswith('.') for part in rel.parts):
            raise ValueError(f'Unexpected linked/hidden export: {rel}')
        if rel.parts[0] not in DIRECTORIES and rel.as_posix() not in ROOT_FILES:
            continue
        if any('backup' in part.lower() for part in rel.parts):
            raise ValueError(f'Backup unexpectedly in website: {rel}')
        if path.suffix in {'.html','.js','.json','.txt'}:
            if re.search(rb'sk-or-v1-[A-Za-z0-9]{20,}', path.read_bytes()):
                raise ValueError(f'Credential detected in {rel}')
        dest = args.destination/rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Keep the verified deploy snapshot isolated from later rebuilds.
        import shutil
        shutil.copy2(path,dest)
        preserve_media_timestamp(path,dest,rel)
        if args.previous_site and rel.parts[0] in MEDIA_FOLDERS:
            previous = args.previous_site/rel
            if (previous.is_file() and previous.stat().st_size == path.stat().st_size
                    and hashlib.sha256(previous.read_bytes()).digest() == hashlib.sha256(path.read_bytes()).digest()):
                stat = previous.stat()
                os.utime(dest, ns=(stat.st_atime_ns, stat.st_mtime_ns))
                unchanged_media += 1
        if rel.parts[0] in MEDIA_FOLDERS and path.suffix.lower() != '.json':
            actual_type = media_content_type(path)
            if actual_type != expected_extension_type(path):
                media_overrides[rel.as_posix()] = actual_type
        counts[rel.parts[0]] += 1
        size += path.stat().st_size
    assert (args.destination/'index.html').is_file()
    # New route families must never silently disappear from the release package.
    omitted_routes = [str(path.relative_to(args.source)) for path in args.source.rglob('index.html')
                      if not (args.destination/path.relative_to(args.source)).is_file()]
    if omitted_routes:
        raise ValueError(f'Exported routes omitted from deployment: {omitted_routes}')
    index = json.loads((args.destination/'data/index.json').read_text())
    active = [book for book in index['books'] if not book.get('supersededBy')]
    parallel_jingtong = ROOT/'content/editions/jingtong/english-g5up-2026.json'
    expected_six_three = 44 + int(parallel_jingtong.is_file())
    assert len([book for book in active if book.get('schoolSystem','6-3') == '6-3']) == expected_six_three
    parallel_catalog = ROOT/'content/editions/five-four/catalog.json'
    expected_parallel = {book['id'] for book in json.loads(parallel_catalog.read_text())['books']} if parallel_catalog.is_file() else set()
    assert {book['id'] for book in active if book.get('schoolSystem') == '5-4'} == expected_parallel
    assert len({book['id'] for book in index['books']}) == len(index['books'])
    missing = set()
    refs = Counter()
    def visit(value):
        if isinstance(value, dict):
            for v in value.values():visit(v)
        elif isinstance(value,list):
            for v in value:visit(v)
        elif isinstance(value,str) and value.startswith(('/audio/','/story-images/','/textbook-pages/')):
            if value.startswith('/audio/') and not value.endswith('.mp3'):
                raise ValueError(f'Web audio must have an iOS-compatible MP3 export: {value}')
            refs[value.split('/')[1]] += 1
            if not (args.destination/value.lstrip('/')).is_file():missing.add(value)
    for path in (args.destination/'data').rglob('*.json'):
        visit(json.loads(path.read_text()))
    assert not missing, sorted(missing)[:10]
    report = {'created_at':datetime.now(timezone.utc).isoformat(),'files':sum(counts.values()),
              'bytes':size,'directories':dict(counts),'media_references':dict(refs),
              'missing_media':len(missing),'unchanged_media':unchanged_media,
              'media_content_type_overrides':dict(Counter(media_overrides.values())),
              'index_sha256':hashlib.sha256((args.destination/'data/index.json').read_bytes()).hexdigest()}
    (args.destination.parent/'site-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    write_media_manifest(args.destination,media_overrides)
    print(json.dumps(report,indent=2))


if __name__=='__main__':main()
