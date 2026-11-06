import { learnerSessionStorage } from "./learnerProfiles";
import { lessonContentKey } from "@cstf/core/content";
import type { ReviewItem } from "./prepareReview";
import { reviewLessonBookId } from "./reviewContent";
export interface ReviewStats {
  total: number;
  correct: number;
  xpGained: number;
  graduated: number;
  heartsGained: number;
}
export interface ReviewSession {
  version: 1;
  context: string;
  items: ReviewItem[];
  pending: string[];
  answer: string;
  phase: "answering" | "checked";
  isCorrect: boolean | null;
  attempts: [string, boolean][];
  solved: number;
  graduated: number;
  stats: ReviewStats | null;
}
const STORAGE_KEY = "cstf-review-session-v1";
export function reviewContext(fromHearts: boolean, lessonId?: string) {
  return fromHearts ? `hearts:${lessonId ?? ""}` : "due";
}
export function newReviewSession(
  items: ReviewItem[],
  context: string,
): ReviewSession {
  return {
    version: 1,
    context,
    items,
    pending: items.map((item) => item.key),
    answer: "",
    phase: "answering",
    isCorrect: null,
    attempts: [],
    solved: 0,
    graduated: 0,
    stats: null,
  };
}
export function parseReviewSession(
  raw: string | null,
  context: string,
): ReviewSession | null {
  try {
    const s = JSON.parse(raw ?? "null") as ReviewSession;
    if (
      !s ||
      s.version !== 1 ||
      s.context !== context ||
      !Array.isArray(s.items) ||
      !s.items.length ||
      s.items.length > 10000 ||
      !Array.isArray(s.pending) ||
      !Array.isArray(s.attempts) ||
      typeof s.answer !== "string" ||
      !["answering", "checked"].includes(s.phase)
    )
      return null;
    if (
      s.items.some(
        (item) =>
          !item ||
          typeof item.lessonTitle !== "string" ||
          typeof item.scheduled !== "boolean" ||
          !Number.isInteger(item.question?.id) ||
          !reviewLessonBookId(item.lessonId) ||
          item.key !== `${item.lessonId}:${item.question.id}`,
      )
    )
      return null;
    const keys = new Set(s.items.map((item) => item.key));
    if (
      keys.size !== s.items.length ||
      s.pending.some((key) => !keys.has(key)) ||
      new Set(s.pending).size !== s.pending.length ||
      s.attempts.some(
        (pair) =>
          !Array.isArray(pair) ||
          !keys.has(pair[0]) ||
          typeof pair[1] !== "boolean",
      ) ||
      new Set(s.attempts.map((pair) => pair[0])).size !== s.attempts.length
    )
      return null;
    if (
      !Number.isInteger(s.solved) ||
      s.solved !== s.items.length - s.pending.length ||
      !Number.isInteger(s.graduated) ||
      s.graduated < 0 ||
      s.graduated > s.items.length
    )
      return null;
    const attempted = new Set(s.attempts.map(([key]) => key));
    if (
      s.items.some(
        (item) => !s.pending.includes(item.key) && !attempted.has(item.key),
      )
    )
      return null;
    if (s.phase === "answering" && s.isCorrect !== null) return null;
    if (
      s.phase === "checked" &&
      (typeof s.isCorrect !== "boolean" ||
        !s.pending.length ||
        !s.attempts.some(([key]) => key === s.pending[0]))
    )
      return null;
    if (
      s.stats &&
      (s.pending.length > 0 ||
        !["total", "correct", "xpGained", "graduated", "heartsGained"].every(
          (key) =>
            Number.isInteger(s.stats![key as keyof ReviewStats]) &&
            s.stats![key as keyof ReviewStats] >= 0,
        ) ||
        s.stats.total !== s.items.length ||
        s.attempts.length !== s.items.length ||
        s.stats.correct !==
          s.attempts.filter(([, correct]) => correct).length ||
        s.stats.heartsGained > 1 ||
        s.stats.graduated !== s.graduated ||
        s.stats.correct > s.stats.total ||
        s.stats.graduated > s.stats.total)
    )
      return null;
    if (!s.stats && !s.pending.length) return null;
    return s;
  } catch {
    return null;
  }
}
/** Recheck current server content before accepting any saved answer or feedback. */
export function restoreReviewSession(
  saved: ReviewSession,
  items: ReviewItem[],
): ReviewSession | null {
  if (items.length !== saved.items.length) return null;
  const key = (item: ReviewItem) =>
    lessonContentKey({ knowledge: null, questions: [item.question] });
  const fresh = new Map(items.map((item) => [item.key, key(item)]));
  if (saved.items.some((old) => fresh.get(old.key) !== key(old))) return null;
  return { ...saved, items };
}
export function readReviewSession(context: string): ReviewSession | null {
  try {
    return parseReviewSession(learnerSessionStorage.getItem(STORAGE_KEY), context);
  } catch {
    return null;
  }
}
export function saveReviewSession(session: ReviewSession | null) {
  try {
    if (session) learnerSessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else learnerSessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Private/storage-disabled browsers still allow the current round. */
  }
}
export function recoveryAction(
  hearts: number,
  claimedToday: boolean,
  available: number,
): "resume" | "retry" | "wait" {
  return hearts > 0
    ? "resume"
    : !claimedToday && available > 0
      ? "retry"
      : "wait";
}
