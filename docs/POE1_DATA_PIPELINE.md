# POE1 数据管线

## 目标

为 POE1「流放赛季助手」提供移动端最常用的两类数据：

1. 抄 BD：当前赛季天梯角色、职业、等级、主技能和热门技能。
2. 看行情：游戏内通货、碎片、精华、圣油相对混沌石的换算和 7 日变化。

## 数据源与边界

- 来源：`poe.ninja` 的公开 POE1 Build/Economy API。
- 不采集真实货币价格，不放交易链接，也不对具体交易价格作保证。
- Build 搜索接口为 protobuf；通过 `crawlers/poe1/ninja_search_proto.js` 解码，避免依赖网页 DOM。
- 名称优先经过 `crawlers/poe1/translations.js` 显示中文；未知的新名保留原文，禁止猜译。

## 输出与发布

```text
translated-data/poe1/{dev|release}/miniprogram_data/
├── ladder_digest.json
└── economy_digest.json
```

上传路径固定为 `poe1-season/{dev|release}/miniprogram_data/`。不能使用 POE2 的 `auto_browser/upload_to_oss.js`，否则会误上传整个 POE2 数据目录。

赛季选择不写死：每次从 poe.ninja `index-state` 中选取当前普通挑战赛季，排除标准、硬核、SSF、Ruthless 与私人联盟。新赛季数据出现在 poe.ninja 后，下一次发布会自动切换赛季名和数据。

## 命令

```bash
npm run poe1:ladder
npm run poe1:economy
npm run poe1:upload
npm run poe1:publish
```

## 自动更新

`.github/workflows/update_poe1_season.yml` 每两小时刷新并上传一次，适合常规赛季数据更新。新赛季开服前后如需抢首批数据，可在 Dashboard 手动运行“更新 POE1 抄 BD / 看行情”；两种方式写入相同的 POE1 专用 OSS 路径。

发布前至少检查：赛季名非空、天梯样本与展示角色非空、经济条目非空、`updatedAt` 已刷新、神圣石/混沌石换算存在。
