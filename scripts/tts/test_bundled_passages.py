"""The real collector must combine installed and bundled readings without overwrites."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import collect_texts as collector

class BundledPassages(unittest.TestCase):
    def collect(self, root, duplicate=False):
        output=root/'output';output.mkdir()
        for folder,book,text in [('installed','english-g5up','Hello!'),('bundled','english-g5up' if duplicate else 'english-g5up-jingtong-2026','France')]:
            target=root/folder/'english';target.mkdir(parents=True)
            (target/f'{book}.json').write_text(json.dumps({'bookId':book,'subject':'english','passages':[{'id':book+'-p1','language':'English','sentences':[text]}]}))
            (target/'ignored.draft.json').write_text('{}')
        manifest=root/'manifest.json'
        with patch.multiple(collector,OUTPUT_DIR=output,PASSAGES_DIR=root/'installed',BUNDLED_PASSAGES_DIR=root/'bundled',STORIES_DIR=root/'absent',MANIFEST_PATH=manifest),contextlib.redirect_stdout(io.StringIO()):
            collector.collect()
        return json.loads(manifest.read_text())['items']

    def test_both_sources_reach_tts_with_separate_reading_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            items=self.collect(Path(tmp))
            self.assertEqual({i['text'] for i in items},{'Hello!','France'})
            self.assertEqual({i['passage_id'] for i in items},{'english-g5up-p1','english-g5up-jingtong-2026-p1'})
            self.assertTrue(all(i['field']=='passage_sentence' and i['language']=='English' for i in items))
            self.assertTrue(all(i['grade']==5 for i in items))

    def test_duplicate_book_cannot_silently_overwrite_audio_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,'Duplicate reading source'):
                self.collect(Path(tmp),duplicate=True)

if __name__=='__main__':unittest.main()
