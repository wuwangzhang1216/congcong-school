"use client";

/**
 * ReviewRunnerClient —— 错题复习 runner（/review/runner/）
 *
 * 多邻国式「真实作答」复习流程：
 *   - 普通队列为今日到期错题；回心入口可补充额外巩固，额外题不推进SRS
 *   - 复用 QuestionRenderer + core gradeAnswer 真实判分，答完才亮对错与解析
 *   - 首次作答的结果驱动 SRS（store reviewMistake）；答错的题重排队尾再练
 *   - 完成页：正确数 + XP（store awardReviewXP，每答对 +5）+ 毕业庆祝
 *   - 完成整轮：首答正确达五题；可用题不足五题则整轮正确 → 补 1 颗红心
 *     （store awardReviewHeart，每天一次的账本在 store 里）
 *
 * 无红心消耗：复习是「安全区」，答错只会把题排回队尾，不扣心。
 */

import { uiMotion } from "@/lib/motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  motion,
  AnimatePresence,
  useAnimation,
  useReducedMotion,
} from "framer-motion";
import type { Question } from "@/types";
import { gradeAnswer } from "@/lib/grade";
import { prepareReview, type ReviewItem } from "@/lib/prepareReview";
import {
  newReviewSession,
  readReviewSession,
  restoreReviewSession,
  saveReviewSession,
  reviewContext,
  recoveryAction,
  type ReviewSession,
  type ReviewStats,
} from "@/lib/reviewSession";
import { dateKey } from "@cstf/core/week";
import { useProgressTicker, formatMsCountdown } from "@/lib/useProgressTicker";
import { loadReviewLessons, reconcileMistakes } from "@/lib/reviewContent";
import { answerReady } from "@/lib/questionDraft";
import {
  useProgressStore,
  REVIEW_XP_PER_CORRECT,
  REVIEW_HEART_MIN_CORRECT,
} from "@/store/progress";
import {
  QuestionRenderer,
  type QuestionPhase,
} from "@/components/question/QuestionRenderer";
import { MathText } from "@/components/MathText";
import { Mascot } from "@/components/Mascot";
import { EmptyState } from "@/components/StateMessages";
import { SoundLink } from "@/components/SoundLink";
import { MuteToggle, useSyncMute } from "@/components/MuteToggle";
import {
  Close,
  CheckCircle,
  XCircle,
  Lightning,
  Heart,
  Bookmark,
} from "@/components/icons";
import { playSfx } from "@/lib/sfx";
import { haptic } from "@/lib/haptic";

const ConfettiCanvas = dynamic(
  () =>
    import("@/components/ConfettiCanvas").then((m) => ({
      default: m.ConfettiCanvas,
    })),
  { ssr: false },
);

export function ReviewRunnerClient() {
  useSyncMute();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 断心跳转标记（?from=hearts）：完成页多给一句「红心会慢慢恢复」的安抚。
  const fromHearts = searchParams.get("from") === "hearts";
  const fallbackLessonId =
    searchParams.get("lesson") ??
    useProgressStore.getState().activeLesson?.lessonId;
  const context = reviewContext(fromHearts, fallbackLessonId);
  const snapshotRef = useRef<ReviewSession | null>(null);
  const [contentUpdated, setContentUpdated] = useState(false);
  function persist(patch: Partial<ReviewSession>) {
    if (!snapshotRef.current) return;
    snapshotRef.current = { ...snapshotRef.current, ...patch };
    saveReviewSession(snapshotRef.current);
  }
  function restart() {
    saveReviewSession(null);
    snapshotRef.current = null;
    setRetry((n) => n + 1);
  }

  const reviewMistake = useProgressStore((s) => s.reviewMistake);
  const awardReviewXP = useProgressStore((s) => s.awardReviewXP);
  const awardReviewHeart = useProgressStore((s) => s.awardReviewHeart);
  const prefersReduced = useReducedMotion();

  // ============ 队列：hydrate 后一次性快照（复习中 store 变化不打乱当前会话）============
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [retiredCount, setRetiredCount] = useState(0);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const totalRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setLoadFailed(false);
    void (async () => {
      const bank = useProgressStore.getState().mistakesBank;
      const saved = readReviewSession(context);
      let lessons = new Map<string, import("@/types").Lesson | null>();
      let restored: ReviewSession | null = null;
      if (saved) {
        lessons = await loadReviewLessons(saved.items);
        const fresh = saved.items.flatMap((item) => {
          const lesson = lessons.get(item.lessonId);
          const question = lesson?.questions.find(
            (q) => q.id === item.question.id,
          );
          return question
            ? [{ ...item, question, lessonTitle: lesson!.title }]
            : [];
        });
        restored = restoreReviewSession(saved, fresh);
      }
      let items = restored?.items;
      if (!items) {
        const prepared = await prepareReview(
          reconcileMistakes(bank, lessons),
          fromHearts,
          fallbackLessonId,
        );
        for (const [id, lesson] of prepared.lessons) lessons.set(id, lesson);
        items = prepared.items;
      }
      if (cancelled) return;
      const snapshot = restored ?? newReviewSession(items, context);
      snapshotRef.current = items.length ? snapshot : null;
      saveReviewSession(snapshotRef.current);
      setContentUpdated(!!saved && !restored);
      useProgressStore.getState().refreshMistakeContent(lessons);
      if (
        fallbackLessonId &&
        lessons.get(fallbackLessonId) === null &&
        useProgressStore.getState().activeLesson?.lessonId === fallbackLessonId
      )
        useProgressStore.getState().clearLessonSession();
      setRetiredCount(bank.length - reconcileMistakes(bank, lessons).length);
      totalRef.current = items.length;
      const byKey = new Map(items.map((item) => [item.key, item]));
      setQueue(snapshot.pending.map((key) => byKey.get(key)!));
      setAnswer(snapshot.answer);
      setPhase(snapshot.phase);
      setIsCorrect(snapshot.isCorrect);
      setSolvedCount(snapshot.solved);
      setStats(snapshot.stats);
      firstAttemptRef.current = new Map(snapshot.attempts);
      graduatedRef.current = snapshot.graduated;
      settledRef.current = !!snapshot.stats;
      setReady(true);
    })().catch(() => {
      if (cancelled) return;
      setLoadFailed(true);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [context, fromHearts, fallbackLessonId, retry]);

  // ============ 答题状态 ============
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QuestionPhase>("answering");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  // 首答记录：key → 是否答对（SRS/XP 只认首答；重练不再记账）
  const firstAttemptRef = useRef<Map<string, boolean>>(new Map());
  const graduatedRef = useRef(0);
  const settledRef = useRef(false);
  const shakeControls = useAnimation();

  const current = queue[0] ?? null;
  const questionScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase === "answering" && questionScrollRef.current) questionScrollRef.current.scrollTop = 0;
  }, [current?.key, phase, ready]);
  const total = totalRef.current;
  const progress = total > 0 ? (solvedCount / total) * 100 : 0;

  const currentGraduatedNow = useRef(false);

  function handleAnswerChange(value: string) {
    if (phase !== "answering") return;
    setAnswer(value);
    persist({ answer: value });
  }
  function handleCheck() {
    if (
      !current ||
      snapshotRef.current?.phase !== "answering" ||
      phase !== "answering" ||
      !answerReady(current.question, answer)
    )
      return;
    const ok = gradeAnswer(current.question, answer);
    setIsCorrect(ok);
    setPhase("checked");
    currentGraduatedNow.current = false;

    // 仅到期题的首答驱动SRS；额外巩固不提前升级或毕业
    if (!firstAttemptRef.current.has(current.key)) {
      firstAttemptRef.current.set(current.key, ok);
      const newlyGraduated =
        current.scheduled &&
        reviewMistake(current.lessonId, current.question.id, ok);
      if (newlyGraduated) {
        graduatedRef.current += 1;
        currentGraduatedNow.current = true;
      }
    }

    persist({
      phase: "checked",
      isCorrect: ok,
      answer,
      attempts: [...firstAttemptRef.current],
      graduated: graduatedRef.current,
    });

    if (ok) {
      haptic("light");
      playSfx("correct");
    } else {
      haptic("heavy");
      playSfx("wrong");
      if (!prefersReduced) {
        shakeControls.start({
          x: [0, -8, 8, -5, 5, 0],
          transition: { duration: 0.45 },
        });
      }
    }
  }

  function handleContinue() {
    if (!current || snapshotRef.current?.phase !== "checked") return;
    playSfx("tap");
    haptic("light");

    let nextQueue: ReviewItem[];
    let nextSolved = solvedCount;
    if (isCorrect) {
      // 答对 → 离场
      nextQueue = queue.slice(1);
      nextSolved = solvedCount + 1;
      setSolvedCount(nextSolved);
    } else {
      // 答错 → 重排队尾再练（本次会话内练到会为止）
      nextQueue = [...queue.slice(1), queue[0]];
    }
    setQueue(nextQueue);
    setAnswer("");
    setIsCorrect(null);
    setPhase("answering");

    if (nextQueue.length === 0) {
      finishSession(nextSolved);
    } else {
      persist({
        pending: nextQueue.map((item) => item.key),
        solved: nextSolved,
        answer: "",
        phase: "answering",
        isCorrect: null,
      });
    }
  }

  function finishSession(solved: number) {
    if (settledRef.current) return;
    settledRef.current = true;
    const attempts = firstAttemptRef.current;
    const correct = [...attempts.values()].filter(Boolean).length;
    // 统一记账：每首答答对 +5 XP、dailyReviews += 复习量、推进连胜
    const xpGained = awardReviewXP(correct, attempts.size);
    // 走完一整轮才结算补心；首答至少五题正确，不足五题则整轮正确。
    // 上限（不超过 MAX_HEARTS）、当天只领一次都由 store awardReviewHeart 裁决。
    const heartsGained = awardReviewHeart(correct, attempts.size);
    const result: ReviewStats = {
      total: solved,
      correct,
      xpGained,
      graduated: graduatedRef.current,
      heartsGained,
    };
    persist({
      pending: [],
      solved,
      answer: "",
      phase: "answering",
      isCorrect: null,
      stats: result,
    });
    setStats(result);
    playSfx("complete");
    haptic("success");
  }

  function handleExit() {
    playSfx("tap");
    haptic("light");
    // 中途退出：把已完成的复习量结算掉（0 对也算活动），避免「白练」
    if (!settledRef.current && firstAttemptRef.current.size > 0) {
      settledRef.current = true;
      const attempts = firstAttemptRef.current;
      const correct = [...attempts.values()].filter(Boolean).length;
      awardReviewXP(correct, attempts.size);
    }
    saveReviewSession(null);
    router.push("/review/");
  }

  // ============ 加载占位 ============
  if (!ready) {
    return (
      <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center gap-5">
        <Mascot mood="think" size={100} />
        <p className="text-ink-light">正在准备题目…</p>
        <SoundLink href="/review/" className="btn-chunky-ghost px-8">
          回错题本
        </SoundLink>
      </main>
    );
  }

  // ============ 完成页 ============
  if (loadFailed) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center px-5">
        <EmptyState
          mood="think"
          title="题目暂时没有加载好"
          desc="先重新试试，你的错题进度还在。"
          action={
            <div className="flex flex-col gap-3">
              <button
                className="btn-chunky-primary px-8"
                onClick={() => setRetry((n) => n + 1)}
              >
                重新加载
              </button>
              <SoundLink href="/review/" className="btn-chunky-ghost px-8">
                回错题本
              </SoundLink>
            </div>
          }
        />
      </main>
    );
  }
  if (stats) {
    return (
      <ReviewCompletionScreen
        stats={stats}
        fromHearts={fromHearts}
        onRestart={restart}
        returnLessonId={fromHearts ? fallbackLessonId : undefined}
      />
    );
  }

  // ============ 空队列（直接进入 / 今天没有到期错题）============
  if (!current) {
    return (
      <main className="min-h-screen bg-bg-soft flex items-center justify-center px-5">
        <EmptyState
          mood="cheer"
          title={
            retiredCount
              ? "这些旧题已经更新啦"
              : fromHearts
                ? "先选一节小课来巩固"
                : "今天没有要复习的错题！"
          }
          desc={
            fromHearts
              ? "这里暂时没有可用题目。可以先听读课文，红心会慢慢恢复。"
              : retiredCount
                ? "已移除题目已从错题本更新，可以回课程练习新题。"
                : "错题都安排好了，明天再来看看吧～"
          }
          action={
            <SoundLink
              href={fromHearts ? "/" : "/review/"}
              hapticIntensity="medium"
              className="btn-chunky-primary px-8"
            >
              {fromHearts ? "返回学习选课" : "回错题本"}
            </SoundLink>
          }
        />
      </main>
    );
  }

  // ============ 答题中 ============
  return (
    <motion.main
      animate={shakeControls}
      className="lesson-screen bg-bg-soft flex flex-col"
    >
      {/* 顶栏：退出 + 进度条 + 静音 */}
      <div className="lesson-toolbar bg-white border-b border-bg-softer">
        <div className="max-w-md lg:max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={handleExit}
            className="ui-icon-button -ml-1 text-ink-light hover:text-ink hover:bg-bg-softer transition-colors shrink-0"
            aria-label="退出复习"
          >
            <Close className="w-5 h-5" />
          </button>
          <div className="flex-1 h-3 bg-bg-softer rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-danger rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <div className="text-xs font-extrabold text-ink-softer tabular-nums shrink-0">
            {solvedCount}/{total}
          </div>
          <MuteToggle />
        </div>
      </div>

      <div ref={questionScrollRef} className="lesson-content">
      {contentUpdated && (
        <p
          role="status"
          className="max-w-md mx-auto px-5 pt-3 text-sm text-ink-light"
        >
          题目内容已更新，本轮已重新准备，不会沿用旧答案和判分。
        </p>
      )}
      {/* 来源课程胶囊 */}
      <div className="max-w-md lg:max-w-2xl mx-auto w-full px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-danger/10 text-danger text-[11px] font-extrabold">
          <Bookmark className="w-3 h-3" />
          {fromHearts ? "巩固练习" : "错题复习"} · {current.lessonTitle}
        </span>
      </div>

      {/* 题目区 */}
      <div className="lesson-body flex flex-col items-center justify-start">
        <div className="w-full max-w-md lg:max-w-2xl">
          {/* Mount the next question immediately. Nested option animations can
              keep an exiting question mounted and block a waiting transition. */}
          <motion.div
            key={`${current.key}-${solvedCount}-${queue.length}`}
            initial={prefersReduced ? false : { x: 12, y: 4, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={uiMotion.enter}
          >
            <QuestionRenderer
              question={current.question}
              answer={answer}
              phase={phase}
              isCorrect={isCorrect}
              onChange={handleAnswerChange}
            />
          </motion.div>
        </div>
      </div>

      </div>
      {/* a11y：实时播报判分结果 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {phase === "checked" &&
          isCorrect === true &&
          `回答正确。${current.question.explanation ?? ""}`}
        {phase === "checked" &&
          isCorrect === false &&
          `回答错误。正确答案是：${current.question.answer}。${current.question.explanation ?? ""}`}
      </div>

      {/* 底部：检查按钮（答题中） */}
      {phase === "answering" && (
        <div className="lesson-actions bg-white border-t-2 border-bg-softer">
          <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-4">
            <button
              onClick={handleCheck}
              disabled={!answerReady(current.question, answer)}
              className={
                answerReady(current.question, answer)
                  ? "w-full btn-chunky-primary"
                  : "w-full btn-chunky-disabled"
              }
            >
              检查
            </button>
          </div>
        </div>
      )}

      {/* 判分后反馈：对错 + 正确答案（答错时）+ 解析（MathText） */}
      {phase === "checked" && (
        <ReviewFeedbackPanel
          isCorrect={isCorrect ?? false}
          correctAnswer={current.question.answer}
          explanation={current.question.explanation}
          graduatedNow={currentGraduatedNow.current}
          onContinue={handleContinue}
        />
      )}
    </motion.main>
  );
}

function ReviewFeedbackPanel({
  isCorrect,
  correctAnswer,
  explanation,
  graduatedNow,
  onContinue,
}: {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  graduatedNow: boolean;
  onContinue: () => void;
}) {
  const bg = isCorrect
    ? "bg-primary/10 border-primary"
    : "bg-danger/10 border-danger";
  const titleColor = isCorrect ? "text-primary-dark" : "text-danger-dark";
  const btnCls = isCorrect ? "btn-chunky-primary" : "btn-chunky-danger";

  // z-50：必须压过移动端固定底栏（z-40），否则「继续」按钮会被盖住点不到
  return (
    <motion.div
      initial={{ y: 110, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      data-result={isCorrect ? "correct" : "wrong"}
      className={`lesson-feedback fixed bottom-0 left-0 right-0 z-50 border-t-2 ${bg}`}
      style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.06)" }}
    >
      <div className="max-w-md lg:max-w-2xl mx-auto px-5 py-5">
        <div
          className={`flex items-center gap-3 mb-2 font-extrabold text-2xl ${titleColor}`}
        >
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              damping: 12,
              stiffness: 260,
              delay: 0.05,
            }}
            className="inline-flex"
          >
            {isCorrect ? (
              <CheckCircle className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </motion.span>
          <span>{isCorrect ? "答对啦！" : "先看看正确答案"}</span>
          {graduatedNow && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 10, delay: 0.25 }}
              className="ml-auto text-sm font-extrabold text-primary-dark bg-primary/15 rounded-full px-2.5 py-1"
            >
              这题毕业了！🎓
            </motion.span>
          )}
        </div>

        {!isCorrect && (
          <div className="flex items-start gap-2 text-sm mb-2">
            <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="text-ink-light shrink-0">正确答案：</span>
            <span className="font-extrabold text-primary-dark">
              <MathText text={correctAnswer} />
            </span>
          </div>
        )}

        <div className="text-ink text-base leading-relaxed mb-4">
          <MathText text={explanation} />
        </div>

        <button onClick={onContinue} className={`w-full ${btnCls}`}>
          {isCorrect ? "继续" : "记住了，待会再练"}
        </button>
      </div>
    </motion.div>
  );
}

function ReviewCompletionScreen({
  stats,
  fromHearts,
  onRestart,
  returnLessonId,
}: {
  stats: ReviewStats;
  fromHearts: boolean;
  onRestart: () => void;
  returnLessonId?: string;
}) {
  const activeLesson = useProgressStore((s) => s.activeLesson);
  const hearts = useProgressStore((s) => s.hearts);
  const claimed = useProgressStore((s) => s.lastReviewHeartDate);
  const nextHeartAt = useProgressStore((s) => s.nextHeartAt);
  const now = useProgressTicker();
  const action = recoveryAction(
    hearts,
    claimed === dateKey(new Date(now)),
    stats.total,
  );
  const resumeId = activeLesson?.lessonId ?? returnLessonId;
  const resumeHref = resumeId
    ? `/lesson/${resumeId.split("-u")[0]}/${resumeId}/`
    : "/";
  useEffect(() => {
    playSfx("complete");
  }, []);

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-5 relative overflow-hidden">
      <ConfettiCanvas active />
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 16, stiffness: 220 }}
        className="text-center relative z-10 w-full max-w-sm"
      >
        <Mascot mood="cheer" size={140} reactTo="levelup" reactKey={1} />
        <h1 className="text-4xl font-extrabold text-primary mt-4">复习完成!</h1>
        <p className="text-ink-light mt-2">今天又巩固了一步，继续加油～</p>

        {/* 🎓 毕业庆祝 */}
        <AnimatePresence>
          {stats.graduated > 0 && (
            <motion.div
              initial={{ scale: 0, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: 0.5, type: "spring", damping: 12 }}
              className="inline-flex items-center gap-1.5 min-h-8 px-4 mt-4 rounded-full font-extrabold text-sm bg-primary/10 text-primary-dark border border-primary/30"
            >
              <span>{stats.graduated} 道题毕业了！🎓</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <div
            className="bg-white rounded-2xl p-4 border-2 border-bg-softer text-center"
            style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold">
              一次就对
            </div>
            <div className="text-xl font-extrabold text-primary tabular-nums mt-1">
              {stats.correct}/{stats.total}
            </div>
          </div>
          <div
            className="bg-white rounded-2xl p-4 border-2 border-bg-softer text-center"
            style={{ boxShadow: "0 4px 0 0 var(--shadow-card-color)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-softer font-extrabold">
              经验值
            </div>
            <div className="text-xl font-extrabold text-secondary flex items-center justify-center gap-1 mt-1 tabular-nums">
              <Lightning className="w-4 h-4" />+{stats.xpGained}
            </div>
          </div>
        </div>
        {stats.correct > 0 && (
          <div className="mt-2 text-[11px] text-ink-softer">
            每答对一题 +{REVIEW_XP_PER_CORRECT} 经验
          </div>
        )}

        {/* ❤️ 复习补心（parity-5）：答对够多，红心补回来 */}
        <AnimatePresence>
          {stats.heartsGained > 0 && (
            <motion.div
              initial={{ scale: 0, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ delay: 0.35, type: "spring", damping: 12 }}
              className="mt-4 inline-flex items-center gap-1.5 min-h-9 px-4 py-2 rounded-full font-extrabold text-base bg-danger/10 text-danger border border-danger/30"
            >
              <Heart className="w-4 h-4" />
              <span className="tabular-nums">+{stats.heartsGained}</span>
              <span className="text-sm">红心补回来啦！</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 断心跳转而来：没拿到补心时给一句安抚 + 告诉孩子怎么才能拿到 */}
        {fromHearts && hearts === 0 && (
          <div className="mt-5 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-danger/10 border-2 border-danger/30 text-danger text-sm font-extrabold">
            <Heart className="w-4 h-4" />
            <span>
              {action === "retry"
                ? `已经把题改对啦。再练一轮，首答正确 ${Math.min(REVIEW_HEART_MIN_CORRECT, stats.total)} 题可回心。`
                : "今天的复习回心已经领取，先让眼睛休息一下。"}
              {nextHeartAt
                ? `下一颗红心还需 ${formatMsCountdown(Math.max(0, nextHeartAt - now))}。`
                : "红心会慢慢恢复。"}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-8">
          {fromHearts && action === "retry" ? (
            <button onClick={onRestart} className="btn-chunky-primary w-full">
              再练一轮回红心
            </button>
          ) : (
            <SoundLink
              href={resumeHref}
              onClick={() => saveReviewSession(null)}
              hapticIntensity="medium"
              className="btn-chunky-primary w-full"
            >
              {fromHearts && action === "wait"
                ? "返回课程查看红心恢复"
                : activeLesson
                  ? "继续上次课程"
                  : returnLessonId
                    ? "返回这节课程"
                    : "继续学习"}
            </SoundLink>
          )}
          {fromHearts && action === "wait" && (
            <SoundLink
              href="/"
              onClick={() => saveReviewSession(null)}
              className="btn-chunky-secondary w-full"
            >
              先去选课或听读
            </SoundLink>
          )}
          <SoundLink
            href="/review/"
            onClick={() => saveReviewSession(null)}
            hapticIntensity="light"
            className="btn-chunky-ghost w-full"
          >
            回错题本
          </SoundLink>
        </div>
      </motion.div>
    </main>
  );
}
