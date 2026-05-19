# PoE2-Database 数据爬虫

> 流放之路2（PoE2）数据爬虫项目，为微信小程序「PoE2 流放助手」提供数据支撑。
> 数据链路：poe.ninja API + poe2db.tw/cn + 踩蘑菇社区 → 爬虫翻译 → 阿里云 OSS → 小程序。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         数据源                                    │
├──────────────────┬──────────────────┬───────────────────────────┤
│  poe.ninja API   │  poe2db.tw/cn    │  踩蘑菇社区               │
│  (天梯排名+详情)  │  (中文翻译字典)   │  (精华帖/社区BD)          │
└────────┬─────────┴────────┬─────────┴──────────┬────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    crawlers/ (v2 纯 HTTP)                         │
│  ├─ ninja-ladder/    天梯爬虫 (无 Puppeteer)                     │
│  ├─ poe2db-dict/     翻译字典自动生成                             │
│  └─ run.js           统一入口                                    │
├─────────────────────────────────────────────────────────────────┤
│                    auto_browser/ (v1 Puppeteer)                   │
│  ├─ translate_crawler.js   天梯翻译 + passiveTreeImage拆分       │
│  ├─ crawl_economy.js       通货汇率爬虫                          │
│  ├─ crawl_news*.js         新闻/详情爬虫                         │
│  └─ upload_to_oss.js       OSS 上传 (Content-Type/Cache-Control) │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                translated-data/{env}/                             │
│  ├─ all_ladders_translated.json   天梯索引+翻译                   │
│  ├─ classes.json                  职业列表                       │
│  ├─ players/*.json                玩家详情                       │
│  ├─ players/*_tree.jpg            天赋树截图 (独立文件)           │
│  ├─ ladder_analysis.json          预聚合统计                     │
│  └─ miniprogram_data/community.json  热门BD                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              阿里云 OSS → 微信小程序「PoE2 流放助手」
```

---

## 快速开始

### 安装

```bash
npm install
cp auto_browser/.env.example auto_browser/.env
# 编辑 .env 填入 OSS 密钥
```

### 运行 (v2 推荐)

```bash
# 更新翻译字典 (从 poe2db.tw/cn 自动抓取)
npm run v2:dict

# 运行天梯爬虫 (纯 HTTP，无需 Puppeteer)
npm run v2:ladder

# 完整流程: 字典 + 天梯 + OSS 上传
npm run v2:prod

# 开发模式 (抓取量少，用于调试)
npm run v2:dev
```

### 运行 (v1 兼容)

```bash
# 旧版 Puppeteer 爬虫 (含天赋树截图)
npm run cron:prod

# 通货汇率爬虫
npm run crawl:economy  # 通过 workflow 或 node auto_browser/crawl_economy.js

# 新闻爬虫
npm run crawl:news:all
```

---

## 目录结构

```
p2-database/
├── crawlers/                    # ⭐ v2 新版爬虫 (纯 HTTP)
│   ├── run.js                   #    统一入口
│   ├── poe2db-dict/             #    翻译字典自动爬虫
│   │   ├── index.js
│   │   ├── http_client.js       #    HTTP 请求 (限速+重试)
│   │   ├── parser.js            #    HTML 解析
│   │   ├── crawl_base_items.js  #    基础物品 (30个类别)
│   │   ├── crawl_gems.js        #    技能宝石 (600+)
│   │   └── crawl_uniques.js     #    传奇物品
│   └── ninja-ladder/            #    天梯爬虫
│       ├── index.js
│       ├── ninja_api.js         #    poe.ninja API 封装
│       ├── translator.js        #    翻译模块
│       └── community.js         #    community.json 生成
├── auto_browser/                # v1 旧版爬虫 (Puppeteer)
│   ├── translate_crawler.js     #    天梯翻译 + passiveTreeImage拆分
│   ├── crawl_economy.js         #    通货汇率爬虫
│   ├── crawl_news.js            #    新闻列表爬虫
│   ├── crawl_news_detail.js     #    新闻详情爬虫
│   ├── crawl_news_with_details.js #  新闻完整爬虫
│   ├── upload_to_oss.js         #    OSS 上传 (带Content-Type/Cache-Control)
│   └── env-config.js            #    环境配置 (使用 process.env)
├── base-data/                   # 翻译字典
│   ├── dist/                    #    编译后的字典 (dict_*.json)
│   ├── base-item/*.json         #    源数据 (手动维护/v2自动)
│   └── merge_data.js            #    旧版字典编译脚本
├── scripts/                     # 数据处理脚本
│   ├── aggregate_analysis.js    #    天梯分析预聚合
│   ├── split_passive_tree.js    #    passiveTreeImage拆分 (后处理)
│   └── upload_analysis.js       #    分析数据上传
├── translated-data/             # 爬虫输出
│   ├── dev/                     #    开发环境数据
│   └── release/                 #    生产环境数据
│       ├── players/*.json       #    玩家详情 (~28KB/个，gzip后7KB)
│       ├── players/*_tree.jpg   #    天赋树截图 (~99KB/个)
│       └── ...
├── .github/workflows/           # GitHub Actions
│   ├── auto-crawl.yml           #    天梯爬虫
│   ├── update_economy.yml       #    通货汇率
│   ├── update_news.yml          #    新闻数据
│   └── essence_builds.yml       #    精华帖爬虫
├── run_crawler.js               # v1 统一入口
└── package.json
```

---

## NPM Scripts

### v2 命令 (推荐)

```bash
npm run v2              # 天梯爬虫 + OSS 上传
npm run v2:all          # 字典 + 天梯 + 上传 (完整流程)
npm run v2:dict         # 只更新翻译字典
npm run v2:ladder       # 只运行天梯爬��� (production)
npm run v2:ladder:dev   # 只运行天梯爬虫 (dev)
npm run v2:dev          # 开发模式完整流程
npm run v2:prod         # 生产模式完整流程
```

### v1 命令 (兼容)

```bash
npm run dev             # NODE_ENV=dev 旧版爬虫
npm run prod            # NODE_ENV=production 旧版爬虫
npm run cron:dev        # 翻译爬虫 (dev)
npm run cron:prod       # 翻译爬虫 (production)
npm run crawl:all       # 全部旧版爬虫
npm run crawl:essence   # 精华帖爬虫
npm run crawl:news      # 新闻列表爬虫
npm run crawl:news:all  # 新闻完整爬虫 (含详情)
```

---

## 环境配置

### .env 文件 (auto_browser/.env)

```bash
NODE_ENV=production
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=poe2-all-class
OSS_ACCESS_KEY_ID=your_key
OSS_ACCESS_KEY_SECRET=your_secret
```

所有爬虫脚本统一使用 `env-config.js` + `process.env`，配置通过 GitHub Actions secrets 传递。

### 环境差异

| 配置 | dev | production |
|------|-----|------------|
| 数据目录 | translated-data/dev | translated-data/release |
| OSS 路径 | poe2-ladders/dev/ | poe2-ladders/release/ |
| 抓取深度 | 3 人/职业 | 7 人/职业 |

---

## GitHub Actions

| 工作流 | 触发 | 功能 |
|--------|------|------|
| auto-crawl.yml | push main / 手动 | 天梯爬虫 + 聚合 + 上传 |
| update_economy.yml | 定时 (4次/天) | 通货汇率数据 |
| update_news.yml | 定时 (每天9点) | 新闻列表 + 详情 |
| essence_builds.yml | 手动 | 精华帖爬虫 |

---

## OSS 输出路径

Bucket: `poe2-all-class` / Region: `oss-cn-hangzhou`

```
poe2-ladders/
├── release/
│   ├── all_ladders_translated.json   # 天梯索引 (~30KB)
│   ├── classes.json                   # 职业列表 (~1KB)
│   ├── ladder_analysis.json           # 预聚合统计 (~14KB)
│   ├── players/*.json                 # 玩家详情 (~28KB, gzip后7KB)
│   ├── players/*_tree.jpg             # 天赋树截图 (~99KB)
│   └─ miniprogram_data/
│       ├── community.json             # 热门BD (~194KB)
│       └─ mods/                       # 词缀数据
├── dev/
│   └── (同上结构，数据量少)
├── poe2-economy/
│   ├── economy.json                   # 通货汇率
│   ├── news_caimogu.json              # 新闻列表
│   └─ news_details/*.json             # 新闻详情
└── version.json                       # 版本检查
```

---

## 最近更新

### 2026-05-18
- ✅ 修复 crawl_news 系列脚本 `MODULE_NOT_FOUND` 错误（恢复 crawl_news_detail.js）
- ✅ 统一所有爬虫配置：`./config` → `env-config.js` + `process.env`
- ✅ passiveTreeImage 拆分：base64 → 独立 _tree.jpg 文件 (节省 9.1MB)
- ✅ OSS 上传增加 Content-Type/Cache-Control 头
- ✅ GitHub Actions 所有工作流验证通过

---

## v2 vs v1 对比

| 维度 | v1 (auto_browser/) | v2 (crawlers/) |
|------|-------------------|----------------|
| 浏览器依赖 | Puppeteer + Chrome | ❌ 无需浏览器 |
| 翻译字典 | 手动维护 | 自动从 poe2db 抓取 |
| 天梯数据 | Puppeteer + API 拦截 | 纯 HTTP API |
| 运行速度 | 5-15 分钟 | 1-3 分钟 |
| GitHub Actions | 需安装 Chrome | 无额外依赖 |
