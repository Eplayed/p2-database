# PoE2-Database 数据项目

> 为微信小程序「PoE2 流放助手」提供 PoE2 天梯、新闻、经济、0.5 资料、开荒推荐、剧情地图攻略等数据。  
> 数据链路：poe.ninja / poe2db / 踩蘑菇 / poe2ggg / 人工精选源数据 -> 本项目生成 JSON -> 阿里云 OSS -> 小程序读取。

## 2026-06-05 国服开服观察期

当前先以稳定更新数据为主，不再盲目扩功能：

- 日常优先跑 Dashboard 的 `一键更新 0.5 日常数据` 或 `一键更新 0.5 经济榜`。
- 经济摘要、新闻、天梯、热门 BD 候选和剧情地图都应先生成 JSON，再上传 OSS 给小程序读取。
- 热门 BD 候选仍需要人工审核，不要未经确认直接覆盖正式开荒推荐。
- 开服前几天重点观察：经济价格是否异常、中文翻译是否缺失、天梯是否抓到 0 数据、新闻是否及时、剧情地图奖励是否有错。
- 只有小程序代码或页面结构变化才需要重新发版；单纯数据更新只需刷新 OSS。

首次接手或准备新功能前，先读：

- `docs/PROJECT_OVERVIEW.md`
- `AGENT.md`

## 当前状态

- 天梯数据：抓取 poe.ninja 页面数据，生成天梯索引、玩家详情、职业统计和 `ladder_analysis.json`。
- 新闻数据：抓取踩蘑菇快捷导航和新闻详情，输出 `news_caimogu.json` 与 `news_details/*`。
- poe.ninja 经济摘要：直接请求 poe.ninja PoE2 Economy API，输出 `miniprogram_data/economy_digest.json`、兼容 `economy.json` 和 `miniprogram_data/economy-icons/*`。
- 国服 DD373 行情试运行：抓取 DD373「流放之路：降临 / 奥杜尔秘符赛季」核心通货公开商品列表，输出 `miniprogram_data/cn_market_digest.json`。这是行情参考，不承诺实时成交价。
- 0.5 资料：从 poe2db 和人工维护数据生成 `patch-0.5/*.json`；新版小程序读取轻量 `version.json` 和统一 `patch05_catalog.json`。图文必看机制与 Boss 攻略维护在 `base-data/patch05/guide_content.json`。
- 0.5 新经济观察：基于 `economy_digest.json` / `economy.json` 生成 `patch05_economy.json` 和 `patch05_economy_watch.json`，同时小程序市场页直接读取经济摘要展示核心汇率、新经济、符文合金、开荒材料、终局门票和涨跌榜。
- 开荒推荐 MVP：由人工精选源 `base-data/starter/starter_builds.json` 生成小程序用 `miniprogram_data/starters.json`。
- 热门 BD 候选池：可定期抓取踩蘑菇热门 BD 帖到 `base-data/starter/agent_posts`，再由 `agent:starter` 生成候选 JSON，人工审核后再进入正式开荒推荐。
- 剧情地图攻略：抓取 poe2ggg 公开剧情攻略接口，输出 `miniprogram_data/story_guides.json`，包含章节地图、点位坐标、奖励和路线提示。
- OSS 上传：统一上传 `translated-data/{dev|release}` 下的产物。

## 目录结构

```text
p2-database/
├── auto_browser/
│   ├── crawl_economy.js                 # 通用经济行情
│   ├── crawl_news*.js                   # 踩蘑菇新闻
│   ├── translate_crawler.js             # 天梯页面抓取入口
│   ├── upload_to_oss.js                 # OSS 上传
│   └── env-config.js                    # dev/release 路径配置
├── base-data/
│   ├── patch05/                         # 0.5 资料人工源与中文覆盖
│   └── starter/starter_builds.json      # 开荒推荐人工精选源
├── crawlers/
│   ├── run.js                           # 统一入口
│   ├── economy/                         # poe.ninja 经济摘要与图标保存
│   ├── cn-market/                       # 国服 DD373 行情试运行
│   ├── patch05/                         # 0.5 资料与经济观察管线
│   ├── starter/                         # 开荒推荐生成
│   ├── starter-agent/                   # 热门 BD 帖候选抓取与结构化抽取
│   ├── story-guide/                     # 剧情地图攻略抓取
│   └── poe2db-dict/                     # poe2db 字典抓取
├── scripts/
│   ├── aggregate_analysis.js            # 天梯统计聚合
│   └── upload_analysis.js               # 天梯统计上传
├── translated-data/
│   ├── dev/                             # 开发环境输出
│   └── release/                         # 生产环境输出
└── docs/                                # 工作计划与维护文档
```

## 常用命令

```bash
# 安装依赖
npm install

# 天梯数据，生产环境
npm run crawl:ladder

# 天梯数据并上传 OSS，生产环境
CI=true NODE_ENV=production node crawlers/run.js --ladder --upload

# 天梯数据，开发环境
npm run crawl:ladder:dev

# 新闻列表 + 详情，生产环境
npm run crawl:news:all

# 0.5 资料，生产环境
npm run crawl:patch05

# 0.5 资料，开发环境
npm run crawl:patch05:dev

# 只刷新 poe.ninja 经济摘要，生产环境
npm run crawl:economy:ninja

# 只刷新 poe.ninja 经济摘要，开发环境
npm run crawl:economy:ninja:dev

# 只刷新 DD373 国服核心通货行情，生产环境
npm run crawl:cn-market:dd373

# 刷新 DD373 国服核心通货行情并上传 OSS，生产环境
npm run data:cn-market:publish

# 刷新经济摘要，并重新生成 0.5 新经济观察
npm run crawl:patch05:with-economy

# 一键更新 0.5 经济榜：经济摘要 -> 0.5 聚合 -> 上传 OSS
npm run data:economy:publish

# 日常一键更新：新闻 -> 经济与 0.5 聚合 -> 剧情攻略 -> 上传 OSS
npm run data:patch05:publish

# 生成开荒推荐，生产环境
npm run build:starter

# 生成开荒推荐，开发环境
npm run build:starter:dev

# 抓取踩蘑菇热门 BD 帖到 agent_posts，生产环境
npm run crawl:starter-hot

# 抓取踩蘑菇热门 BD 帖到 agent_posts，开发环境
npm run crawl:starter-hot:dev

# 从 agent_posts 抽取候选 JSON，开发环境
npm run agent:starter:dev

# 把候选池中适合开荒的 BD 提升到正式开荒源
npm run agent:starter:promote

# 抓取热门 BD 帖并立即生成候选 JSON，开发环境
npm run agent:starter:refresh:dev

# 完整刷新开荒/热门BD数据并上传 OSS，生产环境
npm run data:starter:publish

# 抓取剧情地图攻略，生产环境
npm run crawl:story-guide

# 抓取剧情地图攻略并单独上传 OSS
npm run crawl:story-guide:upload

# 上传 translated-data/{env} 到 OSS
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

天梯爬虫会从 poe.ninja `index-state` 自动选择当前已索引的国际服赛季。排查历史赛季时，可临时使用 `POE_NINJA_LEAGUE=<league-url>` 覆盖自动选择结果。抓取结果为空时脚本会直接失败退出，不会覆盖已有 release 数据。

经济爬虫也会自动选择当前已索引的国际服赛季。生产上传时会同时更新：

```text
poe2-ladders/release/miniprogram_data/economy_digest.json
poe2-ladders/release/miniprogram_data/economy-icons/*
poe2-ladders/release/economy.json
poe2-economy/economy.json
poe2-economy/economy_digest.json
poe2-economy/cn_market_digest.json
```

`economy_digest.json` 是小程序优先读取的精简摘要，当前约 100KB；完整行情只写入本地 `economy_raw.json` 排查用，不上传 OSS。

`cn_market_digest.json` 是国服行情试运行摘要，当前只抓 DD373 的神圣石、崇高石、混沌石三个核心通货。GitHub Actions `update_cn_market_dd373.yml` 每 15 分钟触发一次，并随机等待 0-300 秒后抓取，实际访问间隔约 10-20 分钟。先观察几天数据稳定性，再决定是否接入小程序页面。

## 开服后推荐操作

0.5 开服后，建议按下面顺序跑数据：

```bash
cd /Users/zhangyajun/Documents/project/p2-database

# 1. 刷新新闻
npm run crawl:news:all

# 2. 刷新 poe.ninja 经济摘要 + 0.5 新经济观察
npm run crawl:patch05:with-economy

# 3. 刷新真实天梯数据
CI=true NODE_ENV=production node crawlers/run.js --ladder --upload

# 4. 用最新天梯分析重新生成开荒推荐
npm run build:starter

# 5. 上传所有 release 数据
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

建议节奏：

- 开服前：每天跑一次 `npm run crawl:patch05`，确认资料结构正常。
- 开服当天：每 4-6 小时跑一次 `npm run crawl:patch05:with-economy`，积累经济快照。
- 开服后 12-24 小时：跑天梯，观察真实职业/升华热度。
- 开服后 3 天：根据真实行情和天梯，把人工源数据里的概念条目拆细、调整开荒推荐评分。

## 热门 BD 候选池

热门 BD 候选池的目标是“先收集、再审核”，不自动覆盖正式推荐榜。

```bash
cd /Users/zhangyajun/Documents/project/p2-database

# 1. 抓取热门 BD 帖文本到 base-data/starter/agent_posts
npm run crawl:starter-hot:dev

# 2. 把 agent_posts 转成候选 JSON
npm run agent:starter:dev

# 3. 人工确认候选质量后，把适合开荒的候选提升到正式开荒源
npm run agent:starter:promote

# 4. 重新生成小程序 starters.json
npm run build:starter

# 或生产环境一条命令完成：抓取 -> 候选 -> 提升 -> 生成 -> 上传 OSS
# 注意：它会自动提升候选，只在已确认候选质量后使用。
npm run data:starter:publish
```

产物：

```text
base-data/starter/agent_posts/caimogu-hot-bd-*.md
base-data/starter/hot_posts_manifest.json
base-data/starter/candidates/*.json
translated-data/{dev|release}/miniprogram_data/starter_candidates.json
```

可选参数：

```bash
# 只抓前 10 条
NODE_ENV=dev node crawlers/starter-agent/crawl_hot_posts.js --limit=10

# 只抓列表摘要，不进入详情页
NODE_ENV=dev node crawlers/starter-agent/crawl_hot_posts.js --no-detail

# 保留旧的自动抓取输入文件
NODE_ENV=dev node crawlers/starter-agent/crawl_hot_posts.js --keep-old

# 默认无头运行；需要观察浏览器时再打开可视浏览器
NODE_ENV=dev node crawlers/starter-agent/crawl_hot_posts.js --headed
```

2 天一次的定时抓取使用 Codex 自动化配置，不放在 GitHub Actions，也不使用 macOS `launchd`。如果只是收集素材，自动化运行 `npm run crawl:starter-hot:dev` 即可；如果要让小程序线上两个 tab 都更新，运行 `npm run data:starter:publish`。

小程序数据更新关系：

- `赛季开荒` 读取 OSS 的 `miniprogram_data/starters.json`，由 `starter_builds.json` 生成。
- `热门BD` 读取 OSS 的 `miniprogram_data/starter_candidates.json`，小程序端会过滤开荒/升级/备战条目，只展示非开荒热门 BD。
- 发布过支持新版缓存和热门BD tab 的小程序后，后续只要刷新 OSS 数据即可更新页面内容；不需要重新上传代码包。

## 输出到 OSS 的关键文件

```text
poe2-ladders/release/
├── all_ladders_translated.json
├── classes.json
├── ladder_analysis.json
├── players/*.json
├── news_caimogu.json
├── news_details/*.json
├── miniprogram_data/
│   ├── community.json
│   ├── community_full.json
│   ├── starters.json
│   ├── starter_candidates.json
│   └── story_guides.json
├── miniprogram_config/
│   └── feature_survey.json
└── patch-0.5/
    ├── version.json
    ├── patch05_catalog.json
    ├── patch05_index.json
    ├── patch05_items.json
    ├── patch05_runes.json
    ├── patch05_currencies.json
    ├── patch05_economy.json
    ├── patch05_economy_watch.json
    ├── patch05_kalguuran_gems.json
    ├── patch05_bosses.json
    ├── patch05_endgame_checklist.json
    └── patch05_sources.json
```

`version.json` 包含由资料内容生成的 `contentVersion`。小程序每 6 小时最多检查一次版本，只有内容变化时才下载 `patch05_catalog.json`。经济数据仍由市场页按需加载，不会跟资料页一起重复下载。

通用经济仍上传到：

```text
poe2-economy/economy.json
```

## 自动化

| Workflow | 触发 | 当前用途 |
|---|---|---|
| `update_economy.yml` | 定时 + 手动 | 刷新通用经济、0.5 经济观察并上传 |
| `update_news.yml` | 定时 + 手动 | 刷新踩蘑菇新闻列表与详情 |
| `update_patch05.yml` | 手动 | 刷新 0.5 资料、经济观察、开荒推荐相关数据 |
| `auto-crawl.yml` | 手动 | 刷新天梯、分析、开荒推荐 |
| `essence_builds.yml` | 手动 | 踩蘑菇精华帖/BD 相关数据 |

注意：已取消“push 自动执行天梯翻译爬虫”和“自动执行踩蘑菇精华帖 BD”。这些任务需要手动触发，避免误跑和消耗。

## 本地数据控制台

为了减少新赛季维护时反复输入命令，项目提供了一个本地可视化控制台：

```bash
npm run dashboard
```

启动后打开：

```text
http://localhost:5177
```

第一版控制台支持：

- 切换 `release` / `dev` 环境。
- 一键发布：
  - `一键更新经济榜并上传`：poe.ninja 经济摘要 -> 0.5 经济观察 -> 上传 OSS。开服期价格更新优先跑这个。
  - `刷新天梯/BD解析并上传`：天梯玩家详情 -> 天梯聚合分析 -> 上传 OSS。修复装备词缀、技能、符文/镶嵌翻译后优先跑这个。
  - `一键更新日常数据并上传`：新闻 -> 经济摘要 -> 0.5 资料/经济观察 -> 剧情地图攻略 -> 上传 OSS。
- 单项更新：新闻、天梯/BD解析、经济摘要、0.5 资料/经济观察、开荒推荐、剧情地图攻略、上传 OSS。
- BD 候选 / 开荒推荐：
  - `抓取热门 BD 候选`：抓帖 -> 抽候选，只生成候选池，不自动提升到正式推荐。
  - `发布人工开荒/热门 BD`：基于已人工维护的开荒源生成并上传。
  - `候选提升到开荒源` 标记为谨慎，必须人工检查候选后再运行。
- 高级与排障：`完整刷新全部数据并上传`。耗时长，只在发布前校验、数据混乱或大版本维护时使用。
- 查看每个任务上次运行状态、运行时间和日志。
- 运行中可以点击“停止当前任务”终止长任务。
- 日志默认自动滚动到底部；手动向上滚动后会暂停跟随，点击“回到底部”恢复。
- 查看当前环境输出摘要：文件数量、天梯人数、新闻条数、开荒 BD 条数、0.5 资料条数、调研配置状态。

运行日志和状态写入 `dashboard/runtime/`，该目录只保留本地运行状态，不需要提交。

## 需要手动维护

- `base-data/patch05/manual_entries.json`
  - 0.5 新物品、新符文、新合金、新 Boss、新机制的人工源。
  - 开服后要把“合金通货/古代符文”这类概念条目拆成具体物品。
- `base-data/patch05/overrides.zh-CN.json`
  - 中文名、摘要、标签、分类修正。
- `base-data/starter/starter_builds.json`
  - 开荒推荐人工精选源。
  - 开服后根据真实天梯、价格和社区反馈调整 `tier`、`starterScore`、标签和说明。
- `crawlers/patch05/economy.js`
  - 经济观察阈值。当前逻辑：35% 以上高波动，快照 3 次以上且波动小于 12% 可参考。
- `auto_browser/translate_crawler.js`
  - 天梯与 BD 解析的中文翻译入口。
  - 新赛季如果装备词缀、技能、符文、灵魂核心、镶嵌内容出现英文残留，优先补这里的名称映射和词缀规则，然后在 Dashboard 跑 `刷新天梯/BD解析并上传`。
- `crawlers/economy/ninja_digest.js` 中的 `MANUAL_TRANSLATIONS`
  - 经济页的新通货、符文、合金、灵魂核心、族裔辅助宝石中文名补充。
  - 修改后跑 Dashboard 的 `一键更新 0.5 经济榜` 或 `npm run crawl:economy:ninja` 验证。
- `base-data/miniprogram_config/feature_survey.json`
  - 小程序功能调研开关和选项。赛季初保持 `enabled: false`，赛季末需要调研时改为 `true` 后上传 OSS。
- OSS 密钥与微信合法域名配置。

## 不需要手动维护

- `translated-data/{dev|release}` 下的生成产物。
- `patch05_economy_watch.json` 的摘要、状态、涨跌雷达。
- `economy-history/*.json` 快照历史。
- `miniprogram_data/starters.json`，由 `build:starter` 生成。
- `ladder_analysis.json`，由天梯爬虫后的聚合脚本生成。

## 后续路线图

小程序后续定位调整为“移动端赛季助手”，p2-database 的重点也从全量堆数据转为提供小而准的摘要、标签和移动阅读字段。

详细计划见：

- `docs/20260604_MOBILE_SEASON_ASSISTANT_DATA_PLAN.md`

### P0：支撑首页随身信息流

- 继续生成 `miniprogram_data/economy_digest.json`，首页只拉摘要。
- 为经济物品补充移动端用途标签：核心汇率、开荒可卖、终局门票、做装材料、涨幅异常、高成交量。
- 为经济物品补充规则建议：留 / 卖 / 关注。
- 为首页热门 BD 提供轻量字段：职业、主技能、适合场景、造价、操作难度、来源、更新时间。
- 新闻数据标记重要程度：版本更新、开服信息、机制说明、社区热帖。

### P1：支撑收藏和移动阅读

- 为 BD、经济物品、Boss、机制资料提供稳定 `id`。
- 资料条目输出短文本字段：是什么、为什么重要、怎么获得、怎么用、注意事项。
- BD 详情补阶段结构：1-20、20-40、40-70、异界初期。
- 热门 BD 候选增加质量字段，但仍需人工审核后才能发布。

### P2：支撑工具导航和剧情增强

- 新增可维护的工具导航数据源。
- 剧情地图修复分叉路线模型。
- 点位增加结构化奖励类型和章节奖励汇总。
- 增加国服名/国际服名字段。
- 坐标校验继续放到 Dashboard 或脚本中，避免错误点位上线。

## 深入说明

- `docs/PROJECT_OVERVIEW.md`
  - 完整数据管线、手动维护边界、已知限制、Dashboard 使用方式。
  - 2026 年 6 月 5 日国服开服前后的操作清单。
- `docs/20260604_MOBILE_SEASON_ASSISTANT_DATA_PLAN.md`
  - 移动端赛季助手对应的数据支持 P0-P2。
  - 剧情攻略 V2 与热门 BD Agent 的后续方向。

## 相关文档

- `docs/20260522_PATCH05_DATA_PLAN.md`
- `docs/20260522_STARTER_MVP_PLAN.md`
- `docs/20260523_PATCH05_ECONOMY_WATCH_MAINTENANCE.md`
