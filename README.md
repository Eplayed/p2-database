# PoE2-Database 数据项目

> 为微信小程序「PoE2 流放助手」提供 PoE2 天梯、新闻、经济、0.5 资料、开荒推荐、剧情地图攻略等数据。  
> 数据链路：poe.ninja / poe2db / 踩蘑菇 / poe2ggg / 人工精选源数据 -> 本项目生成 JSON -> 阿里云 OSS -> 小程序读取。

首次接手或准备新功能前，先读：

- `docs/PROJECT_OVERVIEW.md`
- `AGENT.md`

## 当前状态

- 天梯数据：抓取 poe.ninja 页面数据，生成天梯索引、玩家详情、职业统计和 `ladder_analysis.json`。
- 新闻数据：抓取踩蘑菇快捷导航和新闻详情，输出 `news_caimogu.json` 与 `news_details/*`。
- 通用经济：抓取 poe.ninja currency 行情，输出 `economy.json`。
- 0.5 资料：从 poe2db 和人工维护数据生成 `patch-0.5/*.json`；新版小程序读取轻量 `version.json` 和统一 `patch05_catalog.json`。
- 0.5 新经济观察：生成 `patch05_economy.json` 和 `patch05_economy_watch.json`，支持待行情、观察中、可参考、高波动状态。
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

# 刷新通用经济，并重新生成 0.5 新经济观察
npm run crawl:patch05:with-economy

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

经济爬虫也会自动选择当前已索引的国际服赛季。生产上传时会同时更新 `poe2-ladders/release/economy.json` 和小程序仍在使用的兼容路径 `poe2-economy/economy.json`。

## 开服后推荐操作

0.5 开服后，建议按下面顺序跑数据：

```bash
cd /Users/zhangyajun/Documents/project/p2-database

# 1. 刷新新闻
npm run crawl:news:all

# 2. 刷新通用经济 + 0.5 新经济观察
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
- 常用流程置顶：
  - `一键更新 0.5 日常数据`：新闻 -> 经济与 0.5 聚合 -> 剧情地图攻略 -> 上传 OSS。
  - `一键完整刷新`：新闻 -> 天梯 -> 经济与 0.5 聚合 -> 开荒推荐 -> 剧情地图攻略 -> 上传 OSS。
  - `抓取热门 BD + 抽候选`：只生成候选池，不自动提升到正式推荐。
- 单项更新：新闻、天梯、经济与 0.5 聚合、开荒推荐、剧情地图攻略、上传 OSS。
- 高级与排障：仅抓经济、仅生成 0.5 资料、热门 BD 拆分步骤、候选提升与谨慎发布。
- 单独运行：抓取热门 BD 帖、抽取 BD 候选 JSON。
- 单独运行“刷新经济 + 生成 0.5 数据”，对应 `update_economy.yml` 里“刷新通用经济 + 重新生成 0.5 经济观察”的本地版本。
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

### P0：提测前保持稳定

- 确认 `update_economy.yml` 能稳定生成并上传 `patch05_economy_watch.json`。
- 确认 `crawl:news:all` 上传后的新闻在小程序首页展示最新 0.5 内容。
- 保持小程序读取路径不再变动。

### P1：开服后 24 小时

- 跑真实天梯数据，校准开荒推荐的热度和排序。
- 检查 0.5 新经济物品是否开始出现在 poe.ninja 行情里。
- 给 `manual_entries.json` 补充具体符文/合金名称和 alias。

### P2：开服后 3 天

- 把“0.5 预选”开荒推荐改成“天梯验证/社区验证/观察中”。
- 新经济观察增加更细分类：Boss 门票、符文、合金、特殊底材。
- 社区热门 BD 只做候选池，不自动进入推荐榜。

### P3：长期

- 做经济历史趋势图数据。
- 做 BD 候选审核流：社区抓取 -> 候选 JSON -> 人工确认 -> starters.json。
- 根据广告流量，优先强化高打开频率功能：经济观察、开荒推荐、天梯分析、新闻。

## 深入说明

- `docs/PROJECT_OVERVIEW.md`
  - 完整数据管线、手动维护边界、已知限制、Dashboard 使用方式。
  - 2026 年 6 月 5 日国服开服前后的操作清单。
  - 剧情攻略 V2 与热门 BD Agent 的后续方向。

## 相关文档

- `docs/20260522_PATCH05_DATA_PLAN.md`
- `docs/20260522_STARTER_MVP_PLAN.md`
- `docs/20260523_PATCH05_ECONOMY_WATCH_MAINTENANCE.md`
