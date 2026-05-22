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
│                    crawlers/run.js (v3 统一入口)                  │
│  ├─ poe2db-dict/     翻译字典自动生成 (HTTP)                     │
│  ├─ ninja-ladder/    天梯爬虫 + 翻译 (HTTP API)                   │
│  ├─ capture_trees.js 天赋树截图 (Puppeteer)                      │
│  └─ auto_browser/    辅助模块 (OSS上传/经济/新闻/精华帖)          │
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

### 运行

```bash
# 完整的生产流程（字典+天梯+截图+上传）
npm run crawl:all

# 只运行天梯爬虫（生产环境）
npm run crawl:ladder

# 生成 0.5 中文资料（生产环境）
npm run crawl:patch05

# 开发模式调试
npm run dev

# 查看所有命令
node crawlers/run.js --help
```

---

## 统一入口 crawlers/run.js

```bash
node crawlers/run.js [选项]

选项:
  --dict        更新翻译字典 (从 poe2db.tw/cn 抓取)
  --ladder      运行天梯爬虫 (poe.ninja HTTP API)
  --trees       天赋树截图 (Puppeteer, 需要浏览器)
  --upload      上传数据到 OSS
  --all          运行全部 (字典 + 天梯 + 截图 + 上传)
  --essence     踩蘑菇精华帖爬虫
  --hot          热门BD爬虫
  --help, -h    显示帮助

默认行为 (无参数): 天梯爬虫 + 上传 + 分析
```

---

## 目录结构

```
p2-database/
├── crawlers/                    # ⭐ 核心爬虫
│   ├── run.js                   #    统一入口 (v3)
│   ├── poe2db-dict/             #    翻译字典自动爬虫 (HTTP)
│   │   ├── index.js
│   │   ├── http_client.js       #    HTTP 请求 (限速+重试)
│   │   ├── parser.js            #    HTML 解析
│   │   ├── crawl_base_items.js  #    基础物品 (30个类别)
│   │   ├── crawl_gems.js        #    技能宝石 (600+)
│   │   └── crawl_uniques.js     #    传奇物品
│   ├── patch05/                 #    0.5 中文资料数据管线
│   └── ninja-ladder/            #    天梯爬虫
│       ├── index.js             #    主流程
│       ├── ninja_api.js         #    poe.ninja API 封装
│       ├── translator.js        #    翻译模块
│       ├── community.js         #    community.json 生成
│       └── capture_trees.js     #    天赋树截图 (Puppeteer)
├── auto_browser/                # 辅助模块
│   ├── crawl_economy.js         #    通货汇率爬虫
│   ├── crawl_news.js            #    新闻列表爬虫
│   ├── crawl_news_detail.js     #    新闻详情爬虫
│   ├── crawl_news_with_details.js #  新闻完整爬虫
│   ├── crawl_caimogu_essence_full.js # 精华帖爬虫
│   ├── crawl_hot_builds.js      #    热门BD爬虫
│   ├── transform_caimogu_data.js #   精华帖数据转换
│   ├── upload_to_oss.js         #    OSS 上传 (Content-Type/Cache-Control)
│   └── env-config.js            #    环境配置 (NODE_ENV)
├── base-data/                   # 翻译字典
│   ├── dist/                    #    编译后的字典 (dict_*.json)
│   ├── base-item/*.json         #    源数据
│   └── merge_data.js            #    字典编译脚本
├── scripts/                     # 数据处理脚本
│   ├── aggregate_analysis.js    #    天梯分析预聚合
│   ├── split_passive_tree.js    #    passiveTreeImage拆分 (后处理)
│   └── upload_analysis.js       #    分析数据上传
├── translated-data/             # 爬虫输出
│   ├── dev/                     #    开发环境数据
│   └── release/                 #    生产环境数据
├── .github/workflows/           # GitHub Actions
│   ├── auto-crawl.yml           #    天梯爬虫
│   ├── update_economy.yml       #    通货汇率
│   ├── update_news.yml          #    新闻数据
│   └── essence_builds.yml       #    精华帖爬虫
└── package.json
```

---

## NPM Scripts

```bash
# 核心爬虫
npm start             # 生产模式 (天梯+上传)
npm run dev           # 开发模式 (天梯+上传, 3人/职业)
npm run crawl:all     # 完整流程 (字典+天梯+截图+上传)

# 独立功能
npm run crawl:dict        # 翻译字典
npm run crawl:ladder      # 天梯爬虫 (production)
npm run crawl:ladder:dev  # 天梯爬虫 (dev)
npm run crawl:trees       # 天赋树截图
npm run crawl:essence     # 精华帖爬虫
npm run crawl:hot         # 热门BD爬虫
npm run crawl:patch05     # 0.5 中文资料
npm run crawl:patch05:dev # 0.5 中文资料 (dev)

# 独立爬虫
npm run crawl:news         # 新闻列表
npm run crawl:news:detail  # 新闻详情
npm run crawl:news:all     # 新闻完整
npm run crawl:economy      # 通货汇率
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
| auto-crawl.yml | push main / 手动 | 天梯爬虫 + 上传 |
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

### 2026-05-21 — v3 版本合并
- ✅ 删除 v1 Puppeteer 爬虫 (`translate_crawler.js`, `auto_full_crawler.js`, `run_crawler.js`, `run_translate_crawler.js`)
- ✅ 统一入口 `crawlers/run.js`：字典、天梯(HTTP)、天赋树截图(Puppeteer)、精华帖、热门BD
- ✅ CI workflow 更新为 `crawlers/run.js --ladder --upload`
- ✅ 天梯数据流程完成后自动运行 analysis + 上传分析结果

### 2026-05-18
- ✅ 修复 crawl_news 系列脚本 `MODULE_NOT_FOUND` 错误
- ✅ 统一所有爬虫配置：`./config` → `env-config.js` + `process.env`
- ✅ passiveTreeImage 拆分：base64 → 独立 _tree.jpg 文件 (节省 9.1MB)
- ✅ OSS 上传增加 Content-Type/Cache-Control 头
