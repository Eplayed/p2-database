# p2-database 项目说明

最后更新：2026-07-28

## 项目定位

本项目负责把 poe.ninja、poe2db、DD373、poe2ggg 和人工维护内容转成小程序可读取的 JSON，并上传 OSS。POE2 是当前主线；POE1 赛季助手使用独立目录和 OSS 前缀，绝不覆盖 POE2 产物。

## 当前模块

| 模块 | 数据来源 | 主要产物 | 更新方式 |
|---|---|---|---|
| 天梯/BD解析 | poe.ninja | `all_ladders_translated.json`、`players/*.json` | Dashboard 手动 |
| 天梯趋势 | 天梯聚合 | `ladder_analysis.json` | 随天梯更新 |
| 技能/装备查BD | 玩家详情聚合 | `ladder_build_index.json`、`ladder_build_details/*.json` | 随天梯更新 |
| 首页复访摘要 | 经济 + 天梯 + 急救箱聚合 | `daily_return_digest.json` | 随日常/天梯更新 |
| 我的关注变化 | 天梯查 BD 索引 + DD373 公开样本 | `follow_updates.json` | 随日常/天梯更新 |
| 国际服通货参考 | poe.ninja | `economy_digest.json`、`international_market_catalog.json`、图标 | GitHub Actions + Dashboard |
| 国服行情 | DD373 公开样本 | `cn_market_digest.json` | GitHub Actions + Dashboard |
| 流放急救箱 | 人工确认问题库 | `problem_guides.json`、`problem_guides_manifest.json` | Dashboard/手动 |
| 剧情地图 | poe2ggg | `story_guides.json` | 低频手动 |
| POE1 抄BD | poe.ninja POE1 Builds | `translated-data/poe1/*/ladder_digest.json` | 命令行发布 |
| POE1 看行情 | poe.ninja POE1 Economy | `translated-data/poe1/*/economy_digest.json` | 命令行发布 |

## 产品决策：下架独立开荒/热门 BD

页面访问数据表明，用户更倾向于通过天梯榜进入真实玩家 BD 详情。独立开荒推荐依赖社区帖子和人工校验，准确性及维护成本不匹配当前价值。

因此从 2026-06-18 起：

- 小程序移除赛季开荒和热门 BD 页面及入口。
- Dashboard 移除 starter 更新任务。
- package scripts 移除 starter 发布命令。
- `auto-crawl.yml` 不再生成 starter 数据。
- 历史源码和基础数据暂不删除，避免误伤尚未提交的数据，也便于未来复盘。
- 后续 BD 产品统一围绕 poe.ninja 天梯真实玩家数据演进。

## 产品决策：下架 0.5 资料

从 2026-07-06 起，小程序不再展示独立“0.5 资料”和“终局清单”入口。`crawlers/patch05`、`base-data/patch05` 和历史 `patch-0.5` 产物暂保留，但不再进入 Dashboard、npm 发布脚本或 GitHub Actions 更新链路。

## 产品决策：下架新闻和精华帖 BD 更新

从 2026-07-07 起，小程序不再展示独立新闻流，新闻数据不再进入 Dashboard、npm scripts 或 GitHub Actions。踩蘑菇精华帖 BD 也不再维护；热门 BD 统一走 poe.ninja 天梯真实玩家数据。

## Dashboard

运行：

```bash
npm run dashboard
```

可见任务：

1. `一键更新日常数据并上传`
   poe.ninja 经济（首页摘要 + 国际服通货目录） -> DD373 -> 流放急救箱 -> 我的关注变化 -> 首页复访摘要 -> OSS。
2. `刷新天梯/BD解析并上传`
   天梯玩家详情 -> 趋势聚合 -> 技能/装备查 BD 索引 -> 我的关注变化 -> 首页复访摘要 -> OSS。索引会在上传前显式重建，避免小程序读取旧数据。
3. `更新 POE1 抄 BD / 看行情`
   POE1 当前赛季公开天梯摘要 -> 游戏内经济摘要 -> `poe1-season` 专用 OSS 前缀。与 POE2 任务完全隔离。

POE1 同时由 `update_poe1_season.yml` 每两小时自动刷新。脚本只选择当前普通挑战赛季；当 poe.ninja 在新赛季上线后更新赛季列表时，下一轮任务会自动切换，无需改小程序代码。

日常任务不包含新闻、千岛、剧情地图、0.5 资料、starter、踩蘑菇精华帖或热门社区 BD。

### 赛季末功能调研

Dashboard 的“小程序功能调研”面板控制当前环境的 `feature_survey.json`：

- 点击“开启功能调研”会只上传该配置文件到 OSS，不需要重新发布小程序，也不触发日常抓取。
- 点击“关闭功能调研”会立即隐藏首页入口；已通过微信数据分析上报的历史选择不会被删除。
- 当前 `campaignId` 为 `season_05_late_survey_202607`。更换批次 ID 后，同一用户可对新一轮调研重新提交一次。
- 小程序本地会短暂缓存配置，用户通常在 10 分钟内或重新进入首页后看到开关变化。

### 自媒体内容研究

Dashboard 另有独立的“更新论坛选题池”任务。它顺序采集现有 QClaw 论坛数据，并由 p2-database 补充 Maxroll POE 海外参考源，统一生成本地内容研究选题池，供自媒体选题、截图、玩家痛点发现和小程序策略复盘使用。

- 不生成 `translated-data`，不上传 OSS，也不进入小程序日常发布。
- Dashboard 启动时使用独立 Chromium for Testing 会话，只关闭采集标签；不会关闭用户的 Chrome 或 `localhost:5177` Dashboard 页面。
- QClaw 定时任务和 Dashboard 手动运行共用同一把锁，防止争抢浏览器实例和 Excel。
- 新增记录保留来源、原帖链接、抓取时间、内容质量和图片来源；Excel 通过临时文件原子替换，避免中断写坏工作簿。
- 运行结果写入 `dashboard/runtime/forum-content-scan.json`，Dashboard 展示最近状态、两路来源的候选/跳过/新增统计和两个工作表的记录数。
- 统一选题池写入 `dashboard/runtime/content-research.json`，Dashboard 展示来源状态、选题数量、抄 BD/看行情/解卡点归类和高价值选题；同时导出 `dashboard/runtime/content-research-topics.md`，供公众号、头条号和论坛发帖前筛选。
- Dashboard 的“内容研究看板”支持按小程序主线和游戏筛选，分为“今天优先写”“三条主线”“筛选结果”，用于把选题直接落到文章导流和小程序入口。
- 论坛内容属于玩家讨论来源；写文章前仍需用官方公告、游戏内文本或权威数据库核验具体事实。
- 详细说明见 `docs/CONTENT_RESEARCH.md`。

## 数据质量红线

- 天梯为空时禁止上传。
- 玩家详情抓取失败不能生成假成功数据。
- 翻译优先使用 poe2db 中文名称和人工映射。
- 国际服通货价格必须带更新时间、poe.ninja 来源和游戏内单位语义；不得混入人民币交易引导。
- DD373 数据仅作为公开样本换算，不表示成交保证。
- 人工攻略内容必须保留来源，未知内容不能推测补齐。
- 流放急救箱必须保持“问题 -> 排查 -> 下一步工具”结构，不做聊天式 AI 答案。

## 后续价值方向

数据端优先支持：

1. 24 小时职业、技能和装备使用率涨跌。
2. 按技能反查职业、辅助技能和装备组合。
3. 按装备反查使用职业与关联 BD。
4. 两个真实玩家 BD 的差异对比数据。
5. 用户关注职业、技能、装备和通货所需的轻量摘要。

## 首页复访摘要

- 脚本：`scripts/build_daily_return_digest.js`。
- 产物：`translated-data/{env}/miniprogram_data/daily_return_digest.json`。
- 用途：小程序首页“今日变化”和原生分享卡，减少首页为了复访信息反复拉多份大 JSON。
- 数据边界：只汇总现有产物，不新增抓取；热门技能/装备来自真实天梯样本，急救箱推荐来自人工确认问题库。

## 我的关注变化

- 脚本：`scripts/build_follow_updates.js`。
- 产物：`translated-data/{env}/miniprogram_data/follow_updates.json`。
- 范围：技能、传奇装备、DD373 国服通货；比较上一版同一稳定 ID 的使用人数或单价。
- 没有可靠上一版时 `change` 为 `null`，前台仅显示当前数据，禁止伪造涨跌。

## 技能/装备查BD数据结构

- `ladder_build_index.json` 只包含名称、图标、使用人数、职业分布、代表 BD 和详情路径，控制首次下载体积；代表 BD 可直接跳转到对应天梯角色。
- `ladder_build_details/{id}.json` 在用户查看搭配时按需加载，包含辅助技能/相关技能和更多代表玩家。
- 技能按 `originalName` 去重，传奇装备按 `originalName` 去重，不使用中文显示名作为稳定键。
- 数据完全来自当前抓取的真实玩家详情，不增加外部请求，也不使用人工推荐评分。
