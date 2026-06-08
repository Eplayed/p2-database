# p2-database 项目说明

> 更新日期：2026-06-05  
> 用途：下次继续开发前，先读本文件，再按需要查看对应爬虫。

## 1. 项目定位

`p2-database` 是微信小程序「PoE2 流放助手」的数据生产端。它不提供线上页面，主要职责是：

1. 从 `poe.ninja`、`poe2db`、踩蘑菇、`poe2ggg` 和人工源数据获取内容。
2. 清洗、翻译、校验并生成适合小程序读取的 JSON。
3. 上传到阿里云 OSS。
4. 通过本地 Dashboard 降低赛季维护时的操作成本。

当前处于 2026-06-05 国服开服观察期。此阶段优先保证新闻、经济、天梯、开荒推荐和剧情地图数据稳定刷新；小程序侧尽量少发版，能通过 OSS JSON 更新的内容优先走数据链路。

数据链路：

```text
外部数据源 / 人工维护
        ↓
爬虫、翻译、聚合、校验
        ↓
translated-data/{dev|release}
        ↓
阿里云 OSS
        ↓
daily-talk 微信小程序
```

## 2. 当前数据管线

| 模块 | 数据源 | 入口命令 | 主要产物 | 自动化 |
|---|---|---|---|---|
| 天梯与玩家详情 | `poe.ninja` Builds | `npm run crawl:ladder` | `all_ladders_translated.json`、`classes.json`、`players/*.json`、`ladder_analysis.json` | GitHub Actions 手动 |
| 职业真实分布刷新 | `poe.ninja` Builds | `npm run refresh:ladder-distribution` | `classes.json`、`ladder_analysis.json` | 手动 |
| poe.ninja 经济摘要 | `poe.ninja` Economy API | `npm run crawl:economy:ninja` | `miniprogram_data/economy_digest.json`、`economy.json`、`economy-icons/*` | GitHub Actions 每日 4 次；Dashboard 可手动 |
| 0.5 资料与经济观察 | `poe2db` + 人工源 + 经济摘要 | `npm run crawl:patch05:with-economy` | `patch-0.5/version.json`、`patch05_catalog.json`、经济 JSON | 经济 Workflow 自动联动；也可手动 |
| 新闻列表与详情 | 踩蘑菇快捷导航 | `npm run crawl:news:all` | `news_caimogu.json`、`news_details/*.json` | GitHub Actions 每天 1 次 |
| 正式开荒推荐 | 人工精选源 + 天梯分析 | `npm run build:starter` | `miniprogram_data/starters.json` | 手动 |
| 热门 BD 候选池 | 踩蘑菇 Planner 接口 | `npm run agent:starter:refresh:dev` | `starter_candidates.json`、`base-data/starter/candidates/*.json` | Codex 自动化收集；人工审核后再提升 |
| 剧情地图攻略 | `poe2ggg` 公共接口 | `npm run crawl:story-guide` | `miniprogram_data/story_guides.json` | 手动 |
| 中英字典 | `poe2db.tw/cn` | `npm run crawl:dict` | `base-data/dist/dict_*.json` | 手动 |

生产环境输出目录：

```text
translated-data/release/
```

OSS 主路径：

```text
poe2-ladders/release/
```

经济摘要与兼容路径：

```text
poe2-ladders/release/miniprogram_data/economy_digest.json
poe2-ladders/release/miniprogram_data/economy-icons/*
poe2-economy/economy.json
poe2-economy/economy_digest.json
```

0.5 资料缓存约定：

- `version.json` 是轻量检查文件，包含由资料内容生成的 `contentVersion`。
- `patch05_catalog.json` 是资料速查页统一读取的玩家资料包。
- `guide_content.json` 提供图文必看机制与 Boss 攻略。Boss 数据必须有来源；未确认的专属掉落应明确标注，不要猜测补全。
- 小程序每 6 小时最多检查一次版本；仅在 `contentVersion` 变化时下载 catalog。
- 旧的拆分 JSON 继续生成，兼容尚未更新的小程序版本。

## 3. 2026-06-02 Release 数据快照

以下数字用于判断抓取是否明显异常，不是长期固定值：

| 数据 | 当前值 |
|---|---:|
| 天梯玩家详情 | 139 |
| 职业分布项 | 31 |
| 正式开荒推荐 | 15 |
| 剧情攻略 | 4 |
| 剧情攻略章节 | 每套最多 6 章 |

如果新一轮抓取结果突然变成 `0`，禁止覆盖 OSS 正式数据。

## 4. Dashboard

启动：

```bash
npm run dashboard
```

打开：

```text
http://localhost:5177
```

Dashboard 适合日常维护：

- 在 `dev` / `release` 间切换。
- 开服期需要快速更新价格时，优先运行 `一键更新经济榜并上传`：
  `poe.ninja 经济摘要 -> 0.5 聚合 -> 上传 OSS`。
- 修复装备词缀、技能、符文/镶嵌翻译，或需要刷新 BD 解析详情时，运行 `刷新天梯/BD解析并上传`：
  `天梯玩家详情 -> 天梯聚合分析 -> 上传 OSS`。
- 日常要同时刷新新闻、经济、0.5 资料和剧情攻略时，运行 `一键更新日常数据并上传`：
  `新闻 -> 经济摘要 -> 0.5 聚合 -> 剧情攻略 -> 上传 OSS`。
- 单独刷新新闻、天梯/BD解析、经济摘要、0.5 资料/经济观察、开荒推荐、剧情攻略。
- 热门 BD 走人工审核流程：`抓取热门 BD 候选` -> 人工检查 -> 必要时 `候选提升到开荒源` -> `发布人工开荒/热门 BD`。
- 需要全量刷新新闻、天梯、经济、0.5 聚合、开荒推荐和剧情攻略时再运行高级区的 `完整刷新全部数据并上传`。
- 查看运行日志、停止长任务。
- 日志默认自动跟随最新输出；手动向上滚动后会暂停，点击“回到底部”恢复自动跟随。

如果端口占用，可先查看已有 Dashboard 是否已经启动：

```bash
lsof -nP -iTCP:5177 -sTCP:LISTEN
```

## 5. 手动维护边界

需要人工维护：

| 文件 | 用途 |
|---|---|
| `base-data/patch05/manual_entries.json` | 0.5 新机制、新通货、新 Boss 的人工源 |
| `base-data/patch05/guide_content.json` | 0.5 图文必看机制与 Boss 解锁、技能、击杀技巧、掉落 |
| `base-data/patch05/overrides.zh-CN.json` | 中文名称、摘要、标签、分类修正 |
| `base-data/starter/starter_builds.json` | 正式开荒推荐源 |
| `base-data/miniprogram_config/feature_survey.json` | 小程序功能调研开关 |
| `auto_browser/translate_crawler.js` 中的名称映射和词缀规则 | 天梯、BD 解析、装备、技能、符文、灵魂核心、镶嵌内容中文化 |
| `crawlers/economy/ninja_digest.js` 中的 `MANUAL_TRANSLATIONS` | 新通货、符文、合金、灵魂核心、族裔辅助宝石、门票中文名补充 |

不应手工编辑：

```text
translated-data/{dev|release}/
```

这些都是生成产物。修改源数据或脚本后重新生成。

## 6. 已知限制

### 热门 BD 候选不是大模型 Agent

`crawlers/starter-agent/index.js` 当前是规则抽取器：

- 从 Markdown / JSON 中识别等级阶段。
- 根据关键词提取技能、天赋、装备、升华、转型。
- 生成低置信度候选和人工审核提示。

它还没有接入大模型。因此“候选 JSON”适合做热门池，不应未经审核直接作为正式开荒攻略。

### 剧情路线会丢失分叉

`crawlers/story-guide/index.js` 当前将每个起点压缩为一个 `nextPointId`。如果一个点存在多个后续路线，后写入的路线会覆盖前面的路线。

下一版应改为：

```json
{
  "nextPointIds": ["point-a", "point-b"],
  "edges": [
    { "from": "point-x", "to": "point-a", "type": "main" },
    { "from": "point-x", "to": "point-b", "type": "branch" }
  ]
}
```

### 开荒清单仍是独立数据源

小程序 `开荒清单` 当前读取：

```text
https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/initialChapters.json
```

它还没有纳入本项目的生成和上传流程。后续如果升级清单数据，建议在本项目新增 `base-data/checklist/` 和生成脚本，避免 OSS 上手工维护单文件。

### 剧情攻略 V2 的方向

参考 [LiazR/Poe2Storyguide](https://github.com/LiazR/Poe2Storyguide)：

- 保留当前小程序的地图概览和轻量交互。
- 增加统一步骤模型：`description`、`badge`、`steps`、`images`。
- 节点图片只在用户点开详情时从 OSS 按需加载。
- 不把大量节点截图放入小程序主包，也不在进入页面时预加载全部图片。

## 7. 6 月 5 日国服开服前操作

### 开服前 1-2 天

1. 在 Dashboard 的 `release` 环境运行：
   `一键更新 0.5 日常数据`。
2. 手动检查：
   `manual_entries.json`、`overrides.zh-CN.json`、`starter_builds.json`。
3. 确认 GitHub Actions：
   `update_economy.yml` 与 `update_news.yml` 最近执行成功。
4. 关闭功能调研：
   `feature_survey.json` 中保持 `enabled: false`。

### 国服开服当天

国际服数据可以继续作为先行参考，但国服经济和玩家偏好可能不同：

1. 新闻保持每日更新。
2. 经济每 4-6 小时跑一次 Dashboard 的 `一键更新 0.5 经济榜`，确认小程序市场页不再显示旧行情。
3. 开荒推荐保留“人工精选 / 国际服验证”语义，不把国际服热度写成国服结论。
4. 观察用户反馈，优先修复数据错误，不增加大功能。

### 开服后 24-72 小时

1. 跑天梯与职业真实分布，检查 `0` 数据保护是否生效。
2. 重新生成正式开荒推荐：

```bash
npm run build:starter
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

3. 先抓热门 BD 候选：

```bash
npm run crawl:starter-hot
npm run agent:starter
```

4. 查看 `translated-data/release/miniprogram_data/starter_candidates.json` 和
   `base-data/starter/candidates/*.json`。确认适合首发开荒后再执行：

```bash
npm run agent:starter:promote
npm run build:starter
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

5. 根据真实掉落和行情继续补充 `MANUAL_TRANSLATIONS`，优先校准符文、合金、族裔宝石、Boss 门票和开荒材料中文名。

注意：`npm run data:starter:publish` 会自动抓取、提升、生成并上传，适合已经确认候选质量后的快捷发布，不适合第一次抓取后盲跑。

## 8. 下一步优先级

### P0：支撑首页随身信息流

完整计划见 `docs/20260604_MOBILE_SEASON_ASSISTANT_DATA_PLAN.md`。

- 继续生成 `miniprogram_data/economy_digest.json`，首页只拉摘要。
- 经济物品补充移动端用途标签和规则建议。
- 首页热门 BD 输出轻量字段，不依赖全量帖子正文。
- 新闻数据标记重要程度，方便首页只展示最值得看的内容。

### P1：支撑收藏和移动阅读

- 为 BD、经济物品、Boss、机制资料提供稳定 `id`。
- 资料条目输出短文本字段：是什么、为什么重要、怎么获得、怎么用、注意事项。
- BD 详情补阶段结构。
- 热门 BD 候选增加质量字段，但仍需人工审核。

### P2：支撑工具导航和剧情增强

- 新增可维护的工具导航数据源。
- 剧情地图修复分叉路线模型。
- 点位增加结构化奖励类型和章节奖励汇总。
- 增加国服名/国际服名字段。
