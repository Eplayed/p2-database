# AGENT.md

## 项目定位

`p2-database` 是 `PoE2 流放助手` 小程序的数据生产端。

目标不是做网站，而是稳定生成 JSON 并上传到 OSS，供小程序读取。

核心链路：

`poe.ninja / poe2db / 踩蘑菇 / poe2ggg / 人工源数据 -> 本项目生成 JSON -> OSS -> 小程序`

## 当前重点

当前赛季是 `0.5`，优先级最高的模块：

1. `开荒推荐`
2. `热门BD候选池`
3. `0.5 资料速查`
4. `新经济观察`
5. `剧情地图攻略`
6. `新闻`

## 必须先知道

- 小程序 `赛季开荒` tab 读取：
  `translated-data/{env}/miniprogram_data/starters.json`
- 小程序 `热门BD` tab 读取：
  `translated-data/{env}/miniprogram_data/starter_candidates.json`
- 热门 BD 候选来自踩蘑菇 planner 接口，不再依赖脆弱的 DOM 扫描。
- 正式开荒推荐源文件是：
  `base-data/starter/starter_builds.json`
- OSS 上传入口是：
  `auto_browser/upload_to_oss.js`

## 热门 BD 流程

这是当前最重要的赛季内维护流程：

1. 抓热门 BD 原始输入  
   `NODE_ENV=production node crawlers/starter-agent/crawl_hot_posts.js`

2. 生成候选 JSON  
   `NODE_ENV=production node crawlers/starter-agent/index.js`

3. 提升适合开荒的候选到正式源  
   `NODE_ENV=production node crawlers/starter/promote_candidates.js`

4. 生成正式开荒推荐  
   `NODE_ENV=production node crawlers/starter/index.js`

5. 上传 OSS  
   `NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"`

一条命令版本：

`npm run data:starter:publish`

## 常用命令

- `npm run dashboard`
  本地可视化控制台

- `npm run crawl:patch05:with-economy`
  刷新通用经济并生成 0.5 数据

- `npm run crawl:news:all`
  刷新新闻列表和详情

- `npm run crawl:story-guide`
  刷新剧情地图攻略

- `npm run crawl:ladder`
  刷新天梯

- `npm run build:starter`
  重新生成正式开荒推荐

## 目录说明

- `crawlers/starter-agent/`
  热门 BD 抓取与候选抽取

- `crawlers/starter/`
  正式开荒推荐生成逻辑

- `base-data/starter/agent_posts/`
  抓到的热门 BD 原始输入

- `base-data/starter/candidates/`
  候选 JSON 单文件

- `base-data/starter/starter_builds.json`
  正式开荒推荐源

- `translated-data/release/`
  生产环境产物

## 修改时的约束

- 这个项目的核心产物是 JSON，不要为了“代码漂亮”改动数据结构，除非同步检查小程序读取逻辑。
- 赛季中优先保守改动，避免破坏已有 OSS 路径。
- 如果只想更新线上开荒推荐，不需要动小程序代码包，只要刷新 OSS 数据即可。
- 如果 shell 里 `npm` 不可用，可以直接用 `node` 执行对应脚本。
- 热门 BD 候选和正式开荒推荐是两层数据，不要把所有候选自动灌进正式推荐。

## 当前已知事实

- 热门 BD 候选目前走接口：
  `/planner/bdlist`
  `/planner/bd?planid=...`
- `starter_candidates.json` 已作为小程序热门BD数据源。
- `starter_builds.json` 已混合：
  社区热门开荒条目 + 原人工精选条目。
- Codex 自动化已用于定期抓热门 BD 输入。

## 当前已知风险

- 踩蘑菇接口字段如果变化，热门 BD 流程会先受影响。
- 候选里有些条目是“热度高但不一定适合首发开荒”的，需要人工筛。
- 开服后 24-72 小时内，天梯和物价会快速变化，推荐排序应频繁校准。

## 推荐工作方式

- 先跑数据，再看产物，再上传 OSS。
- 先检查 `translated-data/release`，再决定是否需要动小程序。
- 对赛季中改动，优先做“新增脚本/新增字段/新增候选流程”，少做重构。
