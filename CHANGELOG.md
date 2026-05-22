# 变更日志

## v3.0.0 — 2026-05-21 版本合并

### 删除
- `run_crawler.js` — v1 旧版统一入口，已被 `crawlers/run.js` 替代
- `run_translate_crawler.js` — v1 翻译专用入口，功能已合并
- `auto_browser/translate_crawler.js` — v1 Puppeteer 天梯爬虫（慢，依赖 Chrome headless）
- `auto_browser/auto_full_crawler.js` — v1 完整爬虫（Puppeteer + HTTP 混合）

### 新增
- `crawlers/run.js` — v3 统一入口，整合全部功能：
  - `--dict` 翻译字典更新
  - `--ladder` 天梯爬虫 (HTTP API)
  - `--trees` 天赋树截图 (Puppeteer)
  - `--upload` OSS 上传
  - `--all` 完整流程
  - `--essence` 踩蘑菇精华帖
  - `--hot` 热门BD
  - 天梯完成后自动运行 `aggregate_analysis.js` + `upload_analysis.js`

### 修改
- `package.json` — npm scripts 统一为 `crawl:*` 系列，移除 v1/v2 前缀
- `.github/workflows/auto-crawl.yml` — CI 命令改为 `node crawlers/run.js --ladder --upload`
- `README.md` — 更新架构图、目录结构、命令说明
- `scripts/aggregate_analysis.js` — 注释更新

### 保留（不受影响）
- `crawlers/poe2db-dict/` — 翻译字典爬虫
- `crawlers/ninja-ladder/` — 天梯爬虫 + 翻译 + community
- `crawlers/ninja-ladder/capture_trees.js` — 天赋树截图
- `auto_browser/upload_to_oss.js` — OSS 上传
- `auto_browser/env-config.js` — 环境配置
- `auto_browser/crawl_economy.js` — 通货汇率
- `auto_browser/crawl_news*.js` — 新闻爬虫
- `auto_browser/crawl_caimogu_essence_full.js` — 精华帖爬虫
- `auto_browser/crawl_hot_builds.js` — 热门BD爬虫
- `auto_browser/transform_caimogu_data.js` — 数据格式转换
- `scripts/` — 分析脚本
- `.github/workflows/` — 其他 CI 工作流

### 迁移指南

旧命令 → 新命令：

```
旧: npm run dev              → 新: npm run dev
旧: npm run prod             → 新: npm start
旧: npm run cron:dev         → 新: npm run crawl:ladder:dev
旧: npm run cron:prod        → 新: npm run crawl:ladder
旧: npm run crawl:all        → 新: npm run crawl:all
旧: npm run v2:all           → 新: npm run crawl:all
旧: npm run v2:dict          → 新: npm run crawl:dict
旧: npm run v2:ladder        → 新: npm run crawl:ladder
旧: npm run v2:ladder:dev    → 新: npm run crawl:ladder:dev
旧: npm run v2:dev           → 新: npm run dev
旧: npm run v2:prod          → 新: npm run crawl:all
```