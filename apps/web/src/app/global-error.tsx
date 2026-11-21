'use client';

import { useEffect } from 'react';

/**
 * 全局错误边界（Next.js App Router 约定）。
 *
 * 当根布局（root layout）本身就出错时，error.tsx 兜不住，只有这个文件能接住。
 * 它必须自己渲染 <html> 和 <body>。
 *
 * 这里刻意不用 Tailwind class，也不引入 Mascot 组件 —— 根布局已经崩了，
 * 依赖项目样式或组件可能再次报错，所以用内联样式保证一定能渲染出来。
 */
const MESSAGES: Record<string, string> = {
  zh: '应用启动时出了点问题。刷新一下通常就能恢复，学习记录都还在。',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error]', error);
  }, [error]);

  const hardReload = () => {
    if (typeof window !== 'undefined') window.location.href = '/';
  };

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
          background: '#FBF7EC',
          color: '#2B2B2B',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", sans-serif',
        }}
      >
        <div style={{ fontSize: 56, lineHeight: 1 }} aria-hidden="true">
          🛠️
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '20px 0 0' }}>页面没能启动</h1>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: '12px 0 0', maxWidth: 300, opacity: 0.75 }}>
          {MESSAGES.zh}
        </p>

        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 28,
            width: '100%',
            maxWidth: 256,
            padding: '14px 20px',
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
            background: '#5B6BC0',
            border: 'none',
            borderRadius: 14,
            cursor: 'pointer',
          }}
        >
          重试
        </button>

        <button
          type="button"
          onClick={hardReload}
          style={{
            marginTop: 10,
            width: '100%',
            maxWidth: 256,
            padding: '14px 20px',
            fontSize: 15,
            fontWeight: 700,
            color: '#2B2B2B',
            background: 'transparent',
            border: '1.5px solid rgba(43,43,43,.18)',
            borderRadius: 14,
            cursor: 'pointer',
          }}
        >
          返回首页
        </button>

        {error.digest ? (
          <p style={{ fontSize: 11, marginTop: 24, opacity: 0.5 }}>错误编号：{error.digest}</p>
        ) : null}
      </body>
    </html>
  );
}
