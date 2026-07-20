# PoE2-Database 数据项目

为微信小程序「PoE2 流放助手」生产天梯、BD 解析、经济、国服换算、急救箱和剧情地图 JSON，并上传到阿里云 OSS。

数据链路：`poe.ninja / poe2db / DD373 / poe2ggg / 人工源 -> JSON -> OSS -> 小程序`。

首次接手先读：

- `docs/PROJECT_OVERVIEW.md`
- `docs/DESIGN.md`
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
- 流放急救箱：人工确认的问题排查清单，跳转到天梯、经济、清单等已有工具。
- 翻译字典：poe2db 中文数据与人工映射。
- poe.ninja 经济：首页轻量摘要与国际服分类通货参考；完整目录仅在用户打开国际服页时加载。
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
   poe.ninja 经济（首页摘要 + 国际服通货目录） -> DD373 -> 流放急救箱 -> 首页复访摘要 -> OSS。
2. `刷新天梯/BD解析并上传`
   天梯玩家详情 -> BD 解析 -> 趋势聚合 -> 技能/装备查 BD 索引 -> 首页复访摘要 -> OSS。
隐藏步骤仅供上述组合任务调用，不单独展示。

剧情攻略变化很少，不在 Dashboard 日常任务中；需要时使用命令行单独刷新。

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

# 剧情地图，低频手动维护
npm run crawl:story-guide
npm run crawl:story-guide:upload

# 上传当前 release 产物
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

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

## 自动化

| Workflow | 触发 | 用途 |
|---|---|---|
| `update_economy.yml` | 定时 + 手动 | poe.ninja 首页经济摘要与国际服分类通货目录 |
| `update_cn_market_dd373.yml` | 定时 + 手动 | DD373 国服行情参考 |
| `auto-crawl.yml` | 手动 | 天梯、BD 解析和趋势聚合 |

## 维护边界

需要人工维护：

- `auto_browser/translate_crawler.js`：装备、技能、符文和词缀翻译规则。
- `crawlers/economy/ninja_digest.js`：新经济物品中文映射。
- `base-data/problem-guides/*.json`：流放急救箱问题、排查项和跳转入口。
- `base-data/miniprogram_config/feature_survey.json`：功能调研问题与选项；赛季末通过 Dashboard 的“小程序功能调研”开关同步到 OSS。
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
