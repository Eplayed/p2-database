/**
 * POE2 poe.ninja 赛季 slug 集中配置 —— 赛季切换的唯一改动点
 *
 * poe.ninja 的 league 标识有两套（见 https://poe.ninja/poe2/api/data/index-state）：
 *   - urlSlug:      economyLeagues[].url 与 snapshotVersions[].url（当前 'runesofaldur'）
 *   - snapshotName: snapshotVersions[].snapshotName（当前 'runes-of-aldur'，
 *                   用作 builds API 的 overview 参数）
 *
 * 赛季切换步骤（如 0.5.5 Forbidden Rites，2026-09-04 上线）：
 *   1. 打开 index-state 接口，找新联赛的 url 和 snapshotName
 *   2. 改下面 CURRENT 两个字段，或用环境变量覆盖（不改代码）：
 *        POE_NINJA_LEAGUE_URL      → urlSlug
 *        POE_NINJA_LEAGUE_SNAPSHOT → snapshotName
 *      （旧变量 POE_NINJA_ECONOMY_LEAGUE / POE_NINJA_LEAGUE 继续兼容）
 *   3. 重跑数据管线
 *
 * 兜底：主管线（auto_browser/translate_crawler、crawlers/economy/ninja_digest）
 * 在 slug 未命中 index-state 时，会自动回退到第一个 indexed 且非硬核的联赛，
 * 所以新赛季上线当天即使忘了改这里，数据也会自动跟到新联赛（但仍建议显式切换）。
 */
const CURRENT = {
  // poe.ninja league url slug（economy 请求与 builds 页面路径通用）
  urlSlug: process.env.POE_NINJA_LEAGUE_URL
    || process.env.POE_NINJA_ECONOMY_LEAGUE
    || process.env.POE_NINJA_LEAGUE
    || 'forbiddenrites',
  // builds API overview 参数 / snapshot 名
  snapshotName: process.env.POE_NINJA_LEAGUE_SNAPSHOT || 'forbidden-rites',
};

module.exports = CURRENT;
