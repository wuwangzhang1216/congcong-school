# v1.8.3：人教精通五上教材、语音与安装升级

本版新增人教版（精通）五年级上册（2026秋版），主编苗兴伟，根据2022年版课程标准修订。使用独立 ID `english-g5up-jingtong-2026`，在五年级英语中与 PEP 并列；不替换原教材，不迁移或清除原有成绩。

包含6个单元、2节Revision、96条附录词汇、32节小课、216道配套练习和36道单元挑战。题目、选项、讲解及词汇听读所需1,044条音频全部提供；新增847条由Edge TTS生成（英文Aria、中文晓晓），其余197条复用既有音频。听读范围为单元词汇，不包含整册课文、歌曲或原页点读，详见[来源与范围](issue-62-jingtong-2026.md)。继承v1.8.2长数字输入与按分包增量更新、v1.8.1续学计时修复。无需AI API Key。

完整资源包含85册版本（71册当前、14册旧版兼容），4,480个常规课时、635个单元挑战、常规题27,885道、挑战题6,375道，另有1,317篇/组听读和284篇故事。五四制26册与既有内容保留。原书版次及核对范围见[五四制逐册报告](five-four-2026-10-27/README.md)。

**不用下载 Assets 中的全部附件。** 在线学习直接[打开课堂](https://d3nmsqi4n72idj.cloudfront.net/)；Web使用安装器选择资源；手动离线下载见[下载导航](https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.3/DOWNLOADS.md)。主发布页提供安装器、说明和校验入口；新Web、源码、数据、转换缓存及两个音频增补包位于 `v1.8.3-web-resources`，精通五上的两个iOS逐册包位于 `v1.8.3-ios-resources`。未变更的189个ZIP继续引用原发布页，清单逐包注明原标签、大小和SHA-256；不会重新上传或要求重复下载一致的旧资源。

新增 `audio-original-jingtong-g5up-2026.zip` 和 `audio-web-jingtong-g5up-2026.zip` 为配套增补，**新装和升级都由安装器自动选择**，不是需要先装旧版的独立补丁。完整清单同时引用旧基础包，直接安装v1.8.3即可获得全部85册。所有音频ZIP均可独立解压，无需拼接。

## 最快使用：安装现成网站

只需 Python 3.9+，无需 Node.js 或 FFmpeg。在 [Release](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/releases/tag/v1.8.3) 下载 `install-release.py`，执行：

```sh
python3 install-release.py --tag v1.8.3 --mode static --root ChinaStudyFree-site
python3 -m http.server 8080 --directory ChinaStudyFree-site
```

打开 http://localhost:8080/。Windows 将 `python3` 换成 `py -3`。这是 HTTP 本地预览；正式托管时使用支持 MP3 和 HTTP Range 的静态服务器（例如 Nginx 或对象存储/CDN），跟读录音需要 HTTPS 或 localhost。

仓库中的新版安装器先获取 `manifest.json` 和 `files.jsonl`，比对本地文件的大小与 SHA-256，只下载需要更新的分包，再在临时目录解压并逐文件核验后安装。首次安装仍需完整资源；请为下载、安装前的暂存、现有站点和备份预留充足空间，首次完整安装建议至少 80 GB（已有多份备份时另加备份所需空间）。安装期间保持现有服务停止，安装完成后再启动。

## 已有旧版：原目录升级

先备份自定义文件或数据。增量更新需使用[仓库当前安装器](https://raw.githubusercontent.com/wuwangzhang1216/congcong-school/main/scripts/install-release.py)（可另存为 `install-release.py`）；已发布 v1.7.0 至 v1.8.1 附件中的旧安装器仍会全量下载；v1.8.2安装器虽支持增量，默认目标仍是旧版，请换成本版安装器或显式指定 `--tag v1.8.3`。新版安装器兼容现有分包及清单，并会自动下载新增教材所需的数据、页面和音频增补包。

```sh
python3 install-release.py --tag v1.8.3 --mode static --root /path/to/existing-site
```

默认执行**按分包增量更新**：只有包内全部文件均与目标版本一致时才跳过该包，不仅判断目录是否存在，也不依赖 `ASSETS-VERSION.json`。即使旧版没有安装记录，也可以复用一致的音频和图片；缺失、损坏、内容变化的文件会触发对应分包重新下载。比对需要读取本地资源，较慢磁盘可能需要几分钟。

可以先预览所需包及总字节数（只获取清单，不下载资源包、不写入安装目录）：

```sh
python3 install-release.py --tag v1.8.3 --mode static --root /path/to/existing-site --dry-run
```

分包内只要有一个文件变化，就仍需下载整个分包；当前不提供跨版本的逐文件差量补丁。没有逐文件清单的旧 schema 1 发布仍全量安装。需要强制重新下载并安装全部所选包时加 `--full-download`。

需要更新的包会覆盖对应页面、配套数据、音频和缓存文件，包括旧 GPT 音频的同名兼容文件。未包含在材料包中的自定义文件会保留，旧版遗留文件也不会自动删除。浏览器学习记录保存在原来的浏览器存储中；继续使用相同域名、协议和端口可以保留该存储。

如果是源码部署，先备份本地代码修改；希望安装本版匹配源码与所有资源时执行：

```sh
python3 install-release.py --tag v1.8.3 --with-source --root /path/to/ChinaTextbookStudyFree
cd /path/to/ChinaTextbookStudyFree
npm ci
npm run build
```

`--with-source` 会更新材料包中的源码文件。只更新已检出配套版本的资源时，省略这个参数。重新部署 `apps/web/out/`，刷新原站点 CDN 缓存，并重新打开页面，使新服务工作线程和音频版本地址生效。

## 全新源码安装

需要 Node.js 20+、Python 3.9+、带 libmp3lame 的 FFmpeg（均加入 PATH）：

```sh
python3 install-release.py --tag v1.8.3 --with-source --root ChinaTextbookStudyFree
cd ChinaTextbookStudyFree
npm ci
npm run build
python3 -m http.server 8080 --directory apps/web/out
```

`web-source.zip` 同时提供匹配源码，可单独解压到新目录；ZIP 内直接是仓库文件，没有额外顶层目录。源码构建复用包内音频和已校验的转换缓存，不调用在线 TTS。构建会再次检查音频；缓存不匹配时重新转换，而不是信任旧音频。生成数据会应用已验证的版本化音频地址，避免浏览器复用旧 GPT 语音。

## 离线安装与完整校验

在[下载导航](https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.3/DOWNLOADS.md)选择“现成静态网站”或“源码与完整资源”，只下载该模式列出的包至同一目录，另下载安装器、`manifest.json` 与 `files.jsonl`。Web 安装不需要170个iOS逐册包。

```sh
python3 install-release.py --tag v1.8.3 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads
python3 install-release.py --tag v1.8.3 --mode static --root ChinaStudyFree-site --archives-dir /path/to/downloads --verify-only
```

源码目录校验使用 `--root /path/to/source`，省略 `--mode static`；如果安装过完整源码，同时加上 `--with-source`。

macOS/Linux 可额外验证所有下载附件：

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing
```

离线增量更新也会跳过本地一致的包，下载目录只需清单和实际需要更新的分包；全新安装或 `--full-download` 需要所选模式的全部包。

每个发布页的 `SHA256SUMS` 覆盖该页附件，完整跨版本资源的大小和 SHA-256 由新版 `manifest.json` 记录并由安装器验证；`--ignore-missing` 只核验已下载文件。新版 `--verify-only` 只根据已验证的逐文件清单检查安装结果，不下载或检查归档、不修改文件；因此校验安装结果无需保留大型 ZIP。需要核验下载包时另用上述 `shasum` 命令。任意需要的分包缺失、校验和不符、归档内容不符、安装路径被符号链接指向外部时，安装器明确失败，不会跳过问题继续宣告成功。

## 单独下载与覆盖资源

[下载导航](https://github.com/wuwangzhang1216/congcong-school/releases/download/v1.8.3/DOWNLOADS.md)提供音频、数据、配图、课本原页和网站页面的独立下载链接。只需更新某类资源时，也可以让安装器自动选择、校验并覆盖该类资源，例如：

```sh
# 静态站点：只适用于本地已装齐目标版音频的页面修补；首次升级v1.8.3请不要使用此筛选
python3 install-release.py --tag v1.8.3 --mode static --root /path/to/existing-site --asset-kind web --asset-kind data
# 源码部署：只更新配图
python3 install-release.py --tag v1.8.3 --root /path/to/ChinaTextbookStudyFree --asset-kind story-images --asset-kind textbook-pages
```

可选资源类型及安装目录由目标版本清单决定，常用类型为 `audio-original`、`audio-web`、`data`、`story-images`、`textbook-pages`；静态站点另有 `web`，源码模式另有 `source-data`、`build-cache`。选择性更新不会检查未选资源是否匹配；若新页面或数据引用了新音频、图片，需要同步更新相关类型。一般升级建议省略 `--asset-kind`，让安装器检查全部资源并自动跳过一致的包。

手动覆盖前先备份并停止服务，从同一目标版本的下载导航选包，验证校验和后按下表解压到对应目录。源码模式中的音频解压至 `apps/web/public/`，JSON 解压至 `apps/web/public/data/`，图片解压至 `apps/web/public/story-images/` 或 `apps/web/public/textbook-pages/`。覆盖完成后刷新站点/CDN 缓存；源码部署还需重新构建。手动操作建议随后用新版安装器的 `--verify-only` 检查结果。

## 附件对应关系

| 附件 | 内容与用途 |
| --- | --- |
| `audio-original-partNN.zip` | 原音频路径的兼容资源；每个 ZIP 含 `audio/` 顶层目录。历史 `.opus` 扩展名下可能是 Ogg/Opus 或 MP3，以实际内容为准 |
| `audio-web-partNN.zip` | 浏览器MP3与版本化文件名；旧包逐字节复用，并自动安装精通五上增补包 |
| `audio-original-jingtong-g5up-2026.zip` / `audio-web-jingtong-g5up-2026.zip` | 本版新增原路径音频和浏览器MP3；与基础分包一起由安装器安装 |
| `data.zip` | 当前线上配套 JSON；手动解压到站点 `data/` |
| `web-app.zip` | 当前线上页面、界面资源和服务工作线程；手动解压到站点根目录 |
| `story-images.zip` / `textbook-pages.zip` | 手动解压到站点同名目录 |
| `data-source.zip` | 课文和故事源 JSON；源码安装使用 |
| `web-audio-cache.zip` | 可携带到新目录的已验证转换缓存；源码安装使用 |
| `web-source.zip` | 对应本版的源码、构建输入、README、安装器及脚本 |
| `manifest.json` | 附件大小、SHA-256、安装位置、实际材料规模和源码提交 |
| `files.jsonl` | 每个归档成员的路径、大小、SHA-256，供安装与审计 |
| `SHA256SUMS` | 所在发布页附件的校验和；完整资源使用manifest与安装器验证 |
| `VALIDATION.json` | 本版验证范围与结果；人工和未验证项目单独标明 |

手动安装静态站点时，将全部音频 ZIP 解压到站点根目录，再按表中位置解压数据、页面和图片。安装器可以自动完成这些步骤及全部校验。

本包保留14册历史教材路由，总计85册版本，当前展示71册，其中六三制59册、独立五四制26册。全部85册均提供逐册数据与AAC/M4A音频包；配套iOS源码已更新85册种子目录和逐包原发布标签解析，既有已安装App不会因Web发布自动更新客户端；手动下载按本版导航中的每册链接获取，新册与旧册可位于不同资源发布页。原发布页、旧版下载地址和学习记录保留。

## 题库保留与升级验收

本次对原有教材和内容做逐文件、逐册元数据比对；五四制的课时、题目、单元挑战、宝箱和听读均使用独立ID。每个来源单元先核对范围，再生成配套内容并进行模型审校与实际判分检查；这不代表已完成教师逐题签审。历史v1.7.3及以前的教材、拼音修复、首课互动和未完成会话恢复逻辑继续保留。

安装完整源码并构建后可运行以下只读检查；静态网站把 `--public` 改成站点根目录，同时提供材料包中的基线文件路径：

```sh
python3 scripts/checks/content-retention.py --public apps/web/out
```

检查逐课比对已发布题库的课程 ID、题目 ID、内容指纹与讲解，不以总题数增加代替原题保留。构建、打包和部署都会运行该检查。教师签审仍待完成。Docker 全新部署和原项目升级命令见 [Docker 说明](https://github.com/wuwangzhang1216/ChinaTextbookStudyFree/blob/main/docs/docker.md)。

## 新旧教材的成绩兼容

旧版仍可从教材切换菜单进入，已选旧版时重新打开首页也保留该选择。新版课时、宝箱和朗读使用独立 ID，原成绩不会算入新版，也不会被清除。Web 更新只轮换页面及教材缓存，不访问或清空 localStorage/IndexedDB。

本次不改写原教材题库或既有成绩；选择精通五上或五四制教材后从独立路径开始学习。首次选书可切换“五四制/六三制”，六年级只提供六三制。原版教材仍可通过教材切换菜单进入。

来源与验证范围见[五四制核对报告](five-four-2026-10-27/README.md)。#12中需要教师、儿童、真机和隔日学习效果配合的事项继续单独跟进。
