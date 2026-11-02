/** Verify real generated five-four resources, grading and isolated progress keys. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gradeAnswer } from '../../packages/core/src/grade';
import { computeChestsForBook } from '../../packages/core/src/chestLogic';
import { readingId } from '../../packages/core/src/reading';
import type { Book, BookPassages, Lesson, Outline, PathLessonMeta } from '../../packages/core/src/types';

const root = process.argv[2] ?? 'apps/web/public';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const catalog = read('content/editions/five-four/catalog.json');
const books: Book[] = read(`${root}/data/index.json`).books;
const parallel = books.filter(b => b.schoolSystem === '5-4');
assert.equal(parallel.length, 26);
assert.deepEqual(parallel.map(b => b.id).sort(), catalog.books.map((b: any) => b.id).sort());
assert.equal(books.filter(b => !b.supersededBy && b.schoolSystem !== '5-4').length, 44 + (existsSync('content/editions/jingtong/english-g5up-2026.json') ? 1 : 0));
const legacyIds = new Set(books.filter(b => b.schoolSystem !== '5-4').map(b => b.id));
let lessons = 0, questions = 0, readings = 0;
const audio = (value: string | undefined) => {
  assert.ok(value?.startsWith('/audio/') && value.endsWith('.mp3'), `Missing MP3: ${value}`);
  assert.ok(existsSync(path.join(root, value!)), value);
};
const studentProse = (value: string) => {
  assert.ok(!/PDF|OCR|物理页|本稿|初稿|原页|readings只保留|不作为主阅读提取/.test(value),
    `Editorial review notes leaked into student text: ${value}`);
};
for (const plan of catalog.books) {
  const book = parallel.find(b => b.id === plan.id)!;
  assert.ok(book.grade >= 1 && book.grade <= 5);
  assert.equal(book.publisherLabel, plan.publisherLabel);
  assert.equal(book.sourceEdition, plan.sourceEdition);
  assert.equal(book.sourcePrinting, plan.sourcePrinting);
  assert.equal(book.supersedes, undefined);
  assert.equal(book.supersededBy, undefined);
  assert.ok(!legacyIds.has(book.id));
  assert.ok(book.fullName.includes(plan.publisherLabel) && book.fullName.includes('五四制'));
  // Existing grade fallbacks must retain their original school system.
  assert.notEqual(books.find(b => b.grade === book.grade && b.subject === book.subject && b.semester === book.semester && !b.supersededBy)?.schoolSystem, '5-4');
  const outline: Outline & {lessons: PathLessonMeta[]} = read(`${root}/data/books/${book.id}/outline.json`);
  assert.equal(outline.schoolSystem, '5-4');
  assert.deepEqual(outline.units.map(u => [u.unit_number,u.title]), plan.units.map((u: any) => [u.appUnitNumber ?? u.number,u.title]));
  assert.equal(outline.lessons.length, book.lessonsCount);
  const baseBook = book.id.split('-54-')[0];
  const base: Outline & {lessons: PathLessonMeta[]} = read(`${root}/data/books/${baseBook}/outline.json`);
  const oldLessons = new Set(base.lessons.map(l => l.id));
  assert.ok(outline.lessons.every(l => !oldLessons.has(l.id)));
  const oldChests = new Set(computeChestsForBook(baseBook,base.lessons).map(c => c.id));
  assert.ok(computeChestsForBook(book.id,outline.lessons).every(c => !oldChests.has(c.id)));
  for (const u of outline.units) {
    const expected = plan.units.find((p: any) => (p.appUnitNumber ?? p.number) === u.unit_number);
    const metas = outline.lessons.filter(l => l.unitNumber === u.unit_number);
    assert.deepEqual(metas.map(l => l.title), expected.points.map((p: any) => p.name));
    assert.ok(u.examLessonId);
    for (const meta of [...metas,{id:u.examLessonId!}]) {
      const lesson: Lesson = read(`${root}/data/books/${book.id}/lessons/${meta.id}.json`);
      assert.equal(lesson.bookId,book.id); assert.equal(lesson.questions.length,6);
      assert.equal(new Set(lesson.questions.map(q => q.id)).size,6);
      if (!meta.id.endsWith('-exam')) {
        lessons++;
        const k = lesson.knowledge!; assert.equal(k.point,lesson.title);
        [k.core_concept,k.key_formula,k.tips,...k.common_mistakes].forEach(studentProse);
        for (const field of ['point','core_concept','key_formula','tips'] as const) if(k[field]) audio(k.audio?.[field]);
        k.common_mistakes.forEach((_,i) => audio(k.audio?.common_mistakes?.[i]));
      }
      for(const q of lesson.questions) {
        questions++;
        studentProse(q.explanation);
        assert.equal(gradeAnswer(q,''),false);
        if(q.type === 'choice') {
          assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);
          const results = q.options.map((_,i)=>gradeAnswer(q,String.fromCharCode(65+i)));
          assert.equal(results.filter(Boolean).length,1,q.question);
          assert.equal(q.options[results.findIndex(Boolean)],q.answer,q.question);
        } else {
          assert.equal(gradeAnswer(q,q.answer),true,q.question);
          if(q.type === 'true_false') assert.equal(gradeAnswer(q,q.answer === '对' ? '错':'对'),false,q.question);
        }
        audio(q.audio?.question);audio(q.audio?.explanation);q.options.forEach((_,i)=>audio(q.audio?.options?.[i]));
      }
    }
  }
  if(book.subject === 'english') {
    assert.equal(book.hasPassages,true);
    const doc: BookPassages = read(`${root}/data/books/${book.id}/passages.json`);
    assert.ok(doc.passages.length);
    const prior: BookPassages = read(`${root}/data/books/${baseBook}/passages.json`);
    const priorKeys = new Set(prior.passages.map(p => readingId('listen',p.id)));
    for(const passage of doc.passages) {
      readings++;assert.equal(passage.bookId,book.id);
      assert.ok(!priorKeys.has(readingId('listen',passage.id)));
      assert.ok(passage.pageImages?.length);
      passage.pageImages!.forEach(url=>assert.ok(existsSync(path.join(root,url))));
      passage.sentences.forEach(s=>audio(s.audio));
    }
  }
}
// A model-reviewed draft had a wrong total despite correct intermediate prices.
// Keep an independently solved regression, including the replacement narration.
const fixedLesson: Lesson = read(`${root}/data/books/g3up-54-qingdao/lessons/g3up-54-qingdao-u104-kp17.json`);
const fixedPrice = fixedLesson.questions.find(q => q.id === 1040098)!;
assert.equal(fixedPrice.answer, '1680');
assert.equal(gradeAnswer(fixedPrice, '1680'), true);
assert.equal(gradeAnswer(fixedPrice, '1440'), false);
const correction = read('content/editions/five-four/source-corrections.json').corrections.find((r: any) => r.questionId === 1040098);
assert.equal(correction.status, 'corrected_content_and_replacement_edge_aac_verified');
assert.equal(fixedPrice.audio?.explanation, correction.replacementAudio[0].url);
// Three face pairs: 2 × (45 + 18 + 10) is 146, rather than the draft's 158.
const surfaceLesson: Lesson = read(`${root}/data/books/g5up-54-qingdao/lessons/g5up-54-qingdao-u3-kp15.json`);
const surfaceArea = surfaceLesson.questions.find(q => q.id === 30087)!;
assert.equal(surfaceArea.answer, '146');
assert.equal(gradeAnswer(surfaceArea, '146'), true);
assert.equal(gradeAnswer(surfaceArea, '158'), false);
const surfaceCorrection = read('content/editions/five-four/source-corrections.json').corrections.find((r: any) => r.questionId === 30087 && r.bookId === 'g5up-54-qingdao');
assert.equal(surfaceCorrection.status, 'corrected_content_and_replacement_edge_aac_verified');
assert.equal(surfaceArea.audio?.explanation, surfaceCorrection.replacementAudio[0].url);
console.log(`PASS five-four textbooks: 26 independent books, ${lessons} lessons, ${questions} questions with actual grading, ${readings} source readings, MP3 coverage and unchanged six-three fallbacks.`);
