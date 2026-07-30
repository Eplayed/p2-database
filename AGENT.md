# AGENT.md

## 项目定位

`p2-database` 是流放之路系列小程序的数据生产端。当前主线仍是「PoE2 流放助手」；新增 POE1 数据必须使用独立目录与 OSS 前缀，不能覆盖 POE2 产物。

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
4. 流放急救箱：人工确认的问题排查清单，动态给小程序读取。
5. 首页复访摘要：聚合天梯、经济和急救箱，减少小程序多源请求。
6. 我的关注变化：为已关注的技能、装备与国服通货生成轻量变化摘要。
7. 低频剧情地图数据。
8. POE1 赛季助手：国服官方天梯角色摘要、装备、技能组合、关键天赋、天赋树截图、基础防御/DPS、人工校对开荒 BD 与游戏内通货行情。

## 已下架功能

2026-06-18 起，小程序不再提供独立“赛季开荒/热门 BD”。

- 不要新增或恢复 starter Dashboard 任务。
- 不要把 starter 生成加入 GitHub Actions。
- 不要继续上传新的 `starters.json` 或 `starter_candidates.json`。
- `crawlers/starter*`、`base-data/starter` 只作为历史材料保留。
- 新的热门 BD 能力应基于 poe.ninja 天梯真实玩家数据建设。

2026-07-06 起，小程序不再展示独立“0.5 资料”和“终局清单”。

- 不要把 `crawlers/patch05` 加回 Dashboard、npm 发布脚本或 GitHub Actions。
- `base-data/patch05` 和历史 `patch-0.5` 产物只作复盘保留。

2026-07-07 起，小程序不再展示独立新闻流。

- 不要把新闻爬虫加入 Dashboard 日常任务。
- 不要恢复 `update_news.yml` 或新闻 npm scripts。
- 踩蘑菇精华帖 BD workflow 已移除，不要恢复为当前推荐主线。

## 当前发布链路

- 日常：poe.ninja 经济 -> DD373 -> 流放急救箱 -> 我的关注变化 -> 首页复访摘要 -> OSS。
- 天梯：poe.ninja 天梯 -> 玩家详情/BD解析 -> 聚合分析 -> 技能/装备查 BD 索引 -> 我的关注变化 -> 首页复访摘要 -> OSS。
- 剧情地图：低频手动刷新，不进入日常组合任务。
- POE1：`poe1:ladder` -> `poe1:starter` -> `poe1:starter:terms` -> `poe1_passive_trees` -> `poe1:economy` -> `poe1:upload`，产物位于 `translated-data/poe1/{env}`，仅上传到 `poe1-season/{env}/`。

## 关键约束

- 天梯抓到 0 个职业或 0 位玩家时必须失败，禁止覆盖 release 数据。
- 赛季中优先做兼容性改动，不随意改变 OSS JSON 结构。
- 新英文残留优先补权威中文映射，不能用生硬逐词替换冒充准确翻译。
- OSS 上传入口是 `auto_browser/upload_to_oss.js`。
- POE1 不得调用 `auto_browser/upload_to_oss.js`；它只服务 POE2。POE1 使用 `scripts/upload_poe1_to_oss.js`。
- POE1 天梯主源是国服官方天梯，不要把 poe.ninja 再作为 POE1 天梯主源；poe.ninja 目前只用于 POE1 游戏内经济。
- POE1 `starter_builds.json` 来自人工校对 docx，默认目录 `/Users/zhangyajun/Downloads/poe-bd-国服译名校对`，可通过 `POE1_STARTER_SOURCE_DIR` 覆盖。
- POE1 `starter_terms_enrichment.json` 是开荒 BD 真实数据增强工作台。已匹配项可用于图标/标准名，未匹配项进入 PoEDB 或人工映射；不要把未匹配项当成可靠游戏资料展示。
- POE1 `ladder_digest.json` 是移动端摘要；字段可以包含装备、技能和天赋树截图，但不要在前端需要之外盲目塞完整原始详情。
- 急救箱内容源是 `base-data/problem-guides/*.json`，不要用 AI 直接生成未审核结论；前台只展示玩家问题、排查项和下一步工具。
- 不要修改或删除用户尚未提交的 `base-data/starter` 历史数据。

## 常用命令

- `npm run dashboard`
- `npm run crawl:ladder`
- `npm run crawl:economy:ninja`
- `npm run crawl:cn-market:dd373`
- `npm run build:problem-guides`
- `npm run build:daily-return`
- `npm run crawl:story-guide`
- `npm run poe1:publish`
- `npm run poe1:starter`
- `npm run poe1:starter:terms`

## 推荐工作方式

先跑 dev 或读取现有产物，再检查 JSON，再决定是否上传。任何可能覆盖 release 的任务都要先验证非空和更新时间。
