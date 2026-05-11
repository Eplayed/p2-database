/**
 * 抓取 poe2db.tw/cn 传奇物品翻译
 * 传奇物品在各物品类别页面的 "传奇" 区块中
 */

const { fetchWithRetry } = require('./http_client');
const { parseUniques } = require('./parser');

const BASE_URL = 'https://poe2db.tw/cn';

// 传奇物品分布在各类别页面中
const UNIQUE_PAGES = [
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
  { slug: 'Body_Armours', name: '胸甲' },
  { slug: 'Helmets', name: '头盔' },
  { slug: 'Gloves', name: '手套' },
  { slug: 'Boots', name: '靴子' },
  { slug: 'Shields', name: '盾牌' },
  { slug: 'Bucklers', name: '小圆盾' },
  { slug: 'Amulets', name: '护身符' },
  { slug: 'Rings', name: '戒指' },
  { slug: 'Belts', name: '腰带' },
  { slug: 'Quivers', name: '箭袋' },
  { slug: 'Foci', name: '法器' },
  { slug: 'Flasks', name: '药剂' },
];

/**
 * 抓取所有传奇物品的中英对照
 * @returns {Object} { "Widowhail": { cn: "遗孀之雹", base: "粗制弓", full: "遗孀之雹 粗制弓" }, ... }
 */
async function crawlUniques() {
  const allUniques = {};

  for (const page of UNIQUE_PAGES) {
    const url = `${BASE_URL}/${page.slug}`;
    console.log(`   ⭐ ${page.name} (${page.slug})...`);

    try {
      const html = await fetchWithRetry(url);
      const uniques = parseUniques(html);
      const count = Object.keys(uniques).length;

      Object.assign(allUniques, uniques);
      if (count > 0) {
        console.log(`      → ${count} 条传奇`);
      }
    } catch (err) {
      console.warn(`      ⚠️ 失败: ${err.message}`);
    }
  }

  console.log(`   📊 传奇物品总计: ${Object.keys(allUniques).length} 条`);
  return allUniques;
}

module.exports = { crawlUniques };
