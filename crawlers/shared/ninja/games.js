/**
 * poe.ninja 两个游戏的差异配置。
 *
 * 接口形状实测一致（见 docs/POE1_DATA_PIPELINE.md 的「poe.ninja builds 接入」），
 * 差异只有：接口前缀、经济分类表、默认联赛兜底。新增游戏只改这里，
 * 不要把 poe.ninja 的 URL 散回各爬虫文件。
 */

const GAMES = {
  poe1: {
    id: 'poe1',
    label: '流放之路',
    apiBase: 'https://poe.ninja/poe1/api',
    buildsPage: 'https://poe.ninja/poe1/builds',
    // poe1 的经济分类是单数（crawlers/poe1/economy_digest.js 实测）
    economyTypes: [
      { type: 'Currency', name: '通货' },
      { type: 'Fragment', name: '碎片' },
      { type: 'Essence', name: '精华' },
      { type: 'Oil', name: '圣油' }
    ],
    // 只在 index-state 读不到时兜底
    fallbackLeague: 'allflame',
    // 职业名单要显式维护：榜单里的职业列是 NDIC 字典下标（字典响应不是 protobuf），
    // 而 poe.ninja 页面已改成客户端渲染、抓不到 class 链接了。
    // 来源：国服官方天梯 classNames（实测与 poe.ninja 的职业名一致）。
    classes: ['Deadeye','Chieftain','Juggernaut','Reliquarian','Elementalist','Ascendant','Hierophant','Slayer','Occultist','Champion','Guardian','Berserker','Necromancer','Assassin','Pathfinder','Inquisitor','Gladiator','Warden']
  },
  poe2: {
    id: 'poe2',
    label: '流放之路2',
    apiBase: 'https://poe.ninja/poe2/api',
    buildsPage: 'https://poe.ninja/poe2/builds',
    // poe2 的经济分类是复数，与 crawlers/economy/ninja_digest.js 的 ECONOMY_TYPES 保持一致
    economyTypes: [
      { type: 'Currency', name: '通货' },
      { type: 'Runes', name: '符文' },
      { type: 'Verisium', name: '合金' },
      { type: 'LineageSupportGems', name: '族裔辅助宝石' },
      { type: 'Fragments', name: '终局门票' },
      { type: 'UncutGems', name: '未切割宝石' },
      { type: 'Essences', name: '精华' },
      { type: 'Ritual', name: '预兆' },
      { type: 'Expedition', name: '探险' },
      { type: 'Abyss', name: '深渊骨骸' },
      { type: 'SoulCores', name: '灵魂核心' },
      { type: 'Breach', name: '裂隙催化剂' }
    ],
    fallbackLeague: 'forbiddenrites',
    // 来源：现有 all_ladders_translated.json 的 ladders 键（即线上天梯正在展示的那 31 个职业）
    classes: ['Gemling Legionnaire','Martial Artist','Disciple of Varashta','Spirit Walker','Oracle','Deadeye','Infernalist','Stormweaver','Titan','Blood Mage','Acolyte of Chayula','Ritualist','Lich','Tactician','Witchhunter','Shaman','Pathfinder','Chronomancer','Abyssal Lich','Smith of Kitava','Warbringer','Amazon','Invoker','Witch','Mercenary','Huntress','Sorceress','Monk','Warrior','Ranger','Druid']
  }
}

const getGame = gameId => {
  const game = GAMES[gameId]
  if (!game) throw new Error(`未知的 poe.ninja 游戏: ${gameId}`)
  return game
}

module.exports = { GAMES, getGame }
