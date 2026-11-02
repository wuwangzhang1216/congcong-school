![聪聪学堂 · 学习，从好奇心开始。小学全科，免费开源。](docs/banner.svg)

**在线体验：[聪聪学堂](https://d3nmsqi4n72idj.cloudfront.net/)** · 支持电脑和手机浏览器，无需安装。

<details>
<summary>版本与资源说明</summary>

> **当前版本 v1.8.3**：新增人教版（精通）五年级上册（2026秋版），与 PEP 并列，保留原有教材和成绩。新增6个单元、2节复习、96条词汇、32节小课、216道练习和36道挑战题；词汇、题目与讲解音频齐全，新增847条语音由Edge TTS生成，另复用197条既有音频。听读覆盖单元词汇，不包含全册课文、歌曲或原页点读。[来源与范围](docs/issue-62-jingtong-2026.md)。继承长数字输入、资源增量更新和续学计时修复。#12的教师、儿童与真机验收仍待完成。

</details>

> **一个免费、开源、纯公益的小学全科学习平台**
>
> 我们相信：**每一个中国孩子，无论身处北上广深，还是大山深处的乡村小学，都应该拥有一样好的学习资源。**
>
> 让孩子在玩中学，让 AI 方便你我他。 ❤️

---

## 🌱 项目愿景

中国的教育资源分布不均是一个长期存在的问题。一线城市的孩子可以购买数百元一套的教辅、上价格高昂的补习班；而偏远地区的孩子，往往连一本配套练习册都难以获得。

**ChinaStudyFree** 希望借助 AI 的力量，改变这件事：

- 📚 **覆盖小学全科**：语文、数学、英语、科学
- 🆓 **免费使用**：不卖课、不做广告；Web 学习记录保存在当前浏览器
- 🤖 **AI 生成题目**：基于教材知识体系生成单元小测与知识讲解，持续接受教师复核
- 🔊 **全站语音**：题目、选项、知识讲解均配有 TTS 语音朗读
- 📖 **课文听读**：语文/英语课文逐句跟读，配合课本原页展示
- 📚 **课外故事**：AI 生成 284 篇分级读物 + 阅读理解题 + 配图，巩固课内知识
- 🎮 **在玩中学**：题目形式生动、即时反馈，让孩子在闯关和互动中建立对知识的兴趣
- 🌏 **服务每一个孩子**：从一年级到六年级，只要有一台能上网的设备，就能用

---

## 产品一览

![聪聪与苹果、书本的品牌主视觉](docs/visuals/hero.png)

### 动手练习，即时反馈

![iPhone 展示互动点数与答题反馈](docs/visuals/feature-learning.png)

通过互动点数和多种题型理解知识，答题后查看解析，随时继续未完成的课程。

### 课本原页，逐句听读

![平板与 iPhone 展示课本原页、全文朗读和跟读](docs/visuals/feature-reading.png)

对照课本原页听读，支持全文朗读和跟读练习。

### 故事阅读与聪聪衣橱

![笔记本和平板展示故事阅读、阅读理解与聪聪衣橱](docs/visuals/feature-explore.png)

从分级故事到阅读理解，再用学习获得的宝石为聪聪解锁装扮。

**[海报与截图画廊](docs/web-showcase.html)**（下载仓库后本地打开） · [原尺寸 PNG](docs/visuals) · [素材与重制说明](docs/showcase/README.md)

<details>
<summary>查看 Web 界面截图</summary>

### Web · 从第一步开始

<table width="100%">
  <tr>
    <td align="center"><img src="docs/screenshots/web/01-onboarding.jpg" width="220" alt="手机端年级选择，继续按钮完整可见" /><br/><b>找到自己的起点</b><br/>选择年级，开始探索</td>
    <td align="center"><img src="docs/screenshots/web/04-counting.jpg" width="220" alt="点击三个苹果，完成互动点数" /><br/><b>亲手数一数</b><br/>先动手，再理解</td>
    <td align="center"><img src="docs/screenshots/web/05-feedback.jpg" width="220" alt="答对后显示 10 XP 与具体解析" /><br/><b>看懂每一次反馈</b><br/>知道答案，也知道为什么</td>
  </tr>
</table>

### Web · 在更大的屏幕上，展开好奇心

<table width="100%">
  <tr>
    <td width="50%"><img src="docs/screenshots/web/02-subjects.jpg" width="520" alt="桌面端学科总览" /><br/><b>全科学习，从容选择</b></td>
    <td width="50%"><img src="docs/screenshots/web/03-learning-path.jpg" width="520" alt="按教材单元展开的数学学习路径" /><br/><b>沿着教材，一步一步前进</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/web/06-reading.jpg" width="520" alt="课本原页与咏鹅逐句听读" /><br/><b>课本原页，逐句听读</b></td>
    <td><img src="docs/screenshots/web/08-story-reader.jpg" width="520" alt="门口的小伞的插画和分句故事阅读" /><br/><b>在故事里，发现新世界</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/web/09-wardrobe.jpg" width="520" alt="聪聪衣橱的大幅预览与商品卡片" /><br/><b>给聪聪，换一种模样</b></td>
    <td><img src="docs/screenshots/web/10-review.jpg" width="520" alt="错题本空状态鼓励尝试并提供巩固入口" /><br/><b>每一次尝试，都在进步</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/web/07-stories.jpg" width="520" alt="聪聪的故事时间与分级故事列表" /><br/><b>选一个故事，一起读</b></td>
    <td><img src="docs/screenshots/web/11-profile.jpg" width="520" alt="个人中心、本周报告和成就入口" /><br/><b>留下属于自己的学习足迹</b></td>
  </tr>
</table>

</details>

### iOS 原生界面 · 历史素材

以下保留原有 iOS 截图，与上方新采集的 Web 画面分别标示；本轮未重新运行 iOS 构建。

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/ios/home.jpg" width="180" /><br/><b>学习路径</b></td>
    <td align="center"><img src="docs/screenshots/ios/feedback.jpg" width="180" /><br/><b>答题反馈</b></td>
    <td align="center"><img src="docs/screenshots/ios/shop.jpg" width="180" /><br/><b>商店</b></td>
    <td align="center"><img src="docs/screenshots/ios/profile.jpg" width="180" /><br/><b>我的</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/ios/reader.jpg" width="180" /><br/><b>课文听读</b></td>
    <td align="center"><img src="docs/screenshots/ios/review.jpg" width="180" /><br/><b>错题本</b></td>
    <td align="center"><img src="docs/screenshots/ios/profile-quests.jpg" width="180" /><br/><b>每日任务 · 周报</b></td>
    <td align="center"><img src="docs/screenshots/ios/dark.jpg" width="180" /><br/><b>深色模式</b></td>
  </tr>
</table>

> 全部 12 张界面截图与说明见 [`docs/ios-ux-gallery.html`](docs/ios-ux-gallery.html)（本地打开即可，支持点击放大）。

---

## ✨ 主要特性

| 功能 | 说明 |
|------|------|
| **单元小测** | 跟着课本章节走，学完一课就能练 |
| **知识讲解** | 4,480节常规课均有知识讲解，题组每课至少6题；[五四制来源与范围](docs/five-four-2026-10-27/README.md) |
| **课文听读** | 语文/英语课文逐句朗读，支持跟读练习，展示课本原页 |
| **跟读录音** | 浏览器内录音与回放，不上传录音；需要 HTTPS 和麦克风授权，暂无语音识别评分 |
| **课外故事** | 每单元 2 篇 AI 分级故事 + 阅读理解题 + 儿童插画配图 |
| **全站 TTS** | 题目、选项、讲解、故事文本均可朗读；完整包提供 119,219 个 MP3 文件；恢复内容对应的音频全部齐备，复用已有 Edge 语音并补齐缺失项，保留原路径兼容资源 |
| **首次讲解** | 进入课程自动尝试播放，听完才解锁下一步；按钮边框光环跟随真实播放进度，不显示秒数 |
| **学习进度** | 当前浏览器保存完成情况、正确率与阅读星级；暂无云端账号和跨设备同步 |
| **连击系统** | 连续答对触发连击动画与语音激励 |
| **错题与学习报告** | 错题复习、每日目标、本周报告与家长每日学习时间限制 |

浏览器可能限制首次自动播放；可点标题旁的小喇叭恢复播放。静音或播放失败时提供“阅读后继续”。清除浏览器数据会影响本地学习记录。

**覆盖学科与版本：**

| 学科 | 版本 | 年级 | 课外故事 |
|------|------|------|----------|
| 数学 | 人教版 | 一至六年级 | — |
| 语文 | 统编版 | 一至六年级 | 188 篇 |
| 英语 | 人教版 PEP | 三至六年级 | 96 篇 |
| 科学 | 教科版 | 一至六年级 | — |

**当前资源规模（v1.8.3）**：85册教材版本（71册当前版本、14册旧版兼容），其中六三制59册、五四制26册；4,480个常规课时、635个单元挑战，常规题27,885道、挑战题6,375道，另有1,317篇/组课文和284篇故事。这是资源覆盖统计，不代表所有题目已通过教师逐题审核。

人教精通五上已纳入本版教材与语音资源，独立 ID 为 `english-g5up-jingtong-2026`；来源、覆盖范围和构建方法见 [#62 教材说明](docs/issue-62-jingtong-2026.md)。

**历史审计状态（v1.4.3，非当前规模）**：原补齐版的 2,356 课、15,117 道常规题及讲解已恢复；保留 2026 秋版二上数学的 28 课、168 题，以及三节视觉数感示范的 18 题。原数感课的 24 道题另保留为三节巩固练习，旧错题仍可按原记录复习。全库共 2,387 节常规课、15,303 题，缺讲解 0、单题课 0、少于六题课 0。题目及故事题共 20,804 道通过实际判分检查，音频与 Docker 验证通过；教师签审仍为独立待办。详见 [本版审计及验证记录](docs/content-audit-v1.4.3.md)。

---

## 🚀 快速开始

### Docker 全新部署与旧版升级

只需 Git 和 Docker Desktop（Windows/macOS）或 Docker Engine + Compose（Linux），无需在本机安装 Node.js、Python、FFmpeg，也无需 AI API Key。建议预留至少100 GB磁盘空间，容纳镜像、构建缓存和资源暂存。

**全新部署**：

```sh
git clone --branch main https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree
docker compose build --build-arg ASSETS_RELEASE=v1.8.3
docker compose up -d --no-build --wait --wait-timeout 120
```

打开 [http://localhost:8080](http://localhost:8080)。首次构建自动下载、校验 `v1.8.3` 全部资源，复用已验证的 MP3 与转换缓存，再构建网站。

**从旧版升级**：升级前备份自定义代码，在原项目根目录执行以下命令，并保留原来的 `.env`、Compose 项目名和访问协议、域名/IP、端口；如原先使用 `-p`、`-f` 等参数，以下每条 `docker compose` 命令都沿用这些参数。构建完成后再替换容器，浏览器学习记录继续保存在同一地址下。

```sh
git switch main
git pull --ff-only origin main
docker compose build --build-arg ASSETS_RELEASE=v1.8.3
docker compose up -d --no-build --force-recreate --wait --wait-timeout 120
```

**确认服务健康**：以下命令应显示容器 `healthy`，并输出 `ok`；`wget` 在容器内运行。

```sh
docker compose ps
docker compose exec -T web wget -q -O - http://127.0.0.1:8080/healthz
```

重新加载原页面后，可打开[中文数学讲解](http://localhost:8080/lesson/g6up/g6up-u4-kp1/)点击“朗读讲解”，以及[中文课文](http://localhost:8080/reading/chinese-g5down/chinese-g5down-p20/)点击“朗读第 5 句”，确认播放正常。自定义端口时使用原地址。

**Docker 验证（v1.4.3）已通过**：在 Apple Silicon/ARM64 上验证完整材料包全新构建，以及从 `v1.4.0-content`、`v1.4.2-edge-audio` 两种旧容器按原项目、原端口升级。三个运行容器均通过题库保留、全量音频 SHA-256、媒体引用、HTTP 与 Range 206 检查；中文讲解自然播完并解锁下一步，升级保留浏览器学习目标。命令与验收范围见 [Docker 安装说明](docs/docker.md)。未在本轮验证 x86 主机或实体手机/iPad。

### 其他启动方式

**安卓自行安装**：用 Android Studio 打开 `apps/android`，或从 GitHub Actions 下载构建成功的调试 APK。当前是加载 HTTPS 课堂的在线客户端；构建步骤、录音权限和已知限制见 [安卓工程说明](docs/android.md)。

### 1. 克隆仓库

以下步骤启动当前线上版本。需要 Node.js 20+、Python 3.9+，以及带 `libmp3lame` 的 FFmpeg；请将 Python 和 FFmpeg 加入系统 PATH。

```bash
git clone --branch main https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree
```

### 2. 下载或升级完整资源

音频、图片和配套数据通过 [v1.8.3 Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.8.3) 分发。音频按体积分为多个独立 ZIP，每个不超过 1.4 GB；新版安装器先逐文件校验已有资源，仅下载需要更新的分包，解压后再次核验，已有目录也会正常更新。

```bash
# macOS / Linux：在仓库根目录执行
python3 scripts/install-release.py --tag v1.8.3

# Windows PowerShell
py -3 scripts/install-release.py --tag v1.8.3
```

完整包包含 MP3、原路径音频、数据、配图和课本原页，以及可选的匹配源码与现成网站。`manifest.json`、`files.jsonl` 和 `SHA256SUMS` 提供附件及逐文件校验。仓库中的新版安装器默认按分包增量更新：本地文件与目标版本完全一致的包不再下载，`--dry-run` 可预览所需包及大小。首次完整安装建议预留至少 80 GB 用于下载、暂存和安装，已有备份另计；有本地修改时先备份。增量更新、单独资源下载、离线安装及验证命令见 [安装与升级说明](docs/release-install.md)。

### 3. 运行 Web 端

```bash
npm ci
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。构建复用包内音频和已验证的转换缓存，无需调用在线 TTS。生产构建执行 `npm run build`，输出到 `apps/web/out/`；类型检查使用 `npm run type-check`。

**直接使用现成网站**：无需 Git、Node.js 或 FFmpeg。从 Release 下载新版 `install-release.py`，执行：

```bash
python3 install-release.py --tag v1.8.3 --mode static --root ChinaStudyFree-site
python3 -m http.server 8080 --directory ChinaStudyFree-site
```

打开 [http://localhost:8080](http://localhost:8080)。升级现有静态站点时，将 `--root` 指向原站点目录；页面、数据和音频一起更新。正式托管使用支持 HTTP Range 的静态服务器，并在发布后刷新 CDN 缓存。

### 电脑、手机与部署

电脑使用侧栏和宽屏阅读布局，手机使用底部导航和单列阅读。此前线上版本已检查 23 类页面 × 7 种尺寸（320×568 至 1920×1080），并测试完整答题、阅读、刷新恢复、错题、商店和家长时间限制。2026-10-05 的 `main` 更新另通过 45 项线上 HTTP 检查、完整文件与媒体引用核对，并验证 320、390 和 1440 像素宽度的课程讲解播放与边框进度。手机尺寸模拟不等于真机验收：真实 iPhone/Android、抖音内置浏览器的播放和麦克风权限仍需复核。详见 [Web 深测报告](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/web-deep-qa-2026-10-03.md)。

线上使用东京区域的私有 S3 + CloudFront HTTPS，使用 AWS 提供的链接；没有 EC2/Lightsail、数据库或业务后端。按存储、请求和流量计费，没有 $7.50/月的服务器固定费用。部署步骤见 [AWS Web 部署说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/aws-web-deployment.md)。

### 4. 运行 iOS 端

需要 macOS + Xcode 16+ + [XcodeGen](https://github.com/yonaskolb/XcodeGen)：

```bash
brew install xcodegen      # 首次安装
cd apps/mobile
xcodegen generate          # 生成 .xcodeproj
open ChinaTextbookStudy.xcodeproj
```

在 Xcode 里选 iPhone / iPad 模拟器，Cmd+R 即可运行。App 内置一本数学书（一年级上册 + 第一节课的 TTS 音频）作为离线种子，无需网络就能体验完整流程。

**iOS 端特点：**

- SwiftUI 原生（非 React Native），支持 iPhone + iPad（iPad 自动分栏布局）
- 域逻辑（SRS / 判分 / 成就 / 宝箱 / 吉祥物）从 `packages/core` 逐文件对译为 Swift
- 音频：Opus 预转码为 AAC m4a，`AVAudioPlayer` 播放，无第三方解码依赖
- 数据按书从 GitHub Release 按需下载，无需首启下载全部教材
- 包含单元测试与 UI 测试（答题闭环、退出确认、标签导航、装扮购买、每日任务）

**统一设计系统（`DesignSystem/`）**

全端共用一套令牌，没有任何页面掉回原生系统控件：

| 令牌 | 内容 |
|------|------|
| `DuoColors` | 品牌色 + 语义色（`bg` / `surface` / `border` / `ink`…），**浅色为主、深色为可选**，同一份代码自动适配 |
| `DuoFont` | 圆体字号角色（display / title / heading / body / caption…），根部统一 `.fontDesign(.rounded)` |
| `DuoLayout` | `Space` / `Radius` / `Motion` 三组令牌，全局共用一套动效曲线 |
| `DuoButtonStyle`·`DuoCardStyle` | 标志性的立体「下沿」按压质感 |

**学习体验**

- 路径即首页：当前节点呼吸动效 + 真实单元进度环，点击弹出开始气泡
- 答错回炉重练：进度条只在答对时前进，且必定走满；错题自动进入 SRS 错题本
- 爱心耗尽拦截、退出二次确认、答错震屏与抖卡、每次点选都有触感与音效
- 结算页连胜与每日达标庆祝；错题复习不扣爱心且奖励经验值
- 课文/故事支持「朗读全文」逐句高亮跟随，读完奖励经验值
- 吉祥物「聪聪」（熊猫）以 SwiftUI Canvas 绘制，含呼吸、眨眼与情绪反应

**装扮系统（earn → spend → express 闭环）**
- 用学习赚来的宝石购买皮肤 / 主题 / 课程背景，购买即装备
- **皮肤**：11 款配饰（学士帽、圆框眼镜、皇冠、法师帽、宇航员头盔、DJ 耳机…）直接画在聪聪身上，全局生效
- **主题**：10 套配色通过 `DuoColors.themeOverride` 重绘全局品牌色；深色系主题（暗夜模式 / 曜石黑）自动切换深色外观
- **课程背景**：8 款渐变作用于答题页，按对比度需要自动降低强度，保证题目始终可读
- 商店里的每个格子都是**实时预览**：皮肤格是戴着该配饰的聪聪本人，主题格是该主题的真实配色

**留存机制**

- **每日任务**：每天 3 个不同类型的任务（赚经验 / 完成小课 / 复习错题 / 读课文），
  由日期做种子确定性生成——同一天任何时候打开都是同一组，且不需要服务端；
  完成后可领取宝石奖励
- **本周报告**：近 7 天经验值柱状图 + 与上周的增减对比，作为离线版的「和自己比」
- **连胜提醒**：可选的本地通知，每晚 20:00 提醒保住连胜；当天已学习则自动顺延到
  次日，绝不打扰。默认关闭，在设置里开启时才申请系统授权

更多上架相关细节见 [`apps/mobile/APPSTORE.md`](apps/mobile/APPSTORE.md)。

### 5. （可选）运行数据生成 Pipeline

本次新增26册的版次、目录、来源与审校范围见[五四制核对报告](docs/five-four-2026-10-27/README.md)；原题库恢复的历史记录见[旧版审计](docs/content-audit-v1.4.3.md)。语文课外阅读的历史难度校准与修订流程见 [内容质量审计与升级说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/codex/publish-tested-web/docs/content-quality-review.md)。

中文补音当前使用 Edge TTS，默认并发 4、每秒最多启动 2 次合成（含重试），失败按指数退避。下面的生成命令只用于修改内容后的重新生成；安装和构建现成 Release 不需要调用在线 TTS。改写内容应先完成样例审阅，再同步文本、配图、音频，并保留原数据备份。

如需从教材 PDF 重新生成题库数据：

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置 .env（填入 API Key）

# 生成题库
python scripts/quiz/pipeline.py --subject all

# 生成课外故事
python scripts/stories/pipeline.py --subject all

# 生成故事配图
python scripts/stories/images.py --subject all

# 为修改后的中文内容补音（需联网；安装 Release 时无需执行）
pip install 'edge-tts>=7.0'
python scripts/tts/collect_texts.py
python scripts/tts/edge_tts_batch.py --language Chinese --workers 4 --requests-per-second 2

# 构建前端数据
npm run build:data --workspace=china-study-free
```

---

## 🏗️ 项目结构

```
ChinaStudyFree/
│
├── scripts/
│   ├── quiz/                       # 题库生成 Pipeline
│   │   ├── pipeline.py             #   PDF → 大纲 → 题库
│   │   ├── prompts.py              #   AI Prompt 模板（按学科定制）
│   │   └── subjects.py             #   学科 / 版本 / 年级配置
│   ├── stories/                    # 课外故事生成 Pipeline
│   │   ├── pipeline.py             #   大纲 → 分级故事 + 阅读理解题
│   │   ├── prompts_story.py        #   故事 Prompt 模板 + JSON Schema
│   │   └── images.py               #   Gemini AI 配图生成
│   ├── passages/                   # 课文抽取
│   │   ├── extract_passages.py     #   PDF → 逐句课文 JSON
│   │   └── render_pages.py         #   PDF → 课本原页 JPG
│   ├── tts/                        # TTS 语音合成
│   │   ├── collect_texts.py        #   扫描全部文本，生成待合成清单
│   │   └── api_tts.py              #   DashScope API 批量合成
│   ├── install-release.py          # 校验并安装/升级 Release 资源（线上版本分支）
│   ├── download-assets.sh          # 旧版资源下载器（Linux/macOS）
│   ├── download-assets.ps1         # 旧版资源下载器（Windows）
│   └── package-release.sh          # 打包资源为 Release 附件
│
├── output/                         # Pipeline 产出（大纲 + 题库 JSON）
│   ├── math/chinese/english/science/
│   │   ├── outlines/               #   教材知识大纲
│   │   └── quizzes/                #   单元题库
│
├── data/                           # 源数据（通过 Release 下载）
│   ├── passages/                   #   课文听读源 JSON（语文/英语）
│   └── stories/                    #   课外故事源 JSON（语文/英语）
│
├── packages/core/                  # TypeScript 共享域逻辑（Web 端运行时 + iOS 翻译蓝本）
│
└── apps/
    ├── mobile/                         # iOS SwiftUI 端（iPhone + iPad）
    │   ├── project.yml                 #   XcodeGen 项目定义
    │   ├── ChinaTextbookStudy/
    │   │   ├── App/                    #   SwiftUI @main + NavigationStack/SplitView + 路由
    │   │   ├── DesignSystem/           #   DuoColors / DuoFont / DuoLayout / Button / Card / Effects
    │   │   ├── Models/                 #   CoreTypes.swift（对译 packages/core/types.ts）
    │   │   ├── Domain/                 #   SRS / Grade / Achievements / Chest / Cosmetics / MascotTriggers
    │   │   ├── Services/               #   DataLoader / AssetDownloader / AudioPlayer / Haptic / SFX
    │   │   ├── Stores/                 #   ProgressStore / SettingsStore（持久化）
    │   │   ├── Features/               #   Onboarding / Home / Lesson / Review / Reading /
    │   │   │                           #   Stories / Shop / Profile / Settings / Achievements
    │   │   └── Components/             #   PathMapView / MascotView / BottomTabBar / 反馈与庆祝件
    │   ├── ChinaTextbookStudyTests/    #   单元测试（域逻辑 + 每日任务）
    │   └── ChinaTextbookStudyUITests/  #   UI 测试（答题闭环 / 导航 / 装扮 / 任务）
    │
    └── web/                            # Next.js 前端（原 frontend/）
        ├── scripts/
        │   └── build-data.ts           #   output/ + data/ → public/data/ 构建
        ├── src/
        │   ├── app/                    # 路由与页面
        │   │   ├── book/               #   教材详情 / 学习路径
        │   │   ├── reading/            #   课文听读
        │   │   ├── stories/            #   课外故事阅读 + 答题
        │   │   ├── lesson/             #   答题页面
        │   │   ├── grade/              #   年级总览
        │   │   ├── profile/            #   学习档案
        │   │   ├── review/             #   错题回顾
        │   │   └── shop/               #   商店 / 奖励
        │   ├── components/             # UI 组件
        │   ├── lib/                    # 工具库（TTS、音效、状态）
        │   ├── store/                  # Zustand 状态管理
        │   └── types/                  # TypeScript 类型定义
        └── public/
            ├── audio/                  # TTS 音频（通过 Release 下载）
            ├── data/                   # 题库+故事 JSON（通过 Release 下载）
            ├── story-images/           # AI 故事配图（通过 Release 下载）
            └── textbook-pages/         # 课本原页图片（通过 Release 下载）
```

---

## 📖 教材来源与版权

本项目引用的教材结构来自开源项目 [TapXWorld/ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook)。

**内容说明**：

1. 资源包包含教材知识大纲、课文文本及课本原页；教材文本与图片的版权属于各自权利人
2. 单元练习和课外故事由 AI 生成并持续修订，生成内容仍需教师审核
3. 项目的 MIT 代码许可不代表授予第三方教材内容的使用权
4. 如相关版权方认为本项目存在任何问题，请与我们联系，我们会第一时间响应处理

---

## 🤝 如何参与

这是一个**纯公益项目**，我们非常欢迎任何形式的参与：

- 👩‍🏫 **一线老师**：帮我们审核题目质量、指出错误、建议题型
- 👨‍👩‍👧 **家长**：把平台分享给需要的家庭，反馈孩子的使用体验
- 💻 **开发者**：提交 PR 修 bug、加功能、优化 UI
- 🎨 **设计师**：帮我们让界面对孩子更友好、更有趣
- 📣 **任何人**：把这个项目告诉一所乡村小学的老师

---

## 🛣️ 路线图

- [x] 数学、语文、英语、科学 Pipeline
- [x] Web 前端（单元小测 / 知识讲解 / 学习路径）
- [x] Web 兼容 MP3 朗读与浏览器跟读录音回放
- [x] PC / mobile 布局深测与东京 S3 + CloudFront 部署
- [x] 课文听读（语文 / 英语，779 篇）
- [x] 课外故事阅读（语文 188 篇 + 英语 96 篇，含 AI 配图）
- [x] iOS 端（SwiftUI，iPhone + iPad）
- [x] iOS 统一设计系统与游戏化学习体验（浅色为主 + 可选深色）
- [x] 装扮系统闭环（皮肤 / 主题 / 课程背景购买后全局生效）
- [x] 留存机制（每日任务 / 本周报告 / 连胜提醒推送）
- [x] 语文扩展阅读升级；当前全库结构、资源与覆盖审计已公开，见 [审计报告](docs/content-audit-v1.4.3.md)
- [x] 中文 Edge TTS 补齐与全部已知旧 GPT 音频替换，完整性及实际播放验证通过
- [x] [修正版完整材料包 v1.4.3-content-restored](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.4.3-content-restored)：恢复题库、Edge 音频分包、页面、数据、校验清单与安装说明
- [x] [Docker 家庭 / 校园内网部署](docs/docker.md)：新版全新构建、旧版升级及中文音频播放验证通过（ARM64）
- [x] 二年级上册数学 2026 秋版（28 课、168 题），保留旧版路由与进度
- [x] 同一浏览器多孩子学习档案，以及学习记录手动备份导出 / 导入
- [x] Android WebView 工程与 CI APK 构建，见 [安卓工程说明](docs/android.md)
- [x] RealRouter / GPT Luna 题库补齐并发布 v1.4.0-content（2,356 课、15,117 题，均含讲解且每课至少 6 题）
- [x] 已补齐题库恢复合入 `main`，保留新版课程与功能；构建、打包、部署和 CI 增加逐课内容保留检查，拒绝题库回退
- [ ] 全库教师签审、逐题语义复核与人工听审；现有模型审读和技术检查不代表教师签审完成
- [ ] 道德与法治内容
- [ ] 云端学习记录与自动跨设备同步（当前支持手动备份迁移）
- [ ] 老师端与班级学习报告
- [ ] iOS / Android 真机完整验收与正式签名、应用商店发布

路线图包含历史已完成项，当前版本和资源规模见上方安装与升级说明。完整材料包支持下载后离线安装；Docker 首次构建需联网下载资源。校园内网的跟读录音需要 HTTPS；全库 PWA 离线预缓存及实体手机 / iPad 验收仍需补充。

---

## 📜 许可协议

本项目采用 **MIT License** 开源发布，详见 [LICENSE](LICENSE)。

Copyright (c) 2026 wangzhang wu

---

## 💌 写在最后

> 我们不知道这个项目能走多远，
> 但我们知道，只要多一个孩子因为它而多做对一道题、
> 多理解一个知识点、多喜欢上一门课，
> 这件事就是值得的。

如果你认同我们的理念，欢迎 ⭐ Star 支持，也欢迎把它转发给任何一位你认识的老师和家长。

**让每一个中国孩子，都能在玩中学。**
