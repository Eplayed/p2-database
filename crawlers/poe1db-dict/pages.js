/**
 * 流亡编年史（poedb.tw/cn，流放之路 1 的中文站）页面清单。
 *
 * 为什么用这个站：项目约定"新英文残留优先补权威中文映射，不能猜译"。
 * 这个站是流放1 的中文资料站，页面里同时带英文名（链接 slug）和国服中文名，
 * 和流放2 用的 poe2db.tw 是同一套程序，所以解析器可以直接复用。
 *
 * 列表按类别分组，抓取失败（404 或改版）只跳过该页并记录，不影响整份字典。
 */

const BASE_URL = 'https://poedb.tw/cn'

const GEM_PAGES = [
  { slug: 'Skill_Gems', name: '技能宝石' },
  { slug: 'Support_Gems', name: '辅助宝石' }
]

const UNIQUE_PAGES = [
  { slug: 'Unique_item', name: '传奇物品总表' }
]

const BASE_ITEM_PAGES = [
  // 防具与饰品
  { slug: 'Body_Armours', name: '胸甲' },
  { slug: 'Helmets', name: '头盔' },
  { slug: 'Gloves', name: '手套' },
  { slug: 'Boots', name: '鞋子' },
  { slug: 'Shields', name: '盾牌' },
  { slug: 'Belts', name: '腰带' },
  { slug: 'Amulets', name: '项链' },
  { slug: 'Rings', name: '戒指' },
  { slug: 'Flasks', name: '药剂' },
  { slug: 'Quivers', name: '箭袋' },
  { slug: 'Jewels', name: '珠宝' },
  // 武器
  { slug: 'One_Hand_Swords', name: '单手剑' },
  { slug: 'Two_Hand_Swords', name: '双手剑' },
  { slug: 'One_Hand_Maces', name: '单手锤' },
  { slug: 'Two_Hand_Maces', name: '双手锤' },
  { slug: 'One_Hand_Axes', name: '单手斧' },
  { slug: 'Two_Hand_Axes', name: '双手斧' },
  { slug: 'Bows', name: '弓' },
  { slug: 'Staves', name: '长杖' },
  { slug: 'Claws', name: '爪' },
  { slug: 'Daggers', name: '匕首' },
  { slug: 'Wands', name: '法杖' }
]

module.exports = { BASE_URL, GEM_PAGES, UNIQUE_PAGES, BASE_ITEM_PAGES }
