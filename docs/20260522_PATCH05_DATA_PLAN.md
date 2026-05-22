# 0.5 数据生产计划

日期：2026-05-22

目标：在 `p2-database` 中建立 0.5 版本中文资料数据管线，抓取/整理 poe2db 中文资料和手动修正数据，输出稳定 OSS JSON 给小程序消费。

## 数据边界

- 本项目负责抓取、清洗、校验、上传。
- 小程序只读取 OSS JSON，不直接请求 poe2db。
- 中文显示优先，英文名保留用于搜索与核对。
- 带广告的小程序不能整段搬运站点内容，数据以结构化摘要、名称、分类、来源链接为主。

## 目录规划

```txt
crawlers/patch05/
  index.js
  sources.js
  parser.js
  normalize.js
  validate.js

base-data/patch05/
  manual_entries.json
  overrides.zh-CN.json

translated-data/{release|dev}/patch-0.5/
  version.json
  patch05_index.json
  patch05_items.json
  patch05_runes.json
  patch05_currencies.json
  patch05_economy.json
  patch05_kalguuran_gems.json
  patch05_bosses.json
  patch05_endgame_checklist.json
  patch05_sources.json
```

## 数据源优先级

1. 官方公告/补丁说明：版本机制、系统改动、赛季规则。
2. poe2db 中文站：中文名、物品/技能/符文/通货结构。
3. 手工修正：中文摘要、分类、展示标签、搜索别名。

## 任务清单

- [x] 新增 `crawlers/patch05` 数据管线骨架。
- [x] 新增 `base-data/patch05/manual_entries.json` 手工高置信资料。
- [x] 新增 `base-data/patch05/overrides.zh-CN.json` 中文修正表。
- [x] 生成 `translated-data/{env}/patch-0.5/version.json`。
- [x] 生成 `patch05_index.json` 分类索引。
- [x] 生成 `patch05_sources.json` 来源索引。
- [x] 生成 `patch05_runes.json`。
- [x] 生成 `patch05_currencies.json`。
- [x] 生成 `patch05_economy.json`，对接旧经济数据并保留待价格状态。
- [x] 生成 `patch05_kalguuran_gems.json`。
- [x] 生成 `patch05_bosses.json`。
- [x] 生成 `patch05_endgame_checklist.json`。
- [x] 增加数据校验：必填字段、重复 id、低置信提示、JSON 可解析。
- [x] 增加 npm 脚本：`crawl:patch05`、`crawl:patch05:dev`。
- [x] 增加经济刷新脚本：`crawl:patch05:with-economy`、`crawl:patch05:with-economy:dev`。
- [x] 复用现有 `upload_to_oss.js` 上传 `translated-data/{env}`。
- [x] 增加 GitHub Actions 手动更新工作流，支持可选刷新经济数据。
- [x] 经济定时任务更新后自动刷新并上传 `patch05_economy.json`。

## 输出格式

资料条目统一格式：

```json
{
  "id": "string",
  "category": "rune",
  "name": "中文名",
  "enName": "English Name",
  "summary": "中文摘要",
  "effect": "中文效果",
  "tags": ["奥杜尔秘符", "符文"],
  "source": {
    "name": "poe2db",
    "url": "https://poe2db.tw/cn/...",
    "checkedAt": "2026-05-22",
    "confidence": "high"
  }
}
```

## 更新记录

- 2026-05-22：建立计划文档，准备新增 0.5 数据管线。
- 2026-05-22：新增 `crawlers/patch05` 管线骨架、手工资料、中文覆盖表、校验器、npm 脚本和手动 CI 工作流。
- 2026-05-22：本地生成 dev/release `patch-0.5` 数据成功；dev 输出包含 6 个分类、11 条资料种子、6 条终局清单和 4 个来源页面索引。
- 2026-05-22：新增 `patch05_economy.json` 经济聚合产物；优先合并 `economy.json` 真实价格，未匹配时输出 `priceStatus: pending`，供小程序显示“待价格”。
- 2026-05-22：新增 `run_with_economy.js` 和 workflow `refresh_economy` 开关；需要真实行情时先抓 `economy.json`，再生成 `patch05_economy.json`。
- 2026-05-22：`update_economy.yml` 增加 0.5 经济产物刷新和上传，避免通用经济更新后新经济榜滞后。
