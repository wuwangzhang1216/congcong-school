import type { Metadata, Viewport } from "next";
import { LEARNER_BOOT_SCRIPT } from "@/lib/learnerProfiles";
import { Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toast";
import { DailyRewardWatcher } from "@/components/DailyRewardWatcher";
import { AchievementWatcher } from "@/components/AchievementWatcher";
import { IntroAudioUnlock } from "@/components/IntroAudioUnlock";
import { LeagueWatcher } from "@/components/LeagueWatcher";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "聪聪学堂",
  description: "全科免费，人人可学的小学AI学习平台",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "聪聪学堂",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#58CC02" },
    { media: "(prefers-color-scheme: dark)", color: "#131F24" },
  ],
};

/**
 * 首屏内联脚本：水合前读 localStorage，提前把 .theme-dark 挂到 <html>，
 * 防止深色用户看到一帧白底闪屏。逻辑与 ThemeProvider 保持一致：
 *   装备暗色美妆主题 强制暗；否则看三态偏好（dark / system+系统深色）。
 * 顺带注册 Service Worker（壳层预缓存 + 课程 JSON/音频 SWR）。
 */
const bootScript = `
(function () {
  ${LEARNER_BOOT_SCRIPT}
  try {
    var DARK_THEMES = { theme_midnight: "#0F1419", theme_obsidian: "#08090C" };
    var equipped = "";
    try {
      var raw = localStorage.getItem(learnerKey("csf-progress-v1"));
      if (raw) equipped = (JSON.parse(raw).state || {}).equippedTheme || "";
    } catch (e) {}
    var mode = localStorage.getItem(learnerKey("csf-theme-mode"));
    var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cosmeticDark = Object.prototype.hasOwnProperty.call(DARK_THEMES, equipped);
    var dark = cosmeticDark || mode === "dark" || (mode !== "light" && sysDark);
    if (dark) {
      var root = document.documentElement;
      root.classList.add("theme-dark");
      root.style.colorScheme = "dark";
      root.style.backgroundColor = cosmeticDark ? DARK_THEMES[equipped] : "#131F24";
    }
  } catch (e) {}
  if ("serviceWorker" in navigator && window.location.hostname !== "cstf.invalid" && ${process.env.NODE_ENV === "production"}) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={nunito.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      {/* 底部导航的高度补偿由 BottomNav 自带的占位条负责（web-lesson-15）：
          课程 / 阅读器等沉浸页导航隐藏时不再留 64px 死空隙 */}
      <body className="min-h-screen bg-bg">
        <ThemeProvider>
          <ToastProvider>
            <DailyRewardWatcher />
            <AchievementWatcher />
            <LeagueWatcher />
            <IntroAudioUnlock />
            {children}
            <BottomNav />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
