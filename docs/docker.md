# Docker 家庭部署（issue #5）

安装 Docker Desktop（Windows/macOS）或 Docker Engine + Compose（Linux）。无需安装 Node.js、Python、FFmpeg，无需 AI API Key。

**当前v1.8.3**：新增人教精通五上独立教材与96条词汇听读，共85册版本，保留PEP与原有成绩。32节新增小课、216道练习、36道挑战题，新增语音使用Edge TTS；源教材与覆盖范围见[#62说明](issue-62-jingtong-2026.md)。继承长数字输入、资源增量更新、续学计时及五四制教材。

## 全新部署

需要 Git。在终端（Windows 可使用 PowerShell）执行：

```sh
git clone --branch main https://github.com/wuwangzhang1216/ChinaTextbookStudyFree.git
cd ChinaTextbookStudyFree
docker compose build --build-arg ASSETS_RELEASE=v1.8.3
docker compose up -d --no-build --wait --wait-timeout 120
```

打开 [http://localhost:8080](http://localhost:8080)。首次构建自动下载并校验 `v1.8.3`的全部资源（音频按体积分包），复用已验证的 MP3 与转换缓存，再导出静态站点。下载、校验和构建需要时间；建议至少预留100 GB磁盘空间（含镜像、构建缓存及资源暂存）。后续修改页面复用依赖及资源层缓存。

镜像包含四科题库、课文、故事、配图、原音频及 Web MP3；运行阶段只有 Nginx，无需业务后端或数据库。代码、构建工具和环境密钥不进入运行镜像。

## 从旧版升级

升级前备份自定义代码，在原项目根目录执行以下命令，并保留原来的 `.env`、Compose 项目名和访问协议、域名/IP、端口；如原先使用 `-p`、`-f` 等参数，以下每条 `docker compose` 命令都沿用这些参数。构建完成后再替换容器，浏览器学习记录继续保存在同一地址下。无需先停止旧容器；构建成功后由 Compose 替换为新镜像。`--build-arg` 明确选择新版材料，即使旧 `.env` 中还配置了其他 `ASSETS_RELEASE` 也会使用本版。

```sh
git switch main
git pull --ff-only origin main
docker compose build --build-arg ASSETS_RELEASE=v1.8.3
docker compose up -d --no-build --force-recreate --wait --wait-timeout 120
```

## 确认服务与中文播放

```sh
docker compose ps
docker compose exec -T web wget -q -O - http://127.0.0.1:8080/healthz
```

应看到容器状态 `healthy`，健康接口输出 `ok`。`wget` 已包含在镜像内，不需要在本机安装 Python 或其他检查工具。

重新加载原来的网页，打开[数学《比的意义与比值》](http://localhost:8080/lesson/g6up/g6up-u4-kp1/)点击“朗读讲解”，听完后“下一步”应解锁；打开[语文《汉字字体的演变》](http://localhost:8080/reading/chinese-g5down/chinese-g5down-p20/)点击“朗读第 5 句”，应正常播放并自然结束。自定义端口、域名或 IP 时，将链接改成原部署地址。

## 常用操作

```sh
# 状态与日志
docker compose ps
docker compose logs --tail=100 web

# 停止（不会清除浏览器里的学习记录）
docker compose down
```

默认仅本机可访问。需要同一局域网的电脑/iPad/手机访问时，在仓库 `.env` 加入：

```dotenv
WEB_BIND_ADDRESS=0.0.0.0
WEB_PORT=8080
```

再次执行启动命令，在设备上打开 `http://你的电脑局域网IP:8080`。主机防火墙须允许所选端口。

学习记录保存在每个设备的浏览器中，容器更新和重启不提供跨设备同步。同一设备换域名/IP/端口会成为新的浏览器存储来源；更换地址前，可在支持的个人页使用学习记录备份导出/导入。

HTTP 局域网访问可以学习和播放音频，但跟读录音通常需要 HTTPS；`localhost` 本机开发例外。需要手机录音时，可用现有 HTTPS 反向代理接入本容器，或使用 [线上 HTTPS 网站](https://d3nmsqi4n72idj.cloudfront.net/)。

## 手动构建镜像

```sh
docker build -t china-textbook-study-free:local .
docker run --rm -p 127.0.0.1:8080:8080 china-textbook-study-free:local
```

可用 `--build-arg ASSETS_RELEASE=其他完整资源版本` 指定资源 Release；只有与代码兼容的完整包才能使用。不要把历史 `web-source.zip` 覆盖到当前代码上。

此处为本地构建方案，没有承诺 Docker Hub/GHCR 已发布现成镜像。构建方式参照 [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/) 和 [Compose 官方文档](https://docs.docker.com/compose/gettingstarted/)。

如果已经按照 README 在本机完成 `npm run build`，可直接打包现成站点，省去容器内重复下载与转码：

```sh
docker build --target prebuilt --build-context site=apps/web/out -t china-textbook-study-free:local .
```

此命令需要支持命名构建上下文的 Docker BuildKit；`apps/web/out/` 必须来自完整成功的生产构建。默认 Compose 仍使用前面的完整自动构建流程。

## v1.4.3 修正版验收记录

- ARM64 全新构建：安装完整分包、校验资源、执行当前源码生产构建；运行容器为 `nginx` 用户且健康检查通过。
- 从 `v1.4.0-content` 升级：先启动原版并保存每日目标 200 XP、播放旧讲解，再保留原项目和地址替换镜像；升级后目标与 5 颗宝石保留，原 2,356 课、15,117 题逐一保留。
- 从 `v1.4.2-edge-audio` 升级：同样保留原项目和地址，目标 100 XP 与 5 颗宝石保留，完整题库恢复至 2,387 课、15,303 题。
- 三个运行容器分别核对全部 249,852 个音频文件的 SHA-256，检查全部 JSON 音频引用、20 项 HTTP 冒烟检查，以及 MP3 类型、完整解码与 Range 206；实际页面中文朗读自然结束，下一步解锁。
- 仍保留 2026 秋版二上数学、视觉数感示范、多孩子档案与当前功能；旧数感题作为三节巩固练习继续开放，旧错题复习保持原键与复习时间。
- 仅验收 Docker Desktop Linux/ARM64，未在本轮验证 x86 或实体手机/iPad。技术检查不等于教师签审或全库人工听审。

详细机器结果随 [修正版 Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.4.3-content-restored) 的 `VALIDATION.json` 提供；复验脚本与基线包含在匹配源码包内。

## 历史 v1.4.2 Release 验收记录（2026-10-21）

以下为旧版技术验收，未覆盖跨版本题库保留；其已知内容回退已由上方 v1.4.3 修复。

**Docker 验证（2026-10-21）已通过**：在 Apple Silicon/ARM64 上完成新版 Release 无缓存全新构建，以及从 `v1.4.0-content` 旧容器升级。两个容器分别通过 20 项 HTTP 检查；244,930 个音频文件的 SHA-256 全部匹配，67,595 个唯一音频引用无缺失；各抽取 12 段 MP3 完整解码和 Range 206 检查通过。浏览器实际播放中文数学讲解及课文，共 4 个新版页面均自然播完，讲解后“下一步”正常解锁，控制台无错误或警告；升级保留每日目标设置。未在本轮验证 x86 主机或实体手机/iPad。

全新部署使用默认 Dockerfile/Compose，`build --no-cache` 在容器内从公开 Release 下载、核验和安装完整资源，再执行生产构建；67,631 条转换缓存通过核验，0 条待转码。旧版基线为已校验的 `v1.4.0-content` 静态包（155,148 个文件），通过 `prebuilt` 目标构建旧镜像并启动，再在同一 Compose 项目和端口替换为新版镜像；实际确认容器及镜像 ID 已变化，浏览器缓存和学习存储未清除。

两个运行容器均为 `nginx` 用户，Nginx 配置检查通过；2,565 个数据 JSON 的所有音频引用均有效。升级前先播放旧数学讲解与课文以建立缓存，升级后已加载新页面和版本化 Edge MP3；旧版原本无法播放的课文第 5 句已正常播放，每日目标 100 XP 保留。运行镜像约 8.64 GB（十进制）。

本轮环境为 Docker Desktop Linux/ARM64，Docker 29.3.1、Compose 5.1.0。验收没有发现需要修改代码的问题；临时测试容器和专用网络已清理。

## 验收记录（2026-10-05）

本轮在 Apple Silicon 上完成完整资源下载、校验、转码及容器内生产构建；修复公开 JSON/MP3 权限导致的 403 后，以最新生产输出再次打包并实际通过 Compose 启动。最终运行镜像约 4.26 GB，进程用户为 `nginx`。

20 项 HTTP 检查通过，包括课程及单元挑战深层链接、课文/故事/个人页、JSON、图片、MP3 类型及 Range 206、404 与环境文件不可访问。课程页面已在浏览器实际加载，390px 手机视口检查无控制台错误；深色答题页的白底白字问题一并修复。未在真实手机/老 iPad 或 x86 主机上运行此容器。

可重跑服务检查：

```sh
python3 scripts/checks/docker-site.py --origin http://localhost:8080
```
