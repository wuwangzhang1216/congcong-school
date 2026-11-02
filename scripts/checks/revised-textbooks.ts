import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gradeAnswer } from '../../packages/core/src/grade';
import { computeChestsForBook } from '../../packages/core/src/chestLogic';
import { readingId, normalizeReadingMap } from '../../packages/core/src/reading';
import { loadJumpData } from '../../apps/web/src/lib/loadJumpData';
import type { Book, BookPassages, Lesson, Outline, PathLessonMeta } from '../../packages/core/src/types';

async function main() {
const root = process.argv[2] ?? 'apps/web/public';
const read = (name: string) => JSON.parse(readFileSync(name, 'utf8'));
const catalog = read('content/editions/2026/catalog.json');
const index: {books: Book[]} = read(`${root}/data/index.json`);
const current = index.books.filter(b => !b.supersededBy && b.schoolSystem !== '5-4');
const jingtong = existsSync('content/editions/jingtong/english-g5up-2026.json') ? 1 : 0;
const parallelFile = 'content/editions/five-four/catalog.json';
const parallel = existsSync(parallelFile) ? read(parallelFile).books.length : 0;
assert.equal(current.length, 44 + jingtong);
assert.equal(index.books.length, 45 + catalog.books.length + parallel + jingtong, '44 current six-three + retained legacy editions + parallel five-four');
let lessons = 0, questions = 0, readings = 0;
const asset = (url: string) => assert.ok(existsSync(path.join(root, url.split('?')[0])), `Missing asset ${url}`);
function checkLesson(lesson: Lesson, knowledgeRequired = true) {
  if (knowledgeRequired) assert.ok(lesson.knowledge, lesson.id);
  const k = lesson.knowledge;
  if (k) {
  for (const field of ['point', 'core_concept', 'key_formula', 'tips'] as const) {
    if (k[field]) { assert.ok(k.audio?.[field], `${lesson.id} ${field} missing narration`); asset(k.audio![field]!); }
  }
  for (const [i, text] of k.common_mistakes.entries()) if (text) asset(k.audio!.common_mistakes![i]!);
  }
  for (const q of lesson.questions) {
    questions++;
    assert.equal(gradeAnswer(q, ''), false);
    if (q.type === 'choice') {
      assert.equal(q.options.length, 4);
      const results = q.options.map((_, i) => gradeAnswer(q, String.fromCharCode(65+i)));
      assert.equal(results.filter(Boolean).length, 1, q.question);
      assert.equal(q.options[results.findIndex(Boolean)], q.answer, q.question);
    } else {
      assert.equal(gradeAnswer(q, q.answer), true, q.question);
      if (q.type === 'true_false') assert.equal(gradeAnswer(q, q.answer === '对' ? '错' : '对'), false);
    }
    assert.ok(q.audio?.question && q.audio.explanation, `Missing question/answer narration: ${lesson.id}/${q.id}`);
    asset(q.audio!.question!); asset(q.audio!.explanation!);
    q.options.forEach((_, i) => { assert.ok(q.audio?.options?.[i]); asset(q.audio!.options![i]!); });
  }
}
for (const plan of catalog.books) {
  const book = index.books.find(b => b.id === plan.id)!;
  const old = index.books.find(b => b.id === plan.legacyId)!;
  assert.ok(book && old, plan.id);
  assert.equal(book.supersedes, old.id); assert.equal(old.supersededBy, book.id);
  assert.equal(book.editionLabel, plan.editionLabel);
  assert.equal(current.filter(b => b.grade === plan.grade && b.semester === (plan.semester ?? 'up') && b.subject === plan.subject).length, 1);
  const outline: Outline & {lessons: PathLessonMeta[]} = read(`${root}/data/books/${book.id}/outline.json`);
  const legacy: Outline & {lessons: PathLessonMeta[]} = read(`${root}/data/books/${old.id}/outline.json`);
  assert.deepEqual(outline.units.map(u => [u.unit_number, u.title]), plan.units.map((u: any) => [u.unit_number, u.title]));
  const oldIds = new Set(legacy.lessons.map(l => l.id));
  assert.ok(outline.lessons.every(l => !oldIds.has(l.id)));
  const oldChests = new Set(computeChestsForBook(old.id, legacy.lessons).map(c => c.id));
  assert.ok(computeChestsForBook(book.id, outline.lessons).every(c => !oldChests.has(c.id)));
  const answerPositions = [0, 0, 0, 0];
  for (const unit of outline.units) {
    const metas = outline.lessons.filter(l => l.unitNumber === unit.unit_number);
    assert.deepEqual(metas.map(l => l.title), unit.knowledge_points.map(k => k.name));
    for (const meta of metas) {
      lessons++;
      const lesson: Lesson = read(`${root}/data/books/${book.id}/lessons/${meta.id}.json`);
      assert.equal(lesson.bookId, book.id); assert.equal(lesson.unitLabel, unit.label);
      assert.equal(lesson.questions.length, 6); assert.equal(lesson.knowledge?.point, meta.title);
      lesson.questions.filter(q => q.type === 'choice').forEach(q => answerPositions[q.options.indexOf(q.answer)]++);
      checkLesson(lesson);
    }
    assert.ok(unit.examLessonId);
    const exam: Lesson = read(`${root}/data/books/${book.id}/lessons/${unit.examLessonId}.json`);
    assert.equal(exam.questions.length, 6); checkLesson(exam, false);
  }
  assert.ok(answerPositions.every(count => count > 0));
  assert.ok(Math.max(...answerPositions) / answerPositions.reduce((a, b) => a + b, 0) < 0.45, `${book.id}: predictable answer position`);
  for (const meta of legacy.lessons) {
    const lesson: Lesson = read(`${root}/data/books/${old.id}/lessons/${meta.id}.json`);
    assert.equal(lesson.id, meta.id, 'legacy routes must remain loadable');
  }
  if (!plan.readings.length) { assert.ok(!book.hasPassages); continue; }
  assert.equal(book.hasPassages, true);
  const doc: BookPassages = read(`${root}/data/books/${book.id}/passages.json`);
  const oldDoc: BookPassages = read(`${root}/data/books/${old.id}/passages.json`);
  const oldReadingIds = new Set(oldDoc.passages.map(p => p.id));
  assert.deepEqual(doc.passages.map(p => [p.title, p.unitNumber, p.curriculumRole]), plan.readings.map((p: any) => [p.title, p.unit, p.role]));
  for (const [i, passage] of doc.passages.entries()) {
    readings++;
    assert.ok(!oldReadingIds.has(passage.id)); assert.equal(passage.bookId, book.id);
    assert.equal(passage.lessonNumber, plan.readings[i].lesson);
    assert.equal(passage.pdfPage, plan.readings[i].start + plan.pageOffset);
    assert.equal(passage.pageImages?.length, plan.readings[i].end-plan.readings[i].start+1);
    passage.pageImages!.forEach(asset);
    passage.sentences.forEach(sentence => { assert.ok(sentence.text && sentence.audio); asset(sentence.audio!); });
  }
  // Canonical backup normalization must retain both old and new completion keys.
  const oldKey = readingId('listen', oldDoc.passages[0].id);
  const newKey = readingId('listen', doc.passages[0].id);
  const completed = normalizeReadingMap({[oldKey]: '2026-10-23'});
  assert.equal(completed[oldKey], '2026-10-23'); assert.equal(completed[newKey], undefined);
}
const expectedLessons = catalog.books.reduce((sum: number, b: any) => sum + b.units.reduce((n: number, u: any) => n + u.points.length, 0), 0);
const expectedExams = catalog.books.reduce((sum: number, b: any) => sum + b.units.length, 0);
assert.equal(lessons, expectedLessons); assert.equal(questions, (expectedLessons + expectedExams) * 6);
assert.equal(readings, catalog.books.reduce((sum: number, b: any) => sum + b.readings.length, 0));
const fetcher = (async (url: string) => new Response(readFileSync(`${root}${url}`, 'utf8'))) as typeof fetch;
const fourth = await loadJumpData('g3up-2026', 4, fetcher);
assert.ok(fourth.priorLessonIds.some(id => id.includes('-u101-')));
assert.ok(!fourth.priorLessonIds.some(id => id.includes('-u102-')));
const practice = await loadJumpData('g3up-2026', 102, fetcher);
assert.ok(practice.priorLessonIds.some(id => id.includes('-u4-')));
assert.ok(!practice.priorLessonIds.some(id => id.includes('-u5-')));
console.log(JSON.stringify({status: 'passed', books: catalog.books.length, lessons, questions, readings, legacyRoutes: 'retained', completionIds: 'isolated', media: 'present'}));

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
