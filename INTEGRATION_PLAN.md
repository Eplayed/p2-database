# 项目整合计划：Noah Game Data Platform

## 状态：已完成 (Completed)

本计划旨在将现有的 `p2-database`、`crawl_economy` 和 `database` 三个项目整合成一个统一的单体仓库。

### 进度追踪

- [x] **第一阶段：基础设施搭建**
    - [x] 合并 `package.json` 依赖。
    - [x] 建立公共模块 (`src/common/oss`, `src/common/dictionaries`)。
    - [x] 统一环境配置 (`config/env-config.js`)。

- [x] **第二阶段：模块迁移**
    - [x] 迁移 `p2-database` 到 `src/crawlers/poe2-ladder`。
    - [x] 迁移 `database` 到 `src/processors/poe2-crafting`。
    - [ ] 迁移 `crawl_economy` (暂缓，按需迁移)。

- [x] **第三阶段：清理与验证**
    - [x] 删除旧目录 (`auto_browser`, `base-data`)。
    - [x] 验证核心脚本运行 (`scripts/test_integration.js`)。
    - [x] 更新文档 (`README.md`)。

## 目录结构快照

```text
src/
├── common/
├── crawlers/
│   └── poe2-ladder/
└── processors/
    ├── poe2-crafting/
    ├── poe2-price-mgr/
    └── wow-data/
```
