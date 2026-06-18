# AGENT.md

## 项目定位

`p2-database` 是「PoE2 流放助手」的数据生产端。核心任务是稳定生成 JSON 并上传 OSS，不是制作独立网站。

开始开发前先读 `docs/PROJECT_OVERVIEW.md`。

## 当前主线

1. poe.ninja 天梯与玩家 BD 解析。
2. 装备、技能、符文、天赋和词缀中文翻译。
3. poe.ninja 经济摘要与 DD373 国服行情参考。
4. 0.5 资料、Boss 和终局清单。
5. 新闻与低频剧情地图数据。

## 已下架功能

2026-06-18 起，小程序不再提供独立“赛季开荒/热门 BD”。

- 不要新增或恢复 starter Dashboard 任务。
- 不要把 starter 生成加入 GitHub Actions。
- 不要继续上传新的 `starters.json` 或 `starter_candidates.json`。
- `crawlers/starter*`、`base-data/starter` 只作为历史材料保留。
- 新的热门 BD 能力应基于 poe.ninja 天梯真实玩家数据建设。

## 当前发布链路

- 日常：新闻 -> poe.ninja 经济 -> 0.5 -> DD373 -> OSS。
- 天梯：poe.ninja 天梯 -> 玩家详情/BD解析 -> 聚合分析 -> OSS。
- 剧情地图：低频手动刷新，不进入日常组合任务。

## 关键约束

- 天梯抓到 0 个职业或 0 位玩家时必须失败，禁止覆盖 release 数据。
- 赛季中优先做兼容性改动，不随意改变 OSS JSON 结构。
- 新英文残留优先补权威中文映射，不能用生硬逐词替换冒充准确翻译。
- OSS 上传入口是 `auto_browser/upload_to_oss.js`。
- 0.5 内容源是 `base-data/patch05/guide_content.json`，未确认内容必须明确标注。
- 不要修改或删除用户尚未提交的 `base-data/starter` 历史数据。

## 常用命令

- `npm run dashboard`
- `npm run crawl:ladder`
- `npm run crawl:economy:ninja`
- `npm run crawl:patch05:with-economy`
- `npm run crawl:news:all`
- `npm run crawl:cn-market:dd373`
- `npm run crawl:story-guide`

## 推荐工作方式

先跑 dev 或读取现有产物，再检查 JSON，再决定是否上传。任何可能覆盖 release 的任务都要先验证非空和更新时间。
