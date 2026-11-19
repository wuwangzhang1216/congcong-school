"""Actual collector and provider call boundaries, no network requests."""
import unittest,sys,tempfile,json,contextlib,io,hashlib,asyncio
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent))
import collect_texts as collector
import edge_tts_batch as edge
from pinyin_speech import pinyin_speech, audio_rel, CONTEXT
class PinyinContract(unittest.TestCase):
 def test_language_and_non_ascii_speakability(self):
  for t in ['b','an','eng','ā','á','ǎ','à','ü']:
   self.assertEqual(collector.detect_language(t,'chinese'),'Chinese');self.assertTrue(collector.is_speakable(t))
   self.assertEqual(collector.detect_language(t,'english',1),'English')
 def test_real_collector_does_not_collapse_pinyin_into_english(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);out=root/'output'
   for subject in ['chinese','english']:
    p=out/subject/'quizzes';p.mkdir(parents=True)
    (p/'测试一年级上册_unit1.json').write_text(json.dumps({'unit_test':{'questions':[{'options':['b','an','ā']}]}}))
   manifest=root/'manifest.json'
   with patch.multiple(collector,OUTPUT_DIR=out,PASSAGES_DIR=root/'absent',BUNDLED_PASSAGES_DIR=root/'absent',STORIES_DIR=root/'absent',MANIFEST_PATH=manifest),contextlib.redirect_stdout(io.StringIO()):collector.collect()
   items=json.loads(manifest.read_text())['items']
   for text in ['b','an']:
    rows=[x for x in items if x['text']==text];self.assertEqual(len(rows),2)
    zh=next(x for x in rows if x['subject']=='chinese');en=next(x for x in rows if x['subject']=='english')
    self.assertNotEqual(zh['audio_rel'],en['audio_rel']);self.assertEqual(zh['language'],'Chinese');self.assertEqual(en['language'],'English')
    self.assertEqual(en['hash'],hashlib.sha1(text.encode()).hexdigest());self.assertIn('pinyin-',zh['audio_rel'])
 def test_book_id_grade_parsing(self):
  self.assertEqual(collector.parse_grade('chinese-g1up'),1);self.assertEqual(collector.parse_grade('chinese-g1down'),1)
class ProviderContract(unittest.IsolatedAsyncioTestCase):
 async def test_tone_units_use_renderer_with_pinned_chinese_stream(self):
  import pinyin_render
  calls=[]
  class Fake:
   def __init__(self,**kw):calls.append(kw)
   async def stream(self):yield {'type':'audio','data':b'anchor'}
  async def render(text,synthesize):
   self.assertEqual(text,'ā á ǎ à');self.assertEqual(await synthesize('阿'),b'anchor');return b'four-rendered-vowels'
  with tempfile.TemporaryDirectory() as tmp,patch.object(edge.edge_tts,'Communicate',Fake),patch.object(pinyin_render,'render',render):
   text='ā á ǎ à';spoken=pinyin_speech(text);job={'text':text,'spoken_text':spoken,'audio_rel':audio_rel(text,spoken),'language':'Chinese','pronunciation_context':CONTEXT}
   ok,_=await edge.synth_one(job,Path(tmp),'+0%','+0%','+0Hz','en','en',max_retries=1)
   self.assertTrue(ok);self.assertEqual(calls[0]['voice'],'zh-CN-XiaoxiaoNeural');self.assertEqual(calls[0]['rate'],'-10%');self.assertEqual((Path(tmp)/job['audio_rel']).read_bytes(),b'four-rendered-vowels')
 async def test_pinned_chinese_voice_plan_and_distinct_english_asset(self):
  calls=[]
  class Fake:
   def __init__(self,**kw):calls.append(kw)
   async def stream(self):yield {'type':'audio','data':b'fixture'}
  with tempfile.TemporaryDirectory() as tmp,patch.object(edge.edge_tts,'Communicate',Fake):
   text='b';spoken=pinyin_speech(text);rel=audio_rel(text,spoken)
   job={'text':text,'spoken_text':spoken,'audio_rel':rel,'language':'Chinese','speaker':'ryan','pronunciation_context':CONTEXT}
   ok,_=await edge.synth_one(job,Path(tmp),'+20%','-20%','+10Hz','en-US-AnaNeural','en-US-AnaNeural',max_retries=1)
   self.assertTrue(ok);self.assertEqual(calls[0]['voice'],'zh-CN-XiaoxiaoNeural');self.assertEqual(calls[0]['text'],'玻');self.assertEqual(calls[0]['rate'],'-10%')
   legacy={'text':'b','audio_rel':'e9/english.opus','language':'English','speaker':'ryan'}
   ok,_=await edge.synth_one(legacy,Path(tmp),'+0%','+0%','+0Hz','zh-CN-XiaoxiaoNeural','en-US-AnaNeural',max_retries=1)
   self.assertTrue(ok);self.assertEqual(calls[-1]['voice'],'en-US-GuyNeural');self.assertEqual(calls[-1]['text'],'b')
   bad={**job,'spoken_text':'bee'};ok,message=await edge.synth_one(bad,Path(tmp),'+0%','+0%','+0Hz','zh','en',max_retries=1)
   self.assertFalse(ok);self.assertIn('mismatch',message)
   with self.assertRaises(ValueError):edge.validate_pinyin_job({**job,'language':'English'})
if __name__=='__main__':unittest.main()
