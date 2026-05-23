# 0.5 新经济观察维护文档

## 数据产物

- `translated-data/{env}/patch-0.5/patch05_economy.json`
  - 0.5 新通货、符文、合金的价格跟踪明细。
- `translated-data/{env}/patch-0.5/patch05_economy_watch.json`
  - 小程序“经济观察”tab 直接读取的摘要数据。
- `translated-data/{env}/economy-history/*.json`
  - 汇率快照历史，用来计算快照间涨跌和稳定度。

## 不需要手动维护

- 通用汇率抓取：`node auto_browser/crawl_economy.js`
- 0.5 经济明细生成：`node crawlers/patch05/index.js`
- 0.5 经济观察生成：由 `crawlers/patch05/economy.js` 自动生成
- 快照历史保存：每次生成 0.5 经济数据时自动写入 `economy-history`
- OSS 上传：`node -e "require('./auto_browser/upload_to_oss')()"`
- GitHub Actions：
  - `update_economy.yml` 定时刷新经济数据，并重新生成/上传 0.5 经济观察。
  - `update_patch05.yml` 手动刷新 0.5 资料时，也会输出经济观察文件。

## 需要手动维护

- `base-data/patch05/manual_entries.json`
  - 当 poe2db 或官方确认新的符文、合金、通货名称后，把概念级条目拆成具体物品。
  - 给新物品补充 `aliases`，用于匹配 poe.ninja 行情名称。
- `base-data/patch05/overrides.zh-CN.json`
  - 中文名、分类、摘要不准确时在这里覆盖。
- 涨跌阈值
  - 当前逻辑在 `crawlers/patch05/economy.js`。
  - `35%` 以上标记为高波动，快照 3 次以上且波动小于 `12%` 标记为可参考。
  - 开服后如果价格跳动过大，可以调高高波动阈值。

## 开服后推荐操作

```bash
cd /Users/zhangyajun/Documents/project/p2-database

# 刷新通用经济数据、生成 0.5 经济观察并上传
npm run crawl:patch05:with-economy
NODE_ENV=production node -e "require('./auto_browser/upload_to_oss')()"
```

建议节奏：

- 开服前：每天跑一次，确认文件结构正常。
- 开服当天：每 4-6 小时跑一次，积累快照。
- 开服后 24 小时：检查 `patch05_economy_watch.json`，确认哪些条目进入 `tracked`。
- 开服后 3 天：根据真实行情，把 `manual_entries.json` 里的概念条目拆成具体符文/合金。

## 准确性原则

- 小程序只展示“观察信号”，不展示投资建议。
- 样本不足时状态为 `待行情` 或 `观察中`。
- 低成交、跳价、刚进入行情源的新物品，要优先标记为高波动。
