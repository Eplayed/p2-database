# 内容研究数据线

最后更新：2026-08-11

## 定位

内容研究不是小程序数据管线。它只用于发现玩家问题、文章选题和小程序策略方向，不写入 `translated-data`，不上传 OSS，也不会改变线上小程序内容。

核心目标：

- 找到国内玩家正在问什么。
- 观察海外攻略站和版本趋势。
- 把选题归到小程序三条主线：抄 BD、看行情、解卡点。
- 为公众号、头条号和论坛帖提供候选主题。

## Dashboard 入口

Dashboard 的 `内容研究 -> 更新论坛选题池` 会执行：

```text
现有 QClaw 论坛采集 -> Maxroll POE 海外参考 -> 统一内容研究摘要
```

现有 QClaw 采集继续负责 D2Core 和踩蘑菇 POE2 论坛数据；新增的 p2-database 聚合脚本负责把论坛摘要和 Maxroll 参考源统一成 Dashboard 可读的选题池。

## 主要脚本

```bash
# 跑完整内容研究，包含现有 QClaw 论坛采集
bash scripts/run_forum_content_scan.sh

# 只重建 p2-database 统一选题池，不跑 QClaw
npm run research:content
```

核心文件：

- `scripts/run_forum_content_scan.sh`
- `crawlers/content-research/build_topics.js`
- `dashboard/runtime/forum-content-scan.json`
- `dashboard/runtime/content-research.json`
- `dashboard/runtime/content-research-topics.md`
- `dashboard/runtime/content-research-history.json`

`dashboard/runtime/*` 是本地运行态文件，不提交 Git。

## 来源分层

### 国内玩家问题

优先级最高，用于判断用户真正卡在哪里。当前由现有 QClaw 论坛采集承接，主要覆盖踩蘑菇 POE2 讨论。后续可以继续扩展 POE1 国服论坛、贴吧或 B 站评论，但每个来源都必须保留原帖链接和采集时间。

### 海外参考

当前 P0 接入 Maxroll POE：

- `https://maxroll.gg/poe`
- `https://maxroll.gg/poe/build-guides`
- `https://maxroll.gg/poe/category/currency`

Maxroll 只作为海外趋势和选题参考。脚本只保存标题、链接、标签和短摘要，不抓全文，不直接当事实来源。

### 自有产品数据

后续可接入小程序页面访问、搜索词、功能调研和公众号/头条评论。自有数据最适合判断是否值得做功能，而不是判断游戏事实。

## 输出结构

`dashboard/runtime/content-research.json`：

```json
{
  "generatedAt": "2026-08-11T00:00:00.000Z",
  "status": "success",
  "counters": {
    "topics": 12,
    "sources": 5,
    "failedSources": 0,
    "byGame": {
      "poe1": 12
    },
    "byMiniappPage": {
      "抄BD": 8,
      "看行情": 2,
      "解卡点": 2
    }
  },
  "sources": [],
  "topTopics": [],
  "actionItems": [],
  "exports": {
    "markdown": "dashboard/runtime/content-research-topics.md"
  },
  "topics": []
}
```

每个 topic 都保留：

- `game`：`poe1` / `poe2`
- `source`：来源名称
- `sourceType`：`forum` / `overseas_reference`
- `title` / `titleCn`
- `url`
- `tags`
- `signals.painPoint`
- `signals.articleAngle`
- `signals.miniappPage`
- `signals.miniapp.routeHint`
- `signals.confidence`
- `score`
- `scoreBreakdown`

## P1：选题可执行化

当前脚本会把选题进一步加工成可直接使用的内容工作台：

- 按来源链接或标题去重，避免同一篇 Maxroll 内容重复出现。
- 生成 `stableId`，方便后续做 7 天趋势或人工标记。
- 生成 `scoreBreakdown`，能看到分数来自开荒、抄 BD、看行情、解卡点、赛季、国内论坛或海外参考。
- 生成 `signals.miniapp`，标明这个选题应该承接到“抄 BD / 看行情 / 解卡点”哪条小程序主线。
- 导出 `dashboard/runtime/content-research-topics.md`，可以直接拿去做公众号、头条号或论坛选题筛选。

Dashboard 会额外展示一块“内容研究看板”：

- `今天优先写`：按分数列出最适合先写的选题，并标明来源、游戏、承接入口和核验动作。
- `三条主线`：按 `抄BD`、`看行情`、`解卡点`、`内容观察` 聚合数量和高分标题。
- `筛选结果`：支持按小程序主线和游戏筛选，方便每天只看 POE1 或 POE2 相关选题。

使用方式：

1. 先运行 Dashboard 的 `内容研究 -> 更新论坛选题池`。
2. 看 `今天优先写` 里是否有能承接小程序入口的题。
3. 文章落点必须回到三条主线之一；如果只是 `内容观察`，优先写文章验证，不急着改小程序。
4. 写作前打开来源链接做事实核验，不能直接把海外标题或论坛讨论当结论。

## P2：趋势记忆

内容研究每次运行后会把轻量快照写入 `dashboard/runtime/content-research-history.json`，默认保留最近 30 次。

Dashboard 的“本次变化”会显示：

- `新增选题`：上一次没有出现，这一次出现的标题。
- `连续出现`：上一次和这一次都出现，通常比一次性标题更值得优先写。
- `本次消失`：上一次出现但这次没出现，用于判断话题是否只是短期波动。

判断原则：

- 连续出现且能承接 `抄BD / 看行情 / 解卡点` 的选题，优先写文章或补小程序入口。
- 只出现一次的海外标题，先当候选观察，除非它正好匹配公众号/头条文章计划。
- 国内论坛问题如果连续出现，优先补“流放急救箱”或已有工具入口，而不是做大而全新功能。

## 使用原则

- 论坛内容只能说明“玩家在讨论什么”，不能直接说明“游戏事实是什么”。
- 海外攻略只能作为选题角度和趋势参考，不能全文搬运。
- 具体数值、补丁、活动、掉落和赛季机制必须用官方公告、游戏内文本、poe.ninja 或权威数据库二次核验。
- 内容研究优先服务文章导流和小程序功能取舍，不要恢复成大而全新闻爬虫。
