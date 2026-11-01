# 聪聪学堂 HarmonyOS 实验适配

ArkTS 安装页 + ArkWeb 离线网站，基于当前 main 移植 PR #8。当前适配目标仍为 HarmonyOS API 23，设备类型为 phone、tablet、2in1；**主机回归通过不代表 SDK 编译、HAP 安装或真机播放通过**。本分支尚未发布 HAP。

页面、课程数据与媒体必须由同一个经过验证的 Release 输入生成。当前已用 v1.8.2 的 84 册完整站点验证资源生成流程。不要再使用原 PR 的 v1.2.0 四包、开发者私有 IP 或“约 2 GB / 3.4 GB 空间”的历史配置。

## 结构和版本绑定

- `scripts/fetch-harmony-resources.py`：只缓存 MP3、JSON、配图与课本原页 ZIP、发布清单及逐文件清单；支持每附件 `release_tag`，复用原发布页，不重复下载已校验的缓存。
- `scripts/package-harmony-release.py`：校验归档 SHA、ZIP 路径/成员/逐文件 SHA、静态 JSON 与媒体引用、HTML/JS/RSC 音频引用后生成页面壳和专用计划。失败保留旧页面壳。
- HAP 的 `rawfile/site/`：包含网页、内嵌计划、逐包文件清单和计划 SHA。课程数据、MP3 和图片在 App 私有目录，不塞入 HAP。
- Worker：按计划下载多个独立 ZIP，大小与 SHA 校验后解压，再逐文件验证；完成标记使用临时文件和重命名。重试核验已有文件并只修复失效包，不仅检查标记是否存在。
- 私有资源路径按实际文件内容摘要命名，完成标记绑定包含页面摘要和 Release 标签的完整计划 SHA。只改代码时会重新校验并复用已有资源，不重复下载或复制整套媒体；资源内容变化时才使用新目录，不删除旧资源。
- Web origin 固定为 `https://cstf.invalid`，保持同一 App 的 localStorage / IndexedDB 身份。PWA Service Worker 只在该离线来源禁用，在线网站不受影响。
- ArkWeb 提供 MP3 MIME、单段 Range、HEAD、深层路由与 RSC 文本响应；历史 UI `.opus` URL 映射到经过校验的 MP3 同名文件，不下载旧 Opus 兼容包。

## 准备资源与页面

需要 Node.js 22、Python 3.9+。以下命令在仓库根目录执行。原发布资源很大，请先确认磁盘和网络；v1.8.2 鸿蒙所选 13 包约 13.4 GB，设备计算最低空间约 16.1 GB，建议至少预留 20 GB，电脑还需容纳缓存和构建产物。

```sh
npm ci
npm run harmony:fetch-assets -- --tag v1.8.2 --directory deploy-output/release-v182

# 安装本版已经生成、验证过的 JSON 与媒体；保留缓存 ZIP 供打包审计。
python3 scripts/install-release.py --tag v1.8.2 \
  --archives-dir deploy-output/release-v182 \
  --asset-kind audio-web --asset-kind data \
  --asset-kind story-images --asset-kind textbook-pages

# 使用已验证的发布数据导出页面。这里不重新生成题库或时间戳。
npm exec --workspace=china-study-free -- next build

npm run harmony:prepare-web -- \
  --site apps/web/out --archives deploy-output/release-v182 \
  --output deploy-output/harmony-v182-assets
```

Windows 的 Python 命令可换成 `py -3`。`npm run harmony:*` 的 Python 入口自动选择对应命令。

不要在这套流程中用 `npm run build` 重新生成题库，再混搭旧 Release 的 data.zip：`generatedAt`、版本化音频、教材数据发生任何字节变化都会被校验拒绝。修改教材数据时应先发布匹配的资源，再生成 Harmony 计划。Web 代码可以更新，但其所有资源引用仍须由所选 Release 提供。

`harmony:prepare-web` 生成两份输出：

1. `apps/harmony/entry/src/main/resources/rawfile/site/`：用于 HAP，内含 `harmony-build.json`、`harmony-manifest.json`、逐包清单和网页。
2. `--output`：独立资源缓存，包含计划、清单和所选 ZIP；同文件系统尽量使用硬链接。只能使用新输出目录，不覆盖已发布的资源集合。旧页面壳备份保存在输出目录的父目录中，不会被打进 HAP。

默认计划从 GitHub 原发布标签下载归档，计划和清单已经内置于 HAP，不依赖一个尚未发布的计划 URL。无需运行局域网服务器。

## 可选：局域网下载测试

需要私有 IP 地址，且设备与电脑可以互访。重新生成一个明确使用局域网镜像的 HAP：

```sh
npm run harmony:prepare-web -- \
  --site apps/web/out --archives deploy-output/release-v182 \
  --output deploy-output/harmony-v182-lan-assets \
  --mirror http://192.168.1.20:8787

npm run harmony:assets-server -- --directory deploy-output/harmony-v182-lan-assets
```

替换为自己的实际地址。HTTP 仅允许 RFC1918、回环或链路本地 IPv4；公网镜像必须为 HTTPS。测试服务器启动时校验所有归档和清单，只开放计划内文件，拒绝目录浏览、路径穿越、符号链接和写入请求。不要将测试服务暴露到公网；归档必须放在 `deploy-output/`，不能放进 Web `public/`。

## SDK 构建与签名

安装官方 DevEco Studio / Command Line Tools 和 HarmonyOS API 23 SDK，确保 `hvigorw` 可执行。设置本机 SDK 路径，先在 DevEco 同步 `apps/harmony/` 工程；项目已经声明安装 Worker 的构建入口。

```sh
npm run harmony:build
# 或指定命令路径，例如：
HVIGORW=/absolute/path/to/hvigorw npm run harmony:build
```

缺少工具或生成页面时，脚本以状态码 78 明确退出，不会报告构建通过。共享 `build-profile.json5` 不包含个人证书、profile、密钥库或密码。真机安装时请在自己机器上配置自己的调试签名；不要提交 IDE 写入的私人签名字段。`local.properties`、本机配置和常见签名材料已忽略。

首次运行先检查配置，显示由计划计算的资源总量和新装空间估算，下载完成后才进入课堂。原资源保留在 App 私有目录，后续可以断网使用。已进入课堂后可以点击“检查离线资源”重新校验与修复；检查期间会退出 Web 页面，请在结束当前答题后使用。

## 自动测试

```sh
npm run harmony:test
npm test
npm run type-check
npm run check:web-experience
```

`harmony:test` 包括真实 Worker/权限策略/离线响应代码的主机适配器测试、安装线程生命周期和真实 HTTP 测试服务器，以及小型真实 ZIP 的 Python 集成测试。旧 TAR/GZip 安装路径已移除，当前只使用 SDK ZIP 解压。覆盖首次安装、收据短写、坏包、缺失文件、解压后损坏、中断重试、外部地址、原发布标签复用、目录穿越、MP3/Range/HEAD/RSC、来源限制、系统拒绝、过期授权和退出清理。

`.github/workflows/harmony.yml` 执行主机回归，其名称明确标注“不等于 SDK 编译”。

全量主机校验可运行：

```sh
node scripts/checks/harmony-installed.mjs \
  /path/to/verified-complete-site \
  apps/harmony/entry/src/main/resources/rawfile/site \
  deploy-output/harmony-installed.json
```

它运行真实 Worker 的版本、清单、大小及 SHA 逻辑，用只读文件适配器映射现有站点；收据与暂存使用独立临时目录。要求已有全部文件匹配，任何网络下载或重新解压都会使检查失败。这是额外的主机证据，仍不是 ArkWeb 或原生解压 API 的运行证据。

## 必须保留的 SDK / 设备验收门槛

目前未找到本机 SDK、hvigorw 或 hdc，尚不能宣称 ArkTS 编译、签名、HAP 安装或三类设备兼容性通过。正式合并/发布前需完成：

- API 23 的真实编译，检查 Worker 的 Context 传递、Kit API 与原生 ZIP 解压行为。
- 手机、平板、2in1 的首次安装、资源下载中断和恢复、低空间失败、旧版本升级与旧档案保留。
- 完全断网冷启动，课程/阅读/故事深层路由与页面跳转，讲解和 UI 短音频首播、拖动、Range、MP3 解码。
- 跟读麦克风允许、拒绝、系统弹窗取消、网页自行取消、页面离开和 App 退到后台后迟到授权；录音只保存本机。
- 学习记录、错题、奖励和导出在重启、升级、检查修复后保留；不得用模拟测试替代真机结果。

没有通过这些门槛之前，该实现只应作为实验适配，不应改写原 PR 的审查结论或发布可用性声明。
