# PoE2-Database 数据爬虫

> 流放之路2（PoE2）数据爬虫项目。
> 从 poe.ninja 获取天梯数据 → poe2db.tw/cn 自动翻译 → 聚合分析 → 上传阿里云 OSS，为微信小程序「daily-talk」提供数据支撑。

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
│  ├─ translate_crawler.js   天梯翻译 (含天赋树截图)                │
│  ├─ crawl_caimogu_*.js     踩蘑菇爬虫                           │
│  └─ upload_to_oss.js       OSS 上传                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                translated-data/{env}/                             │
│  ├─ all_ladders_translated.json   天梯索引+翻译                   │
│  ├─ classes.json                  职业列表                       │
│  ├─ players/*.json                玩家详情                       │
│  ├─ ladder_analysis.json          预聚合统计                     │
│  └─ miniprogram_data/community.json  热门BD                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
              阿里云 OSS → 微信小程序「daily-talk」
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

# 统一入口
node run_crawler.js --all
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
│   ├── translate_crawler.js     #    天梯翻译 (含截图)
│   ├── auto_full_crawler.js     #    HTTP API 版天梯
│   ├── crawl_caimogu_*.js       #    踩蘑菇爬虫
│   ├── upload_to_oss.js         #    OSS 上传
│   └── env-config.js            #    环境配置
├── base-data/                   # 翻译字典
│   ├── dist/                    #    编译后的字典 (dict_*.json)
│   ├── base-item/*.json         #    源数据 (手动维护/v2自动)
│   └── merge_data.js            #    旧版字典编译脚本
├── scripts/                     # 数据处理
│   ├── aggregate_analysis.js    #    天梯分析预聚合
│   └── upload_analysis.js       #    分析数据上传
├── translated-data/             # 爬虫输出
│   ├── dev/                     #    开发环境数据
│   └── release/                 #    生产环境数据
├── config/                      # 配置文件
├── .github/workflows/           # GitHub Actions
├── run_crawler.js               # v1 统一入口
├── run_translate_crawler.js     # v1 翻译爬虫入口
└── package.json
```

---

## v2 vs v1 对比

| 维度 | v1 (auto_browser/) | v2 (crawlers/) |
|------|-------------------|----------------|
| 浏览器依赖 | Puppeteer + Chrome | ❌ 无需浏览器 |
| 翻译字典 | 手动维护 base-data/*.json | 自动从 poe2db 抓取 |
| 天梯数据 | Puppeteer 页面导航 + API 拦截 | 纯 HTTP API 调用 |
| 天赋树 | Canvas 截图 (base64) | 暂不支持 (用节点列表代替) |
| 运行速度 | 5-15 分钟 | 1-3 分钟 |
| 稳定性 | 受 Chrome 内存/超时影响 | 纯网络请求，极稳定 |
| GitHub Actions | 需安装 Chrome，容易超时 | 无额外依赖，快速完成 |

---

## 翻译字典系统

### v2 自动更新 (推荐)

从 poe2db.tw/cn 自动抓取，每次新赛季运行一次即可：

```bash
node crawlers/run.js --dict
```

输出到 `base-data/dist/`：
- `dict_base.json` — 基础物品 (英文名 → 中文名)
- `dict_gem.json` — 技能宝石 (600+ 条)
- `dict_unique.json` — 传奇物品 (含基底类型)

### v1 手动维护

```bash
cd base-data && node merge_data.js
```

从 `base-data/base-item/*.json` + `gems.json` + `unique_item.json` 编译。

---

## NPM Scripts

### v2 命令 (推荐)

```bash
npm run v2              # 天梯爬虫 + OSS 上传
npm run v2:all          # 字典 + 天梯 + 上传 (完整流程)
npm run v2:dict         # 只更新翻译字典
npm run v2:ladder       # 只运行天梯爬虫 (production)
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
npm run crawl:news      # 新闻爬虫
```

---

## 环境配置

### .env 文件 (auto_browser/.env)

```bash
NODE_ENV=production
CI=false
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=poe2-all-class
OSS_ACCESS_KEY_ID=your_key
OSS_ACCESS_KEY_SECRET=your_secret
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
DEV_OSS_PATH=dev/
PROD_OSS_PATH=release/
```

### 环境差异

| 配置 | dev | production |
|------|-----|------------|
| 数据目录 | translated-data/dev | translated-data/release |
| OSS 路径 | poe2-ladders/dev/ | poe2-ladders/release/ |
| 抓取深度 | 3 人/职业 | 7 人/职业 |

---

## 定时任务 (macOS)

```bash
# crontab -e
# 每天北京时间 9:00 运行 v2 完整流程
0 1 * * * cd /path/to/p2-database && NODE_ENV=production node crawlers/run.js --all >> /tmp/poe2-crawler.log 2>&1
```

---

## GitHub Actions

| 工作流 | 触发 | 功能 |
|--------|------|------|
| auto-crawl.yml | push main / 手动 | 天梯爬虫 + 聚合 + 上传 |
| essence_builds.yml | 手动 | 精华帖爬虫 |
| update_economy.yml | 定时 | 经济数据 |
| update_news.yml | 定时 | 新闻数据 |

---

## OSS 输出路径

Bucket: `poe2-all-class` / Region: `oss-cn-hangzhou`

```
poe2-ladders/
├── release/
│   ├── all_ladders_translated.json
│   ├── classes.json
│   ├── ladder_analysis.json
│   ├── players/*.json
│   └── miniprogram_data/community.json
└── dev/
    └── (同上结构)
```
