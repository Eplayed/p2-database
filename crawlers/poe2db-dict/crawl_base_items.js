/**
 * 抓取 poe2db.tw/cn 基础物品翻译
 * 覆盖所有武器、防具、饰品类型
 */

const { fetchWithRetry } = require('./http_client');
const { parseBaseItems } = require('./parser');

const BASE_URL = 'https://poe2db.tw/cn';

// 所有需要抓取的物品类别页面
const ITEM_CATEGORIES = [
  // 武器
  { slug: 'Bows', name: '弓' },
  { slug: 'Crossbows', name: '战弩' },
  { slug: 'One_Hand_Swords', name: '单手剑' },
  { slug: 'Two_Hand_Swords', name: '双手剑' },
  { slug: 'One_Hand_Axes', name: '单手斧' },
  { slug: 'Two_Hand_Axes', name: '双手斧' },
  { slug: 'One_Hand_Maces', name: '单手锤' },
  { slug: 'Two_Hand_Maces', name: '双手锤' },
  { slug: 'Daggers', name: '匕首' },
  { slug: 'Claws', name: '爪' },
  { slug: 'Wands', name: '法杖' },
  { slug: 'Sceptres', name: '权杖' },
  { slug: 'Staves', name: '长杖' },
  { slug: 'Quarterstaves', name: '节杖' },
  { slug: 'Spears', name: '战矛' },
  { slug: 'Flails', name: '连枷' },
  // 防具
  { slug: 'Body_Armours', name: '胸甲' },
  { slug: 'Helmets', name: '头盔' },
  { slug: 'Gloves', name: '手套' },
  { slug: 'Boots', name: '靴子' },
  { slug: 'Shields', name: '盾牌' },
  { slug: 'Bucklers', name: '小圆盾' },
  // 饰品
  { slug: 'Amulets', name: '护身符' },
  { slug: 'Rings', name: '戒指' },
  { slug: 'Belts', name: '腰带' },
  { slug: 'Quivers', name: '箭袋' },
  // 其他
  { slug: 'Foci', name: '法器' },
  { slug: 'Charms', name: '咒符' },
  { slug: 'Flasks', name: '药剂' },
];

/**
 * 抓取所有基础物品的中英对照
 * @returns {Object} { "Crude Bow": "粗制弓", ... }
 */
async function crawlBaseItems() {
  const allItems = {};
  let totalCount = 0;

  for (const category of ITEM_CATEGORIES) {
    const url = `${BASE_URL}/${category.slug}`;
    console.log(`   📋 ${category.name} (${category.slug})...`);

    try {
      const html = await fetchWithRetry(url);
      const items = parseBaseItems(html);
      const count = Object.keys(items).length;
      
      Object.assign(allItems, items);
      totalCount += count;
      console.log(`      → ${count} 条`);
    } catch (err) {
      console.warn(`      ⚠️ 失败: ${err.message}`);
    }
  }

  console.log(`   📊 基础物品总计: ${Object.keys(allItems).length} 条`);
  return allItems;
}

module.exports = { crawlBaseItems };
