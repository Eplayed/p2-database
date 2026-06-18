# p2-database 项目说明

最后更新：2026-06-18

## 项目定位

本项目负责把 poe.ninja、poe2db、DD373、踩蘑菇、poe2ggg 和人工维护内容转成小程序可读取的 JSON，并上传 OSS。

## 当前模块

| 模块 | 数据来源 | 主要产物 | 更新方式 |
|---|---|---|---|
| 天梯/BD解析 | poe.ninja | `all_ladders_translated.json`、`players/*.json` | Dashboard 手动 |
| 天梯趋势 | 天梯聚合 | `ladder_analysis.json` | 随天梯更新 |
| 经济摘要 | poe.ninja | `economy_digest.json`、图标 | GitHub Actions + Dashboard |
| 国服行情 | DD373 公开样本 | `cn_market_digest.json` | GitHub Actions + Dashboard |
| 0.5 资料 | poe2db + 人工源 | `patch-0.5/*.json` | Dashboard/手动 |
| 新闻 | 踩蘑菇 | `news_caimogu.json`、详情 | GitHub Actions + Dashboard |
| 剧情地图 | poe2ggg | `story_guides.json` | 低频手动 |

## 产品决策：下架独立开荒/热门 BD

页面访问数据表明，用户更倾向于通过天梯榜进入真实玩家 BD 详情。独立开荒推荐依赖社区帖子和人工校验，准确性及维护成本不匹配当前价值。

因此从 2026-06-18 起：

- 小程序移除赛季开荒和热门 BD 页面及入口。
- Dashboard 移除 starter 更新任务。
- package scripts 移除 starter 发布命令。
- `auto-crawl.yml`、`update_patch05.yml` 不再生成 starter 数据。
- 历史源码和基础数据暂不删除，避免误伤尚未提交的数据，也便于未来复盘。
- 后续 BD 产品统一围绕 poe.ninja 天梯真实玩家数据演进。

## Dashboard

运行：

```bash
npm run dashboard
```

可见任务：

1. `一键更新日常数据并上传`
2. `刷新天梯/BD解析并上传`

日常任务不包含千岛、剧情地图、starter 或热门社区 BD。

## 数据质量红线

- 天梯为空时禁止上传。
- 玩家详情抓取失败不能生成假成功数据。
- 翻译优先使用 poe2db 中文名称和人工映射。
- 经济价格必须带更新时间和数据来源语义。
- DD373 数据仅作为公开样本换算，不表示成交保证。
- 人工攻略内容必须保留来源，未知内容不能推测补齐。

## 后续价值方向

数据端优先支持：

1. 24 小时职业、技能和装备使用率涨跌。
2. 按技能反查职业、辅助技能和装备组合。
3. 按装备反查使用职业与关联 BD。
4. 两个真实玩家 BD 的差异对比数据。
5. 用户关注职业、技能、装备和通货所需的轻量摘要。
