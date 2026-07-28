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

## 命令

```bash
npm run poe1:ladder
npm run poe1:economy
npm run poe1:upload
npm run poe1:publish
```

发布前至少检查：赛季名非空、天梯样本与展示角色非空、经济条目非空、`updatedAt` 已刷新、神圣石/混沌石换算存在。
