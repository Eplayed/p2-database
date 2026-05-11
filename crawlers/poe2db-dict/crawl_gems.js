/**
 * 抓取 poe2db.tw/cn 技能宝石翻译
 * 包括主动技能和辅助宝石
 */

const { fetchWithRetry } = require('./http_client');
const { parseGems } = require('./parser');

const BASE_URL = 'https://poe2db.tw/cn';

// 技能宝石页面
const GEM_PAGES = [
  { slug: 'Support_Gems', name: '辅助宝石' },
  { slug: 'Uncut_Skill_Gem', name: '技能宝石(总览)' },
  // 各职业/武器类型的技能宝石页面
  { slug: 'Bows', name: '弓类技能' },
  { slug: 'Crossbows', name: '战弩技能' },
  { slug: 'One_Hand_Swords', name: '单手剑技能' },
  { slug: 'Two_Hand_Swords', name: '双手剑技能' },
  { slug: 'One_Hand_Maces', name: '单手锤技能' },
  { slug: 'Two_Hand_Maces', name: '双手锤技能' },
  { slug: 'Daggers', name: '匕首技能' },
  { slug: 'Staves', name: '长杖技能' },
  { slug: 'Quarterstaves', name: '节杖技能' },
  { slug: 'Spears', name: '战矛技能' },
  { slug: 'Flails', name: '连枷技能' },
];

/**
 * 从 poe2db 的技能宝石页面提取中英对照
 * 辅助宝石页面数据最全，包含 526+ 辅助宝石
 */
async function crawlGems() {
  const allGems = {};

  for (const page of GEM_PAGES) {
    const url = `${BASE_URL}/${page.slug}`;
    console.log(`   💎 ${page.name} (${page.slug})...`);

    try {
      const html = await fetchWithRetry(url);
      const gems = parseGems(html);
      const count = Object.keys(gems).length;

      // 合并，不覆盖已有的（优先保留先抓到的）
      for (const [en, cn] of Object.entries(gems)) {
        if (!allGems[en]) {
          allGems[en] = cn;
        }
      }
      console.log(`      → ${count} 条`);
    } catch (err) {
      console.warn(`      ⚠️ 失败: ${err.message}`);
    }
  }

  // 过滤掉明显不是技能/宝石名的条目
  const filtered = {};
  for (const [en, cn] of Object.entries(allGems)) {
    // 技能名通常 2-4 个单词，不会太长
    if (en.split(' ').length <= 6 && en.length <= 40) {
      filtered[en] = cn;
    }
  }

  console.log(`   📊 技能宝石总计: ${Object.keys(filtered).length} 条`);
  return filtered;
}

module.exports = { crawlGems };
