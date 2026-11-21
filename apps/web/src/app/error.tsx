'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Mascot } from '@/components/Mascot';

/**
 * 路由级错误边界（Next.js App Router 约定）。
 *
 * 没有这个文件时，页面内任何一处渲染抛异常都会让整个应用变成白屏，
 * 用户既看不到提示也点不了任何按钮，只能杀掉应用重进。
 *
 * 这里给出明确的说明和两条出路：重试当前页 / 返回学习页面。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 保留错误信息便于排查（生产环境不会展示堆栈给用户）
    console.error('[app error]', error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg-soft flex flex-col items-center justify-center px-6 py-12 text-center">
      <Mascot size={128} mood="think" animate={false} />
      <h1 className="text-2xl font-extrabold text-ink mt-6">页面出了点问题</h1>
      <p className="text-sm text-ink-light leading-relaxed mt-3 max-w-xs">
        刚才那一步没能完成。可以先重试一次，如果还是不行就回学习页面。
        你的学习记录都保存着，不会丢。
      </p>
      <div className="flex flex-col gap-3 mt-7 w-full max-w-[256px]">
        <button type="button" onClick={reset} className="btn-chunky-primary w-full">
          重试
        </button>
        <Link href="/" className="btn-chunky-ghost w-full">
          返回学习页面
        </Link>
      </div>
      {error.digest ? (
        <p className="text-xs text-ink-light mt-6 opacity-60">错误编号：{error.digest}</p>
      ) : null}
    </main>
  );
}
