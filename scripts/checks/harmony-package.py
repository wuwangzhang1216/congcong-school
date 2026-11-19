"""Small real ZIP fixtures for release alignment, reference integrity and failure isolation."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('harmony', ROOT/'scripts/package-harmony-release.py')
harmony = importlib.util.module_from_spec(spec);spec.loader.exec_module(harmony)
fetcher_spec = importlib.util.spec_from_file_location('fetcher', ROOT/'scripts/fetch-harmony-resources.py')
fetcher = importlib.util.module_from_spec(fetcher_spec);fetcher_spec.loader.exec_module(fetcher)
sha = lambda raw: hashlib.sha256(raw).hexdigest()

class Packaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name);self.site = self.root/'site';self.archives=self.root/'archives';self.out=self.root/'assets';self.raw=self.root/'raw'
        self.site.mkdir();self.archives.mkdir();self.assets=[];self.rows=[]
        payloads = [('audio-web-part01.zip','audio-web','.',{'audio/aa/a.mp3':b'mp3 fixture'}),
                    ('data.zip','data','data',{'index.json':b'{"books":[],"audio":"/audio/aa/a.mp3"}'}),
                    ('story-images.zip','story-images','story-images',{'a.png':b'png'}),
                    ('textbook-pages.zip','textbook-pages','textbook-pages',{'a.jpg':b'jpg'})]
        for name,kind,dest,members in payloads:
            with zipfile.ZipFile(self.archives/name,'w') as z:
                for relative,raw in members.items():
                    z.writestr(relative,raw);p=self.site/dest/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
                    self.rows.append({'archive':name,'path':relative,'bytes':len(raw),'sha256':sha(raw)})
            raw=(self.archives/name).read_bytes()
            self.assets.append({'name':name,'kind':kind,'destinations':{'static':dest},'bytes':len(raw),'sha256':sha(raw),'files':len(members),'uncompressed_bytes':sum(map(len,members.values()))})
        self.assets[0]['release_tag']='v1.8.0-web-resources'
        (self.site/'index.html').write_text('<script src="/_next/static/main.js"></script>')
        (self.site/'_next/static').mkdir(parents=True);(self.site/'_next/static/main.js').write_text('const audio="/audio/aa/a.mp3";')
        self.write_manifest()
    def write_manifest(self):
        inv=''.join(json.dumps(r)+'\n' for r in self.rows).encode();(self.archives/'files.jsonl').write_bytes(inv)
        m={'schema_version':2,'tag':'v1.8.2','resource_tag':'v1.8.2-web-resources','assets':self.assets,'file_inventory':{'name':'files.jsonl','bytes':len(inv),'sha256':sha(inv)}}
        (self.archives/'manifest.json').write_text(json.dumps(m))
    def prepare(self,mirror=None):return harmony.prepare(self.site,self.archives,self.out,self.raw,mirror)
    def test_generation_and_version_binding(self):
        m=self.prepare();plan=json.loads((self.raw/'harmony-manifest.json').read_text())
        self.assertEqual(m['manifestSha256'],sha((self.out/'manifest.json').read_bytes()))
        self.assertIn('/v1.8.0-web-resources/',plan['packages'][0]['url'])
        self.assertFalse((self.raw/'data').exists());self.assertFalse((self.raw/'audio').exists())
        self.assertTrue((self.raw/'_next/static/main.js').exists())
        for a in plan['packages']:self.assertTrue((self.raw/a['inventory']['name']).is_file())
    def test_code_only_updates_reuse_resource_identity_but_change_plan_receipt(self):
        first=self.prepare()
        self.out=self.root/'assets-second'
        (self.site/'_next/static/main.js').write_text('const audio="/audio/aa/a.mp3"; const patched=true;')
        second=self.prepare()
        self.assertEqual(first['assetTag'],second['assetTag'])
        self.assertNotEqual(first['shellSha256'],second['shellSha256'])
        self.assertNotEqual(first['manifestSha256'],second['manifestSha256'])
    def test_mismatch_preserves_previous_shell(self):
        self.raw.mkdir();(self.raw/'.harmony-web-output').touch();(self.raw/'index.html').write_text('previous')
        (self.site/'data/index.json').write_text('{"books":["wrong edition"]}')
        with self.assertRaises(ValueError):self.prepare()
        self.assertEqual((self.raw/'index.html').read_text(),'previous');self.assertFalse(self.out.exists())
    def test_corrupt_package_and_inventory(self):
        (self.archives/'audio-web-part01.zip').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):self.prepare()
        self.assertFalse(self.raw.exists())
    def test_serialized_shell_audio_must_exist(self):
        (self.site/'index.html').write_text('<script>const url="/audio/aa/missing.mp3"</script>')
        with self.assertRaisesRegex(ValueError,'Unpackaged shell audio'):self.prepare()
    def test_legacy_ui_literals_require_mp3_siblings(self):
        (self.site/'_next/static/main.js').write_text('const audio="/audio/aa/a.opus";')
        self.prepare()
        self.assertTrue((self.raw/'_next/static/main.js').is_file())
    def test_missing_json_media(self):
        # Keep site and archive data identical; only its media reference is invalid.
        raw=b'{"audio":"/audio/missing.mp3"}'
        with zipfile.ZipFile(self.archives/'data.zip','w') as z:z.writestr('index.json',raw)
        (self.site/'data/index.json').write_bytes(raw);a=self.assets[1];a.update(bytes=(self.archives/'data.zip').stat().st_size,sha256=harmony.digest(self.archives/'data.zip'),uncompressed_bytes=len(raw))
        self.rows[1].update(bytes=len(raw),sha256=sha(raw));self.write_manifest()
        with self.assertRaisesRegex(ValueError,'Unpackaged media reference'):self.prepare()
    def test_unsafe_zip(self):
        name='audio-web-part01.zip';raw=b'escape'
        with zipfile.ZipFile(self.archives/name,'w') as z:z.writestr('../escape.mp3',raw)
        self.assets[0].update(bytes=(self.archives/name).stat().st_size,sha256=harmony.digest(self.archives/name),uncompressed_bytes=len(raw))
        self.rows[0].update(path='../escape.mp3',bytes=len(raw),sha256=sha(raw));self.write_manifest()
        with self.assertRaisesRegex(ValueError,'Unsafe resource path'):self.prepare()
    def test_mirror_http_requires_private_ip(self):
        with self.assertRaisesRegex(ValueError,'private-IP'):self.prepare('http://public.example:8787')
        m=self.prepare('http://192.168.1.20:8787');self.assertTrue(m['allowInsecureHttp'])
        self.assertTrue(json.loads((self.out/'manifest.json').read_text())['packages'][0]['url'].startswith('http://192.168.1.20:8787/'))
    def mock_fetch(self, requests, corrupt=None):
        def open_archive(request, *, timeout):
            url = request.full_url
            range_header = request.get_header('Range')
            requests.append((url, range_header, timeout))
            name = url.rsplit('/', 1)[1]
            payload = (self.archives / name).read_bytes()
            if name == corrupt:
                payload = b'x' * len(payload)
            start = int(range_header.removeprefix('bytes=').removesuffix('-')) if range_header else 0
            response = io.BytesIO(payload[start:])
            response.status = 206 if start else 200
            response.headers = {'Content-Length': str(len(payload) - start)}
            if start:
                response.headers['Content-Range'] = f'bytes {start}-{len(payload) - 1}/{len(payload)}'
            return response

        return patch.object(fetcher.installer.urllib.request, 'urlopen', open_archive)

    def test_fetch_resumes_archives_at_original_release_tags_and_reuses_verified_cache(self):
        target = self.root/'cache'
        target.mkdir()
        requests = []
        name = 'audio-web-part01.zip'
        (target / (name + '.part')).write_bytes((self.archives / name).read_bytes()[:12])
        with self.mock_fetch(requests):
            self.assertEqual(fetcher.fetch('v1.8.2', target, timeout=60), 4)
            self.assertIn((f'{fetcher.installer.RELEASE_ROOT}/v1.8.0-web-resources/{name}', 'bytes=12-', 60), requests)
            self.assertEqual((target / name).read_bytes(), (self.archives / name).read_bytes())
            requests.clear()
            fetcher.fetch('v1.8.2', target)
            self.assertEqual(requests, [(f'{fetcher.installer.RELEASE_ROOT}/v1.8.2/manifest.json', None, 30)])

    def test_fetch_corruption_keeps_existing_file_and_removes_invalid_partial(self):
        target=self.root/'cache';target.mkdir();(target/'data.zip').write_bytes(b'previous')
        with self.mock_fetch([], corrupt='data.zip'):
            with self.assertRaisesRegex(RuntimeError,'mismatch'):
                fetcher.fetch('v1.8.2', target, attempts=1)
        self.assertEqual((target/'data.zip').read_bytes(),b'previous')
        self.assertFalse(list(target.glob('*.part')))
    def test_extra_data_cannot_leak_into_release(self):
        (self.site/'data/local.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'membership differs'):self.prepare()

if __name__=='__main__':unittest.main()
