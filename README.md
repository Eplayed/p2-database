# PoE2-Database 数据项目

为微信小程序「PoE2 流放助手」生产天梯、BD 解析、经济、国服换算、急救箱和剧情地图 JSON，并上传到阿里云 OSS。

数据链路：`poe.ninja / poe2db / DD373 / poe2ggg / 人工源 -> JSON -> OSS -> 小程序`。

另有独立的 POE1「流放赛季助手」数据线：`国服官方天梯 / poe.ninja 游戏内经济 / 人工校对开荒 BD -> translated-data/poe1 -> poe1-season/{env}/ -> POE1 小程序`。它与 POE2 的生产目录、缓存和 OSS 路径完全隔离。

首次接手先读：

- `docs/PROJECT_OVERVIEW.md`
- `docs/DESIGN.md`
- `docs/CONTENT_RESEARCH.md`
- `AGENT.md`

## 当前产品决策

2026-06-18 起，小程序下架独立的“赛季开荒”和“热门 BD”功能，热门流派统一由 poe.ninja 天梯与玩家 BD 解析承载。

2026-07-06 起，小程序下架独立“0.5 资料”和“终局清单”功能，`patch-0.5` 历史管线保留源码但不再进入 Dashboard、npm 发布脚本或 GitHub Actions 日常更新。

2026-07-07 起，小程序不再展示独立新闻流，新闻爬虫和踩蘑菇精华帖 BD 抓取只作为历史源码保留，不再进入 Dashboard、npm 发布脚本或 GitHub Actions。

- Dashboard 不再提供开荒推荐/热门 BD 更新任务。
- npm scripts 不再暴露 starter 抓取、生成和发布命令。
- GitHub Actions 不再自动生成 `starters.json`。
- `crawlers/starter*` 与 `base-data/starter` 暂作为历史源码和数据保留，不参与当前发布链路。
- OSS 上已有 `starters.json`、`starter_candidates.json` 可暂时保留兼容旧版小程序，但不会继续更新。
- `auto_browser/crawl_news*.js`、`auto_browser/crawl_caimogu_essence_full.js` 等历史爬虫暂不删除，但不是当前维护任务。

## 当前数据能力

- 天梯与 BD 解析：玩家、职业、装备、技能、符文、天赋和趋势聚合。
- 技能/装备查 BD：由玩家详情生成轻量搜索目录，搭配与代表玩家详情按需加载。
- 首页复访摘要：把经济、天梯和急救箱聚合成 `daily_return_digest.json`，供小程序首页“今日变化”快速展示和分享。
- 我的关注变化：把技能、传奇装备和 DD373 国服通货生成 `follow_updates.json`；只在用户已关注时由小程序拉取，展示相对上一版的真实变化。
- 流放急救箱：人工确认的问题排查清单，跳转到天梯、经济、清单等已有工具。
- 翻译字典：poe2db 中文数据与人工映射。
- poe.ninja 经济：首页轻量摘要与国际服分类通货参考；完整目录仅在用户打开国际服页时加载。
- poe.ninja 经济生成会校验通货分类非空；抓到空数据时直接失败并停止 Dashboard 组合任务，避免覆盖线上有效行情。
- 国服行情参考：DD373 公开样本换算。
- 剧情地图：章节地图、点位、奖励和路线。

## Dashboard

```bash
npm install
npm run dashboard
```

访问 `http://localhost:5177`。

当前只保留两类可见能力：

1. `一键更新日常数据并上传`
   poe.ninja 经济（首页摘要 + 国际服通货目录） -> DD373 -> 流放急救箱 -> 我的关注变化 -> 首页复访摘要 -> OSS。
2. `刷新天梯/BD解析并上传`
   天梯玩家详情 -> BD 解析 -> 趋势聚合 -> 技能/装备查 BD 索引 -> 我的关注变化 -> 首页复访摘要 -> OSS。
隐藏步骤仅供上述组合任务调用，不单独展示。

剧情攻略变化很少，不在 Dashboard 日常任务中；需要时使用命令行单独刷新。

### 本地自动运行

Dashboard 支持在页面保持打开时按队列自动执行任务：

1. 在“本地自动运行”里选择任务，点击“添加到队列”。
2. 在“执行顺序”里拖动任务排序，也可以移除不需要的任务。
3. 设置间隔和浮动时间，点击“保存设置”。
4. 点击“开启自动运行”。到点后会先弹出 5 秒倒计时，再按队列一个接一个运行。

队列适合本地值守：例如先跑 `一键更新日常数据并上传`，再跑 `更新论坛选题池`。如果某个任务失败、停止或当前已有任务运行，后续任务不会继续执行，避免把错误数据继续发布。

## 常用命令

```bash
# 天梯与 BD 解析
npm run crawl:ladder
npm run crawl:ladder:dev
CI=true NODE_ENV=production node crawlers/run.js --ladder --upload

# 仅基于现有玩家详情重建技能/装备查 BD 索引
npm run build:ladder-index

# poe.ninja 经济
npm run crawl:economy:ninja
npm run data:economy:publish

# DD373 国服行情参考
npm run crawl:cn-market:dd373
npm run data:cn-market:publish

# 流放急救箱
npm run build:problem-guides
npm run build:problem-guides:dev

# 首页今日变化/复访摘要
npm run build:daily-return
npm run build:daily-return:dev

# 我的关注变化摘要
npm run build:follow-updates
npm run build:follow-updates:dev

# 内容研究选题池，仅本地自媒体/策略使用，不上传 OSS
npm run research:content

# 剧情地图，低频手动维护
npm run crawl:story-guide
npm run crawl:story-guide:upload

# 上传当前 release 产物
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"

# POE1 流放赛季助手：国服官方天梯 + 开荒 BD + 剧情跑图 + 游戏内经济，生成后上传专用 OSS 前缀
npm run poe1:ladder
npm run poe1:official-starter
npm run poe1:starter
npm run poe1:starter:terms
npm run poe1:story
npm run poe1:economy
npm run poe1:economy:cn
npm run poe1:upload
npm run poe1:publish
```

Dashboard 中也提供 `更新 POE1 抄 BD / 看行情` 一键任务，按“国服官方天梯 -> 官方入门流派 -> 玩家开荒 BD -> 开荒术语匹配 -> 剧情跑图导航 -> 天赋树截图 -> 国际服经济摘要 -> 国服行情接口 -> POE1 专用 OSS 上传”执行；它与 POE2 的日常/天梯任务相互隔离。

内容研究跑完后，Dashboard 会显示“内容研究看板”，可按 `抄BD / 看行情 / 解卡点 / 新闻资讯 / 热点信息` 和 `POE1 / POE2 / 暗黑破坏神 / 魔兽世界` 筛选；Markdown 选题清单会导出到 `dashboard/runtime/content-research-topics.md`，仅供自媒体和产品策略使用，不上传 OSS。

## 当前关键产物

```text
translated-data/release/
├── all_ladders_translated.json
├── classes.json
├── ladder_analysis.json
├── players/*.json
├── miniprogram_data/
│   ├── economy_digest.json
│   ├── international_market_catalog.json
│   ├── economy-icons/*
│   ├── cn_market_digest.json
│   ├── daily_return_digest.json
│   ├── follow_updates.json
│   ├── problem_guides.json
│   ├── problem_guides_manifest.json
│   ├── ladder_build_index.json
│   ├── ladder_build_details/*.json
│   └── story_guides.json
```

生产上传还会同步兼容路径：

```text
poe2-economy/economy.json
poe2-economy/economy_digest.json
poe2-economy/cn_market_digest.json
```

## POE1 数据线

POE1 当前服务独立小程序 `poe-mini` 的四条移动端主路径：`抄 BD`、`开荒 BD`、`剧情跑图` 与 `看行情`。

```text
translated-data/poe1/release/miniprogram_data/
├── ladder_digest.json       # 国服官方天梯角色、职业、主技能、装备、技能组合、关键天赋、天赋树和基础防御/DPS 摘要
├── official_starter_builds.json # 国服官方推荐流派结构化入口，当前 S29 作为入门参考
├── starter_builds.json      # 人工校对 docx 生成的开荒 BD 结构化列表和详情
├── starter_terms_enrichment.json # 开荒 BD 技能/装备/天赋术语与国服官方天梯真实数据的匹配结果
├── story_guide.json         # 剧情跑图导航：章节、步骤、点位、箭头和必拿/注意事项
├── story/*.jpg              # 剧情章节地图/分镜压缩图，供小程序按需加载
├── passive_trees/*.jpg      # 天梯 BD 天赋树截图
├── economy_digest.json      # 国际服 poe.ninja：通货、碎片、精华、圣油的游戏内混沌石换算与 7 日变化
└── cn_economy_digest.json   # 国服行情接口：DD373 S30 公开报价 + FilterEditor 公开源 + 人工校准入口，禁止混用国际服比例
```

生产 OSS 前缀是 `poe1-season/release/miniprogram_data/`，缓存为经济 5 分钟、天梯 15 分钟。小程序读取失败时回退到本地真实快照，不应白屏。

天梯源说明：

- 主源是国服官方天梯 `https://poe.qq.com/act/a202010118poena/challenge/index.html` 公开 JSON。
- S30 赛季「永火之咒」已开放；脚本会优先尝试 `s30_normal`，官方 JSON 未开放或数据异常时才回退历史快照。
- S29 快照名为 `s29_normal`，赛季名「费西亚的遗产」，仅作为回退和历史参考。
- 详情 JSON 通过官方账号与角色名哈希定位，生成时会跳过 404 或空详情，禁止因部分失败覆盖为空数据。

官方入门流派源说明：

- 默认读取 `base-data/poe1/official_starter_builds_source.json`。
- 当前来源是国服官方 S29 推荐流派活动页 `https://poe.qq.com/act/a20250711sect/`，前台必须标注为“官方入门/历史赛季参考”，不要当成当前赛季强度榜。
- `crawlers/poe1/official_starter.js` 会校验官方活动页是否可访问，并生成 `official_starter_builds.json`。S30 官方推荐页出现后，优先替换 source URL 与结构化源内容，不需要改小程序页面结构。

玩家开荒 BD 源说明：

- 默认读取 `/Users/zhangyajun/Downloads/poe-bd-国服译名校对` 下的 `*.docx`。
- 可用 `POE1_STARTER_SOURCE_DIR` 覆盖来源目录。
- 生成器只做结构化清洗，不判定强度；新增 BD 时优先保证国服译名、职业、主技能、技能链接、装备、天赋、升华和升级流程清楚。
- `starter_terms_enrichment.json` 是开荒 BD 真实数据增强的第一步：先抽取技能、装备、天赋和英文括注，优先匹配国服官方天梯中出现过的真实图标/标准名；未匹配项后续再进入 PoEDB 或人工映射，不直接在前台硬猜。

剧情跑图源说明：

- 默认读取 `/Users/zhangyajun/Documents/project/video2text/output/bilibili_POE_story_BV1W8411p7eX` 下的 B 站剧情整理稿和章节地图素材。
- 可用 `POE1_STORY_SOURCE_DIR` 覆盖来源目录。
- 第 1 章已生成地图点位和箭头；第 2-6 章已有地图图源，后续优先补点位坐标；第 7-10 章暂无独立章节地图，先使用视频分镜图和步骤导航。
- 该数据低频维护，剧情路线大体通用；正式发布前应人工校验新赛季是否改动任务奖励、抗性惩罚和 `/passives` 天赋点检查。

数据边界：只展示公开游戏内数据和人工校对攻略；不提供第三方交易入口。国服行情只作为公开行情参考，核心换算缺失时宁可显示待校准，也不能拿国际服比例冒充国服。

行情源说明：

- 国际服：`economy_digest.json` 来自 poe.ninja POE1 Economy API，展示游戏内混沌石比例和 7 日变化；当前 poe.ninja 返回挑战服 `Allflame`，前台中文展示为「永火之咒」。
- 国服：`cn_economy_digest.json` 合并 DD373 S30 国服公开报价与 `https://price.filtereditor.cn/` 公开网页数据，并支持 `base-data/poe1/cn_economy_manual.json` 人工校准。`available` 表示是否有可展示行情，神圣石/混沌石等核心换算是否齐全看 `sourceHealth.coreCurrencyReady`；前台必须按来源展示，避免把国际服行情误标为国服。

## 自动化

| Workflow | 触发 | 用途 |
|---|---|---|
| `update_economy.yml` | 定时 + 手动 | poe.ninja 首页经济摘要与国际服分类通货目录，并刷新我的关注摘要 |
| `update_cn_market_dd373.yml` | 定时 + 手动 | DD373 国服行情参考，并刷新我的关注摘要 |
| `auto-crawl.yml` | 手动 | 天梯、BD 解析和趋势聚合 |

## 维护边界

需要人工维护：

- `auto_browser/translate_crawler.js`：装备、技能、符文和词缀翻译规则。
- `crawlers/economy/ninja_digest.js`：新经济物品中文映射。
- `base-data/problem-guides/*.json`：流放急救箱问题、排查项和跳转入口。
- `base-data/miniprogram_config/feature_survey.json`：功能调研问题与选项；赛季末通过 Dashboard 的“小程序功能调研”开关同步到 OSS。
- `crawlers/content-research/build_topics.js`：内容研究选题池来源、标签和文章/小程序承接方向；Maxroll、Wowhead、Blizzard 等外部来源只做参考，不搬运全文。
- OSS 密钥与微信合法域名。

历史保留但当前不维护：

- `crawlers/patch05`、`base-data/patch05` 和历史 `patch-0.5` 产物。
- `auto_browser/crawl_news*.js` 与历史新闻产物。
- `auto_browser/crawl_caimogu_essence_full.js`、`transform_caimogu_data.js` 和 starter/精华帖历史数据。

不需要人工编辑：

- `translated-data/{dev|release}` 生成产物。
- `ladder_analysis.json`。
- `economy-history/*.json`。
- `patch05_economy_watch.json`。

## 当前优先级

1. 保证天梯、BD 解析和中文翻译准确。
2. 从天梯数据生成更有价值的职业、技能和装备趋势。
3. 保证国际服通货参考、经济摘要与国服换算稳定。
4. 继续降低 OSS 下行和小程序重复请求。
5. 暂不恢复独立的社区热门 BD/开荒推荐发布链路。
