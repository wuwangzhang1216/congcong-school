# #62：人教精通五年级上册（2026 秋版）

新增独立教材 `english-g5up-jingtong-2026`。`english-g5up` 继续表示现有 PEP 五上，两册没有 `supersedes` 关系；旧课程、课文、宝箱和学习成绩的键均保留。年级页在同一学科下并列显示，精通入口和换书按钮带“精通·2026秋版”标识，原有默认选书顺序仍优先 PEP。

本次只增加反馈中明确的五上一本，不据此承诺或生成精通三至六年级其他册次。

## 来源与核对

- [Issue #62](https://github.com/wuwangzhang1216/congcong-school/issues/62)。反馈所列 6 个单元及示例词汇与官方页图一致。
- [国家中小学智慧教育平台电子教材](https://basic.smartedu.cn/tchMaterial/detail?contentType=assets_document&contentId=0d53b423-e9d3-63ae-9a22-0bce900d3b97)：人民教育出版社、苗兴伟主编、根据 2022 年版课程标准修订。源资源 ID 为 `0d53b423-e9d3-63ae-9a22-0bce900d3b97`；已保存目录索引中的官方更新时间为 2026-08-26。
- 页图版本路径含 `1787706860903`。98 张连续页图均下载成功并记录 SHA-256；目录、附录 2 和附录 3 原图逐页核对，正文通过本地 OCR 检索核对主要交际与拼读目标。OCR 不是自动导入答案的依据。完整页图和 OCR 不提交 Git，也不随本次教材增补包分发。
- 附录 2 实际位于印刷页 86–88；89–91 是附录 3 的字母排序索引，不能把这两部分重复计数。共 **96** 条词汇和短语，分单元为 **17 / 15 / 15 / 17 / 16 / 16**。
- 保留附录中的“黑体要求理解运用 / 白体仅在语境中理解”和星号（二级词）标记。中文为学习简释，未要求所有词条默写。`like` 在第二单元是“像”，`study` 在第五单元是“书房”。
- 第四单元的词表是 `take care of`，没有 `bag`；部分网络资料把它写成 `look after` 并混入旧版词汇。本次采用官方附录，不能直接导入这些同名网络词表。
- “2026秋版”用于与现有应用教材区分，不能仅从平台更新时间推断实体书的出版或印刷年份。

[机器可读来源和逐页哈希](issue-62-source-evidence.json)；[96 条词表及要求](../content/editions/jingtong/english-g5up-2026.json)。后续提供词表可使用相同的 `units[].vocabulary[]` 格式，包含 `english`、`chinese`、`firstPage`、`requirement` 和 `standardLevel2`。

| 顺序 | 内容 | 印刷页 |
| --- | --- | --- |
| 1 | Around the world | 2–13 |
| 2 | Jobs | 14–25 |
| 3 | Workplaces | 26–37 |
| 101 | Revision 1（综合复习） | 38–41 |
| 4 | Putting things in order | 42–53 |
| 5 | A tidy house | 54–65 |
| 6 | Be yourself | 66–77 |
| 102 | Revision 2（综合复习） | 78–81 |

## 实现范围

- 32 节小课：每个单元 2 组词汇、2 组交际/语法和 1 组拼读；两节综合复习按教材顺序穿插。216 道普通题，另有 6 套各 6 道的单元挑战，共 252 道。题目与讲解为配套编写，并非教材原题转录。
- 拼读对应印刷页 9 / 21 / 33 / 49 / 61 / 73 的 ou/ow、er/or、y、our、ee/ea、ie 与相邻元音。注意口音差异，不把所有相同拼写视为同音。
- 6 篇单元词汇听读，共 96 条；“put ... in order”的朗读例子为“put things in order”。**这不是全册对话、阅读、歌曲或原页点读的交付。** 应用中的听读标题明确为“单元词汇”。
- 小型听读输入随源码存放在 `content/passages/`，构建器和 TTS 收集器同时读取该目录及安装器提供的 `data/passages/`。重复 bookId 会报错，避免静默覆盖版本。
- 新增音频继续通过内容哈希命名，沿用现有 Opus 输入和 MP3 转换、校验流程，构建只引用实际存在的文件。
- 新版无需修改 core 的成绩存储或迁移已有记录。旧 PEP 与新版的课程、听读和宝箱 ID 分别计算。

## 验证与资源构建

无需大资源包即可检查内容、判分、词表覆盖和身份隔离：

```sh
npm ci
npx tsx scripts/checks/jingtong-textbook.ts
npm test
npm run type-check
```

完整验收需先按现有安装文档装好匹配的 `source-data`、`audio-original` 和媒体资源，再重新构建。TTS 收集器已包含新目录；不要只构建静态站点而漏掉新增音频：

```sh
python3 scripts/tts/collect_texts.py
# 按 scripts/tts/edge_tts_batch.py 的说明合成缺失项，已有文件可断点续传。
python3 scripts/tts/edge_tts_batch.py
npm run build:data --workspace=china-study-free
npx tsx scripts/checks/jingtong-textbook.ts --public apps/web/public
npm exec --workspace=china-study-free -- next build
```

发布时将新增音频、重新生成的 `data` 与 Web 壳一并纳入新版本，更新 manifest/inventory 后按既有安装器验收升级。当前 v1.8.2 的旧资源包没有这些新增音频和课程；不能直接复用旧 `data.zip` 后宣称已上线。本次工作不改变线上版本或 issue 状态。
