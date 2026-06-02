# p2-database 项目说明

> 更新日期：2026-06-02  
> 用途：下次继续开发前，先读本文件，再按需要查看对应爬虫。

## 1. 项目定位

`p2-database` 是微信小程序「PoE2 流放助手」的数据生产端。它不提供线上页面，主要职责是：

1. 从 `poe.ninja`、`poe2db`、踩蘑菇、`poe2ggg` 和人工源数据获取内容。
2. 清洗、翻译、校验并生成适合小程序读取的 JSON。
3. 上传到阿里云 OSS。
4. 通过本地 Dashboard 降低赛季维护时的操作成本。

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
| 通用经济 | `poe.ninja` Economy | `npm run crawl:economy` | `economy.json` | GitHub Actions 每日 4 次 |
| 0.5 资料与经济观察 | `poe2db` + 人工源 + `economy.json` | `npm run crawl:patch05:with-economy` | `patch-0.5/version.json`、`patch05_catalog.json`、经济 JSON | 经济 Workflow 自动联动；也可手动 |
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

通用经济兼容路径：

```text
poe2-economy/economy.json
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
- 日常优先运行置顶的 `一键更新 0.5 日常数据`：
  `新闻 -> 经济与 0.5 聚合 -> 剧情攻略 -> 上传 OSS`。
- 需要重新抓天梯时再运行 `一键完整刷新`。
- 单独刷新新闻、天梯、经济与 0.5 聚合、开荒推荐、剧情攻略。
- 抓取热门 BD 帖、生成候选、人工审核后发布。
- 查看运行日志、停止长任务。
- 日志默认自动跟随最新输出；手动向上滚动后会暂停，点击“回到底部”恢复自动跟随。
- 一键运行推荐发布流程。

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
| `auto_browser/crawl_economy.js` 中的 `MANUAL_DICT` | 新通货中文名补充 |

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
2. 经济每 4-6 小时检查一次，确认有真实行情再把状态从“待行情”改为“可参考”。
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

5. 根据真实掉落和行情拆细符文、合金、Boss 门票等经济分类。

注意：`npm run data:starter:publish` 会自动抓取、提升、生成并上传，适合已经确认候选质量后的快捷发布，不适合第一次抓取后盲跑。

## 8. 下一步优先级

### P0：国服开服稳定性

- 数据抓取失败不得覆盖 release。
- 每日看经济、新闻 Workflow 是否成功。
- 人工复核开荒推荐和 0.5 中文名称。

### P1：剧情攻略 V2

- 修复路线分叉模型。
- 给点位增加结构化奖励类型。
- 增加可选步骤说明和按需节点图片。
- 把坐标校验做进 Dashboard。

### P2：开荒推荐增强

- 热门 BD 候选接入真正的大模型结构化抽取。
- 增加人工审核工作台。
- 明确区分“热门 BD”和“适合首发开荒”。

### P3：低成本数据洞察

- 经济历史趋势。
- 24 小时职业与技能升温榜。
- 国服反馈收集开关和高频问题统计。
