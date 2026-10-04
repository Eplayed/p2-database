# POE1 数据管线

## 目标

为 POE1「流放赛季助手」提供移动端最常用的两类数据：

1. 抄 BD：天梯角色、职业、等级、主技能、装备与天赋树。
2. 看行情：游戏内通货、碎片、精华、圣油的换算与涨跌。

## 数据源与边界（2026-10-04 实测校正）

### 天梯与 BD 详情：目前只有国服官方天梯这一个源

- 天梯榜页面（人工核对入口）：`https://poe.qq.com/act/a202010118poena/challenge/index.html`
- 榜单数据：`https://poe.qq.com/act/a202010118poena/js/rankinfo_{快照名}.json`
- 单个角色详情：`https://poe.qq.com/act/a202010118poena/js/char/{快照名}/{djb2(账号_角色名)}.json`
- 请求要带 `referer: .../challenge/index.html`，否则会被拒。
- 赛季名**必须从页面里的 `window.buildLeagues` 读取**，不要硬编码：2026-10-04 实测
  页面只给出 `s29_normal = 沙海幻境 / Mirage (indexed)`，而代码里曾把它硬编码成
  「费西亚的遗产」并配了个不存在的 `s30_normal = 永火之咒`，导致 BD 页赛季名一直是错的。
  `永火之咒(Allflame)` 是国际服 poe.ninja 的当前联盟，国服仍停在 Mirage，两个服差一个赛季。
- 实测限制：榜单只有 282 个角色；`DETAIL_LIMIT` 默认只抓前 100 个详情（成功 88），
  因此 282 个 build 里 197 个没有装备/药剂/珠宝；另有角色自身只上报 1~2 件装备，
  上游就这样，补不出来。
- 天赋树截图不是抓官方页面的图，是本机 `capture_passive_trees.js` 打开官方天赋树页面
  截图后传 OSS，由 `poe1_preserve_tree_refs.js` 回填引用。

### 通货：两份产物，口径不同，不要混用

| 产物 | 来源 | 计价单位 | 小程序是否在用 |
|---|---|---|---|
| `economy_digest.json` | poe.ninja 国际服 `https://poe.ninja/poe1/api/economy/exchange/current/overview?league=Allflame&type=Currency\|Fragment\|Essence\|Oil`，先经 `/poe1/api/data/index-state` 取联盟 | 混沌石 | **在用**（首页换算、行情页、关注页） |
| `cn_economy_digest.json` | DD373 国服报价 `https://www.dd373.com/s-49pbxm-c-{编码}-q2ahdc-4mnkb0.html` + FilterEditor 物价榜 `https://api.filtereditor.cn/prod/system/getPriceJson?id=2` + `base-data/poe1/cn_economy_manual.json` 人工校准 | **米粒**（与 POE2 国服行情同口径） | 前端暂无引用 |

- 通货图标用 `https://web.poecdn.com{path}`；poe.ninja 自己的 `gen/image` 外链已整体 404。
- poe.ninja 的 `league` 参数要用 index-state 里的 `name`（`Allflame`），用小写 `allflame`
  会返回 200 但 `lines: 0`，属于"成功但空"的坑。
- FilterEditor 接口 2026-10-04 实测返回 503，管线对此有降级（只保留 DD373 与人工词条）。
- 通货中文名走 `crawlers/shared/officialDict.js` 的 1375 条官方译名字典，
  字典没有的名称保留英文，禁止逐词硬造译名。

## 输出与发布

```text
translated-data/poe1/{dev|release}/miniprogram_data/
├── ladder_digest.json          天梯与 BD
├── economy_digest.json         国际服通货（混沌计价）
├── cn_economy_digest.json      国服通货（米粒计价）
├── currency_daily_change.json  按日快照算出的较昨日涨跌
└── manifest.json
```

上传走 `scripts/upload_poe1_to_oss.js`，双写 `poe1-season/{env}/` 与 `poe1/{env}/`。
**不能使用 POE2 的 `auto_browser/upload_to_oss.js`**，那是 POE2 整个目录的上传入口。
上传默认跳过"内容未变"的文件；怀疑线上缺文件时用 `OSS_FORCE_FULL_UPLOAD=1` 回到全量。

## 命令

```bash
npm run poe1:ladder      # 天梯 + BD 详情
npm run poe1:economy     # 国际服通货
npm run poe1:economy:cn  # 国服通货（DD373 + FilterEditor）
npm run poe1:publish     # 全链路（含日快照与 manifest）+ 上传
```

## 自动更新

`.github/workflows/update_poe1_season.yml` 每两小时刷新并上传一次；
本地 Dashboard（5177）的「POE1 全量更新」链路与之等价，额外包含
`poe1_currency_daily_change`（按日快照）。两种方式写入相同的 POE1 专用 OSS 路径。

发布前至少检查：赛季名非空且与官方页面一致、天梯样本与展示角色非空、经济条目非空、
`updatedAt` 已刷新、神圣石/混沌石换算存在、`currency_daily_change` 的 `coreChangeCount > 0`。
