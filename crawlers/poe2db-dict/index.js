#!/usr/bin/env node
/**
 * poe2db.tw/cn 翻译字典自动爬虫
 * 从 poe2db 中文站抓取物品名、技能名、传奇物品的中英对照
 * 输出到 base-data/dist/ 目录，替代手动维护的翻译字典
 * 
 * 用法:
 *   node crawlers/poe2db-dict/index.js          # 抓取所有字典
 *   node crawlers/poe2db-dict/index.js --gems   # 只抓取技能宝石
 *   node crawlers/poe2db-dict/index.js --items  # 只抓取基础物品
 *   node crawlers/poe2db-dict/index.js --unique # 只抓取传奇物品
 */

const { crawlBaseItems } = require('./crawl_base_items');
const { crawlGems } = require('./crawl_gems');
const { crawlUniques } = require('./crawl_uniques');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../../base-data/dist');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const args = process.argv.slice(2);
const flags = {
  gems: args.includes('--gems'),
  items: args.includes('--items'),
  unique: args.includes('--unique'),
};

// 如果没有指定任何标志，默认全部抓取
const runAll = !flags.gems && !flags.items && !flags.unique;

async function main() {
  console.log('🔧 poe2db.tw/cn 翻译字典爬虫');
  console.log(`   输出目录: ${OUTPUT_DIR}`);
  console.log('');

  const startTime = Date.now();

  try {
    // 1. 基础物品字典
    if (runAll || flags.items) {
      console.log('━'.repeat(50));
      console.log('📦 抓取基础物品翻译...');
      console.log('━'.repeat(50));
      const baseDict = await crawlBaseItems();
      const basePath = path.join(OUTPUT_DIR, 'dict_base.json');
      fs.writeFileSync(basePath, JSON.stringify(baseDict, null, 0));
      console.log(`   ✅ dict_base.json: ${Object.keys(baseDict).length} 条\n`);
    }

    // 2. 技能宝石字典
    if (runAll || flags.gems) {
      console.log('━'.repeat(50));
      console.log('💎 抓取技能宝石翻译...');
      console.log('━'.repeat(50));
      const gemDict = await crawlGems();
      const gemPath = path.join(OUTPUT_DIR, 'dict_gem.json');
      fs.writeFileSync(gemPath, JSON.stringify(gemDict, null, 0));
      console.log(`   ✅ dict_gem.json: ${Object.keys(gemDict).length} 条\n`);
    }

    // 3. 传奇物品字典
    if (runAll || flags.unique) {
      console.log('━'.repeat(50));
      console.log('⭐ 抓取传奇物品翻译...');
      console.log('━'.repeat(50));
      const uniqueDict = await crawlUniques();
      const uniquePath = path.join(OUTPUT_DIR, 'dict_unique.json');
      fs.writeFileSync(uniquePath, JSON.stringify(uniqueDict, null, 0));
      console.log(`   ✅ dict_unique.json: ${Object.keys(uniqueDict).length} 条\n`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 字典爬虫完成！耗时: ${elapsed}s`);

  } catch (err) {
    console.error('❌ 字典爬虫失败:', err.message);
    process.exit(1);
  }
}

// 导出供外部调用
module.exports = { main };

// 直接运行
if (require.main === module) {
  main();
}
