/** Check edition content without release assets; --public also audits the actual built routes/media. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gradeAnswer } from '../../packages/core/src/grade';
import { computeChestsForBook } from '../../packages/core/src/chestLogic';
import { readingId } from '../../packages/core/src/reading';
import { loadJumpData } from '../../apps/web/src/lib/loadJumpData';
import type { Book, BookPassages, Lesson, PathLessonMeta, Question } from '../../packages/core/src/types';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const plan = read('content/editions/jingtong/english-g5up-2026.json');
const id = 'english-g5up-jingtong-2026';
const stem = '义务教育教科书·英语（精通）五年级上册（2026秋版）';
const outline = read(`output/english/outlines/${stem}.json`);
const expected = [[1,'Around the world'],[2,'Jobs'],[3,'Workplaces'],[101,'Revision 1'],[4,'Putting things in order'],[5,'A tidy house'],[6,'Be yourself'],[102,'Revision 2']];
assert.equal(plan.bookId, id);
assert.equal(outline.edition, 'jingtong-2026');
assert.equal(outline.publisherLabel, '人教版（精通）');
assert.equal(outline.supersedes, undefined, 'PEP is a parallel series, never superseded');
assert.deepEqual(outline.units.map((u: any) => [u.unit_number, u.title]), expected);
assert.deepEqual(outline.units.filter((u: any) => u.label).map((u: any) => u.label), ['综合复习','综合复习']);
const vocabulary = plan.units.flatMap((u: any) => u.vocabulary);
assert.equal(vocabulary.length, 96);
assert.deepEqual(plan.units.map((u: any) => u.vocabulary.length), [17,15,15,17,16,16]);
assert.equal(new Set(vocabulary.map((v: any) => v.english)).size,96);
assert.ok(vocabulary.some((v: any) => v.requirement === 'understand'));
for (const u of plan.units) for (const v of u.vocabulary) {
  assert.ok(v.english && v.chinese);
  assert.ok(['use','understand'].includes(v.requirement));
  assert.equal(typeof v.standardLevel2, 'boolean');
  assert.ok(v.firstPage >= u.start && v.firstPage <= u.end);
}
// Guard against the old PEP and old Jingtong word lists found under similar online titles.
assert.ok(plan.units[0].vocabulary.some((v: any) => v.english === 'the UK'));
assert.ok(!plan.units[0].vocabulary.some((v: any) => v.english === 'old' || v.english === 'New Zealand'));
assert.ok(plan.units[3].vocabulary.some((v: any) => v.english === 'take care of'));
assert.ok(!plan.units[3].vocabulary.some((v: any) => v.english === 'bag' || v.english === 'look after'));
const old = read('output/english/outlines/义务教育教科书·英语（PEP）（三年级起点）五年级上册.json');
assert.equal(old.units[0].title, "What’s he like?");
let lessons = 0, regular = 0, challenges = 0;
const sourceQuestions = new Set<string>();
for (const unit of outline.units) {
  const quiz = read(`output/english/quizzes/${stem}_unit${unit.unit_number}.json`);
  assert.equal(quiz.unit, unit.title);
  assert.equal(quiz.unit_number, unit.unit_number);
  assert.deepEqual(quiz.knowledge_summary.map((k: any) => k.point), unit.knowledge_points.map((k: any) => k.name));
  const ids = new Set<number>();
  for (const q of [...quiz.unit_test.questions, ...(quiz.exam?.questions ?? [])] as Question[]) {
    assert.ok(!ids.has(q.id)); ids.add(q.id);
    assert.ok(unit.knowledge_points.some((k: any) => k.name === q.knowledge_point));
    assert.ok(q.explanation);
    assert.equal(q.type, 'choice');
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.equal(q.options.filter(option => option === q.answer).length, 1);
    assert.equal(q.options.filter((_, i) => gradeAnswer(q, String.fromCharCode(65+i))).length,1);
    q.options.forEach((option, i) => assert.equal(gradeAnswer(q, String.fromCharCode(65+i)),option===q.answer));
    assert.equal(gradeAnswer(q, ''), false);
    assert.ok(!sourceQuestions.has(q.question), q.question); sourceQuestions.add(q.question);
  }
  for (const k of quiz.knowledge_summary) {
    const qs = quiz.unit_test.questions.filter((q: Question) => q.knowledge_point === k.point);
    assert.ok(qs.length >= 6);
    assert.ok(k.core_concept && k.tips && k.common_mistakes.length);
    lessons++;
  }
  if (unit.unit_number < 100) {
    const words = plan.units.find((u: any) => u.number === unit.unit_number).vocabulary;
    for (const word of words) assert.ok(quiz.unit_test.questions.some((q: Question) => q.question.includes(`“${word.english}”`) && q.answer === word.chinese));
  }
  regular += quiz.unit_test.questions.length;
  challenges += quiz.exam?.questions.length ?? 0;
}
assert.equal(lessons,32); assert.equal(regular,216); assert.equal(challenges,36);
const passages = read(`content/passages/english/${id}.json`);
assert.equal(passages.bookId,id);
assert.deepEqual(passages.passages.map((p: any) => p.title),outline.requiredPassageTitles);
assert.equal(passages.passages.length,6);
for (const [i,p] of passages.passages.entries()) {
  assert.equal(p.id,`${id}-p${i+1}`);
  assert.deepEqual(p.sentences,plan.units[i].vocabulary.map((v: any) => v.english.replace('...','things')));
  assert.notEqual(readingId('listen', p.id), readingId('listen', `english-g5up-p${i+1}`));
}
async function actual(publicDir: string) {
  const data = path.join(publicDir,'data');
  const books: Book[] = read(path.join(data,'index.json')).books;
  const current = books.find(b => b.id === id)!;
  const pep = books.find(b => b.id === 'english-g5up')!;
  assert.ok(current && pep);
  assert.equal(current.supersedes,undefined); assert.equal(pep.supersededBy,undefined);
  assert.equal(current.lessonsCount,32); assert.equal(current.unitsCount,6);
  assert.equal(current.activitiesCount,2); assert.ok(current.hasPassages);
  assert.equal(current.publisherLabel,'人教版（精通）');
  assert.ok(current.textbookName.includes('精通'));
  const sameSlot = books.filter(b => b.grade===5 && b.subject==='english' && b.semester==='up' && b.schoolSystem!=='5-4' && !b.supersededBy);
  assert.deepEqual(sameSlot.map(b => b.id),['english-g5up',id], 'Existing fallback stays PEP');
  const built = read(path.join(data,`books/${id}/outline.json`));
  const pepOutline = read(path.join(data,'books/english-g5up/outline.json'));
  assert.deepEqual(built.units.map((u: any) => [u.unit_number,u.title]),expected);
  assert.equal(built.lessons.length,32);
  const previous = new Set(pepOutline.lessons.map((l: PathLessonMeta) => l.id));
  assert.ok(built.lessons.every((l: PathLessonMeta) => !previous.has(l.id) && l.id.startsWith(id+'-u')));
  const chests = new Set(computeChestsForBook(pep.id,pepOutline.lessons).map(c=>c.id));
  assert.ok(computeChestsForBook(id,built.lessons).every(c=>!chests.has(c.id)));
  const checkAudio = (url: unknown) => {
    assert.ok(typeof url==='string' && url.startsWith('/audio/') && url.endsWith('.mp3'),`Missing MP3 ${url}`);
    assert.ok(existsSync(path.join(publicDir,url as string)),url as string);
  };
  for (const meta of built.lessons) {
    const l: Lesson=read(path.join(data,`books/${id}/lessons/${meta.id}.json`));
    for (const q of l.questions) {
      checkAudio(q.audio?.question);checkAudio(q.audio?.explanation);
      q.options.forEach((_,i)=>checkAudio(q.audio?.options?.[i]));
    }
    for (const k of ['point','core_concept','tips'] as const) checkAudio(l.knowledge?.audio?.[k]);
    l.knowledge!.common_mistakes.forEach((_,i)=>checkAudio(l.knowledge?.audio?.common_mistakes?.[i]));
  }
  for (const u of built.units.filter((u: any)=>u.examLessonId)) {
    const exam: Lesson=read(path.join(data,`books/${id}/lessons/${u.examLessonId}.json`));
    assert.equal(exam.questions.length,6);
    for (const q of exam.questions) {checkAudio(q.audio?.question);checkAudio(q.audio?.explanation);q.options.forEach((_,i)=>checkAudio(q.audio?.options?.[i]));}
  }
  const readings:BookPassages=read(path.join(data,`books/${id}/passages.json`));
  assert.equal(readings.passages.flatMap(p=>p.sentences).length,96);
  readings.passages.forEach(p=>p.sentences.forEach(s=>checkAudio(s.audio)));
  const fetcher=(async(url:string)=>new Response(readFileSync(path.join(publicDir,url),'utf8'))) as typeof fetch;
  const jump=await loadJumpData(id,4,fetcher);
  assert.ok(jump.priorLessonIds.some(l=>l.includes('-u101-')));
  assert.ok(jump.priorLessonIds.every(l=>!l.includes('-u4-')));
}
const publicIndex=process.argv.indexOf('--public');
(publicIndex<0 ? Promise.resolve() : actual(process.argv[publicIndex+1])).then(()=>console.log('PASS Jingtong: official order,96 words,32 lessons,216+36 questions,grading,independent IDs'+(publicIndex<0?'':' and built resources/audio/jump order'))).catch(e=>{console.error(e);process.exitCode=1;});
