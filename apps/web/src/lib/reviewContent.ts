import type { Lesson } from "@/types";
import type { SrsMistakeEntry } from "@cstf/core/srs";

export type LessonMap = Map<string, Lesson | null>;
export type FetchLesson = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

function validateLesson(lesson: Lesson, id: string): void {
  if (
    lesson.id !== id ||
    !Array.isArray(lesson.questions) ||
    lesson.questions.some(
      (q) =>
        !q ||
        !Number.isInteger(q.id) ||
        ![
          "choice",
          "true_false",
          "fill_blank",
          "calculation",
          "word_problem",
          "fill_blank_text",
          "word_order",
          "matching",
        ].includes(q.type) ||
        typeof q.question !== "string" ||
        typeof q.answer !== "string" ||
        !Array.isArray(q.options) ||
        q.options.some((option) => typeof option !== "string"),
    ) ||
    new Set(lesson.questions.map((q) => q.id)).size !==
      lesson.questions.length
  ) {
    throw new Error("Invalid lesson content");
  }
}

/** Historical snapshots must never drive grading after published content changes. */
export async function loadReviewLessons(
  entries: Pick<SrsMistakeEntry, "lessonId">[],
  fetchLesson: FetchLesson = fetch,
  timeoutMs = 15_000,
): Promise<LessonMap> {
  const lessons = await Promise.all(
    [...new Set(entries.map((entry) => entry.lessonId))].map(async (id) => {
      // Edition suffixes belong to the book slug. Read the lesson suffix from
      // the end so new editions can load while URLs stay within /data/books/.
      const book = /^([a-z0-9]+(?:-[a-z0-9]+)*)-u\d+-(?:kp\d+|exam)$/.exec(id)?.[1];
      if (!book) throw new Error("Invalid lesson id");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // The previously installed SW can control this first page until its update
        // activates. A new request URL also bypasses that older SW's SWR cache.
        const response = await fetchLesson(
          `/data/books/${book}/lessons/${id}.json?review=${Date.now()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 404) {
          // A missing CDN object is not proof of editorial deletion. Confirm the
          // lesson is absent from a successfully loaded current outline first.
          const outlineResponse = await fetchLesson(
            `/data/books/${book}/outline.json?review=${Date.now()}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!outlineResponse.ok)
            throw new Error("Cannot confirm removed lesson");
          const outline = await outlineResponse.json();
          if (
            !Array.isArray(outline.lessons) ||
            outline.lessons.some(
              (item: { id?: unknown }) => typeof item?.id !== "string",
            ) ||
            (outline.units != null && !Array.isArray(outline.units))
          )
            throw new Error("Invalid outline");
          if (
            outline.lessons.some((item: { id: string }) => item.id === id) ||
            outline.units?.some(
              (item: { examLessonId?: string }) => item.examLessonId === id,
            )
          )
            throw new Error("Listed lesson is temporarily unavailable");
          return [id, null] as const;
        }
        if (!response.ok)
          throw new Error(`Lesson unavailable: ${response.status}`);
        const lesson: Lesson = await response.json();
        validateLesson(lesson, id);
        if (lesson.legacyPracticeLessonId) {
          const practiceId = lesson.legacyPracticeLessonId;
          const unitPrefix = id.replace(/kp\d+$/, "kp");
          if (!/^.+-u\d+-kp\d+$/.test(practiceId) ||
              !practiceId.startsWith(unitPrefix) || practiceId === id)
            throw new Error("Invalid legacy practice id");
          const practiceResponse = await fetchLesson(
            `/data/books/${book}/lessons/${practiceId}.json?review=${Date.now()}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!practiceResponse.ok) throw new Error("Legacy practice unavailable");
          const practice: Lesson = await practiceResponse.json();
          validateLesson(practice, practiceId);
          if (practice.restoresLessonId !== id)
            throw new Error("Legacy practice does not match its source lesson");
          const questions = [...lesson.questions, ...practice.questions];
          if (new Set(questions.map(q => q.id)).size !== questions.length)
            throw new Error("Duplicate legacy question ids");
          return [id, { ...lesson, questions }] as const;
        }
        return [id, lesson] as const;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  return new Map(lessons);
}

/** Preserve dates, boxes and reward history; remove only questions confirmed absent. */
export function reconcileMistakes<T extends SrsMistakeEntry>(
  bank: T[],
  lessons: LessonMap,
): T[] {
  return bank.flatMap((entry) => {
    if (!lessons.has(entry.lessonId)) return [entry];
    const lesson = lessons.get(entry.lessonId);
    const question = lesson?.questions.find((q) => q.id === entry.question.id);
    return question ? [{ ...entry, question, lessonTitle: lesson!.title }] : [];
  });
}
