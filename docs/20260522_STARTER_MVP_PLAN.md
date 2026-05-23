# 0.5 开荒 BD 推荐 MVP 工作计划

## 目标

- 先用人工精选数据上线第一版，避免赛季未开服时把未验证的社区内容误当推荐。
- 输出小程序可直接读取的 `miniprogram_data/starters.json`。
- 后续 0.5 天梯稳定后，再用 `ladder_analysis.json` 给每条 BD 增加热度和验证信号。

## 数据分层

1. `base-data/starter/starter_builds.json`
   - 人工审核源数据。
   - 每条必须包含职业、升华、标题、评分、优缺点、升级提示、装备优先级和来源说明。
2. `translated-data/{env}/ladder_analysis.json`
   - 作为热度增强数据。
   - MVP 只读取职业/升华分布，不影响人工排序的主体判断。
3. 社区/踩蘑菇候选
   - 暂不自动发布到开荒推荐。
   - 后续可生成候选池，人工确认后再写回第一层。

## 已完成

- [x] 新增人工精选源数据 `base-data/starter/starter_builds.json`
- [x] 新增生成脚本 `crawlers/starter/index.js`
- [x] 新增命令 `npm run build:starter` 和 `npm run build:starter:dev`
- [x] 输出 `translated-data/{env}/miniprogram_data/starters.json`

## 后续

- [ ] 开服后根据真实 0.5 天梯数据调整 tier 和评分。
- [ ] 增加社区候选抓取和人工审核列表。
- [ ] 如果有稳定 BD 详情页来源，补充外部链接和技能阶段版本。
