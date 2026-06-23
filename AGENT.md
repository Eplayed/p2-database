# AGENT.md

## 项目定位

`p2-database` 是「PoE2 流放助手」的数据生产端。核心任务是稳定生成 JSON 并上传 OSS，不是制作独立网站。

开始开发前先读：

- `docs/PROJECT_OVERVIEW.md`
- 涉及 Dashboard 时读 `docs/DESIGN.md`

## 开发原则

1. 先定义输入、输出、失败条件和验证命令，再修改抓取或生成逻辑。
2. 优先最简单的数据管线，不增加没有当前使用方的字段和配置。
3. 只修改需求涉及的爬虫、转换器和产物，不顺手整理无关历史目录。
4. 清理本次改动产生的无用调用和文件；用户已有的脏工作区内容不得回滚。
5. 数据修改必须验证非空、结构、更新时间和关键中文字段；会上传 OSS 的改动先在 dev 或本地产物验证。

## 测试优先级

优先为纯数据逻辑建立可重复测试：

- 天梯空数据保护。
- 装备、技能、符文和词缀翻译。
- 经济单位和中文名归一化。
- JSON schema/必填字段校验。
- 上传文件白名单与兼容路径。

网络爬虫难以稳定测试时，用保存的最小响应 fixture 测试解析器，不把真实网站请求当单元测试。

## 当前主线

1. poe.ninja 天梯与玩家 BD 解析。
2. 装备、技能、符文、天赋和词缀中文翻译。
3. poe.ninja 经济摘要与 DD373 国服行情参考。
4. 0.5 资料、Boss 和终局清单。
5. 流放急救箱：人工确认的问题排查清单，动态给小程序读取。
6. 新闻与低频剧情地图数据。

## 已下架功能

2026-06-18 起，小程序不再提供独立“赛季开荒/热门 BD”。

- 不要新增或恢复 starter Dashboard 任务。
- 不要把 starter 生成加入 GitHub Actions。
- 不要继续上传新的 `starters.json` 或 `starter_candidates.json`。
- `crawlers/starter*`、`base-data/starter` 只作为历史材料保留。
- 新的热门 BD 能力应基于 poe.ninja 天梯真实玩家数据建设。

## 当前发布链路

- 日常：新闻 -> poe.ninja 经济 -> 0.5 -> DD373 -> 流放急救箱 -> OSS。
- 天梯：poe.ninja 天梯 -> 玩家详情/BD解析 -> 聚合分析 -> 技能/装备查 BD 索引 -> OSS。
- 剧情地图：低频手动刷新，不进入日常组合任务。

## 关键约束

- 天梯抓到 0 个职业或 0 位玩家时必须失败，禁止覆盖 release 数据。
- 赛季中优先做兼容性改动，不随意改变 OSS JSON 结构。
- 新英文残留优先补权威中文映射，不能用生硬逐词替换冒充准确翻译。
- OSS 上传入口是 `auto_browser/upload_to_oss.js`。
- 0.5 内容源是 `base-data/patch05/guide_content.json`，未确认内容必须明确标注。
- 急救箱内容源是 `base-data/problem-guides/*.json`，不要用 AI 直接生成未审核结论；前台只展示玩家问题、排查项和下一步工具。
- 不要修改或删除用户尚未提交的 `base-data/starter` 历史数据。

## 常用命令

- `npm run dashboard`
- `npm run crawl:ladder`
- `npm run crawl:economy:ninja`
- `npm run crawl:patch05:with-economy`
- `npm run crawl:news:all`
- `npm run crawl:cn-market:dd373`
- `npm run build:problem-guides`
- `npm run crawl:story-guide`

## 推荐工作方式

先跑 dev 或读取现有产物，再检查 JSON，再决定是否上传。任何可能覆盖 release 的任务都要先验证非空和更新时间。
