import assert from "node:assert/strict";
import {
  newReviewSession,
  parseReviewSession,
  restoreReviewSession,
  recoveryAction,
} from "../../apps/web/src/lib/reviewSession";
import type { ReviewItem } from "../../apps/web/src/lib/prepareReview";
const item: ReviewItem = {
  key: "g1up-u1-kp1:1",
  lessonId: "g1up-u1-kp1",
  lessonTitle: "练习",
  scheduled: true,
  question: {
    id: 1,
    type: "calculation",
    question: "计算",
    answer: "18",
    options: [],
    explanation: "说明",
    score: 1,
    difficulty: 1,
    knowledge_point: "练习",
  },
};
const round = newReviewSession([item], "hearts:g1up-u1-kp1");
round.answer = "18";
round.phase = "checked";
round.isCorrect = true;
round.attempts = [[item.key, true]];
const saved = parseReviewSession(JSON.stringify(round), round.context)!;
assert(saved);
assert.deepEqual(
  restoreReviewSession(saved, [item]),
  round,
  "refresh retains checked feedback and first-attempt ledger",
);
assert.equal(
  restoreReviewSession(saved, [
    { ...item, question: { ...item.question, answer: "20" } },
  ]),
  null,
  "same-ID edits cannot restore review feedback",
);
assert.equal(
  restoreReviewSession(saved, []),
  null,
  "deleted questions cannot be restored",
);
assert.equal(
  parseReviewSession(JSON.stringify(round), "due"),
  null,
  "different recovery contexts cannot reuse a round",
);
assert.equal(
  parseReviewSession(
    JSON.stringify({ ...round, pending: ["missing"] }),
    round.context,
  ),
  null,
);
const done = {
  ...round,
  pending: [],
  solved: 1,
  phase: "answering" as const,
  isCorrect: null,
  stats: { total: 1, correct: 1, xpGained: 5, graduated: 0, heartsGained: 1 },
};
assert(
  parseReviewSession(JSON.stringify(done), round.context)?.stats,
  "a finished receipt survives refresh without settling twice",
);
assert.equal(
  recoveryAction(0, false, 1),
  "retry",
  "a corrected initial mistake must have an actionable retry instead of looping back into a zero-heart gate",
);
assert.equal(
  recoveryAction(0, true, 1),
  "wait",
  "never promise another daily heart after it was claimed",
);
assert.equal(recoveryAction(1, true, 1), "resume");
console.log(
  "PASS: review drafts/feedback/receipt, content changes and recovery actions.",
);

assert.equal(
  parseReviewSession(JSON.stringify({ ...done, attempts: [] }), round.context),
  null,
  "a completion receipt requires the entire first-attempt ledger",
);
assert.equal(
  parseReviewSession(
    JSON.stringify({ ...done, stats: { ...done.stats, correct: 0 } }),
    round.context,
  ),
  null,
  "inconsistent reward receipts cannot be restored",
);

const editionId = "g2up-2026-u101-kp1";
const editionItem = { ...item, key: `${editionId}:1`, lessonId: editionId };
const editionRound = newReviewSession([editionItem], "due");
assert.deepEqual(
  parseReviewSession(JSON.stringify(editionRound), "due"), editionRound,
  "current textbook editions retain review sessions across refresh",
);

const fiveFourId = "g1up-54-qingdao-u101-kp1";
const fiveFourItem = { ...item, key: `${fiveFourId}:1`, lessonId: fiveFourId };
const mixedRound = {
  ...newReviewSession([fiveFourItem, editionItem], "due"),
  pending: [editionItem.key],
  solved: 1,
  answer: "18",
  phase: "checked" as const,
  isCorrect: true,
  attempts: [[fiveFourItem.key, true], [editionItem.key, true]] as [string, boolean][],
};
const mixedSaved = parseReviewSession(JSON.stringify(mixedRound), "due");
assert(mixedSaved, "a completed Five-Four question must not invalidate the saved round");
assert.deepEqual(restoreReviewSession(mixedSaved, [fiveFourItem, editionItem]), mixedRound,
  "refresh preserves the queue, solved count, feedback and first attempts in a mixed-edition round");
