# PoE2-Database 统一爬虫

整合 p2-database 和 crawl_economy 的 PoE2 数据爬虫项目。

## 功能概览

本项目整合了以下功能：

| 功能 | 脚本 | 数据输出 |
|------|------|----------|
| 天梯翻译 | `run_translate_crawler.js` | `translated-data/` |
| 热门BD | `crawl_hot_builds.js` | `auto_browser/data/community.json` |
| 踩蘑菇精华帖 | `crawl_caimogu_essence_full.js` | `auto_browser/caimogu_essence_full.json` |
| 数据转换 | `transform_caimogu_data.js` | `auto_browser/community_builds.json` |

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

创建 `auto_browser/.env` 文件：

```bash
NODE_ENV=production
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=poe2-all-class
OSS_ACCESS_KEY_ID=your_access_key_id
OSS_ACCESS_KEY_SECRET=your_access_key_secret
DEV_OSS_PATH=dev/
PROD_OSS_PATH=release/
```

## 使用方法

### 方式一：统一入口脚本（推荐）

```bash
# 运行所有爬虫
node run_crawler.js --all

# 只运行精华帖爬虫
node run_crawler.js --essence

# 只运行热门BD爬虫
node run_crawler.js --hot

# 只运行翻译爬虫
node run_crawler.js --translate
```

### 方式二：独立脚本

```bash
# 天梯翻译爬虫
npm run cron:prod

# 热门BD爬虫
node auto_browser/crawl_hot_builds.js

# 精华帖爬虫
node auto_browser/crawl_caimogu_essence_full.js
```

## OSS 数据输出路径

| 数据类型 | OSS 路径 |
|----------|----------|
| 天梯数据 | `poe2-ladders/release/all_ladders_translated.json` |
| 社区BD | `poe2-ladders/miniprogram_data/community.json` |
| 精华帖数据 | `poe2-ladders/miniprogram_data/essence_builds.json` |

## GitHub Actions

自动任务配置在 `.github/workflows/auto-crawl.yml`：

- **触发条件**：
  - 推送到 main 分支
  - 每天北京时间 9:00 (UTC 1:00)
  - 手动触发

- **环境变量**：
  - `OSS_ACCESS_KEY_ID`
  - `OSS_ACCESS_KEY_SECRET`
  - 在 GitHub 仓库设置中添加为 Secrets

## 目录结构

```
p2-database/
├── auto_browser/          # 浏览器爬虫脚本
│   ├── crawl_caimogu_essence_full.js   # 踩蘑菇精华帖爬虫
│   ├── crawl_hot_builds.js            # 热门BD爬虫
│   ├── transform_caimogu_data.js      # 数据格式转换
│   └── translate_crawler.js           # 天梯翻译爬虫
├── translated-data/        # 翻译数据输出
│   ├── release/           # 生产环境数据
│   └── dev/               # 开发环境数据
├── .github/workflows/     # GitHub Actions 配置
│   └── auto-crawl.yml    # 自动爬虫工作流
├── run_crawler.js         # 统一入口脚本
└── package.json           # NPM 配置
```

## 小程序数据地址

```
https://poe2-all-class.oss-cn-hangzhou.aliyuncs.com/poe2-ladders/miniprogram_data/community.json
```

## 合并历史

本项目由以下两个项目合并而来：

1. **p2-database** - 原 poe.ninja 天梯数据爬虫 + 踩蘑菇精华帖爬虫
2. **crawl_economy** - 热门BD爬虫 + 新闻爬虫

合并后统一使用 dotenv 配置管理，简化项目结构。
