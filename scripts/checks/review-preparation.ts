import assert from "node:assert/strict";
import { prepareReview } from "../../apps/web/src/lib/prepareReview";
import type { SrsMistakeEntry } from "../../packages/core/src/srs";
const question = {
  id: 1,
  type: "true_false" as const,
  question: "题目",
  answer: "对",
  options: [],
  explanation: "说明",
  score: 1,
  difficulty: 1,
  knowledge_point: "练习",
};
const due: SrsMistakeEntry = {
  lessonId: "g1up-u1-kp1",
  question,
  box: 1,
  addedAt: "2020-01-01",
  nextReviewDate: "2020-01-01",
};
async function main() {
  const publishedPaths = [
    ["g1up", "g1up-u1-kp2"],
    ["g1up-54-qingdao", "g1up-54-qingdao-u101-kp1"],
    ["english-g3up-54-luke", "english-g3up-54-luke-u1-exam"],
    ["english-g5up-jingtong-2026", "english-g5up-jingtong-2026-u1-kp1"],
  ];
  const published = new Map(publishedPaths.map(([book, id]) => [
    `/data/books/${book}/lessons/${id}.json`,
    { id, title: "当前练习", questions: [question] },
  ]));
  const mixedBank = publishedPaths.map(([, lessonId]) => ({
    ...due,
    lessonId,
    question: { ...question, question: "旧题面" },
  }));
  const mixed = await prepareReview(mixedBank, false, undefined, async url => {
    const lesson = published.get(url.split("?")[0]);
    return lesson ? Response.json(lesson) : new Response(null, { status: 404 });
  });
  assert.deepEqual(mixed.items.map(item => item.lessonId), mixedBank.map(entry => entry.lessonId));
  assert(mixed.items.every(item => item.scheduled && item.question.question === question.question),
    "mixed editions must load their published questions in the same scheduled round");
  assert.equal(mixed.retiredCount, 0);

  const bank = [
    ...Array.from({ length: 5 }, (_, i) => ({
      ...due,
      question: { ...question, id: i + 1 },
    })),
    { ...due, lessonId: "g1up-u1-kp2", nextReviewDate: "2999-01-01" },
  ];
  const load = async (url: string) =>
    new Response(
      JSON.stringify({
        id: url.includes("kp2") ? "g1up-u1-kp2" : "g1up-u1-kp1",
        title: "当前练习",
        questions: url.includes("kp2") ? [question] : [],
      }),
    );
  const result = await prepareReview(bank, true, undefined, load);
  assert.equal(
    result.items.length,
    1,
    "retired due questions must not conceal available future practice",
  );
  assert.equal(result.items[0].scheduled, false);
  const fallback = await prepareReview([], true, "g1up-u1-kp2", load);
  assert.equal(
    fallback.items.length,
    1,
    "zero-heart course must offer fresh source practice even with an empty bank",
  );
  assert.equal(
    fallback.items[0].scheduled,
    false,
    "course fallback does not advance or create SRS entries",
  );
  console.log("PASS: mixed-edition review, deleted-question refill and empty-bank source practice.");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
