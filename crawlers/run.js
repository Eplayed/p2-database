#!/usr/bin/env node
/**
 * 新版统一爬虫入口
 * 整合 poe2db 字典爬虫 + poe.ninja 天梯爬虫 + OSS 上传
 * 
 * 用法:
 *   node crawlers/run.js                    # 运行天梯爬虫 + 上传
 *   node crawlers/run.js --dict             # 只更新翻译字典
 *   node crawlers/run.js --ladder           # 只运行天梯爬虫
 *   node crawlers/run.js --all              # 字典 + 天梯 + 上传
 *   node crawlers/run.js --dict --ladder    # 字典 + 天梯（不上传）
 */

require('dotenv').config({ path: require('path').join(__dirname, '../auto_browser/.env') });

const args = process.argv.slice(2);
const flags = {
  dict: args.includes('--dict'),
  ladder: args.includes('--ladder'),
  upload: args.includes('--upload'),
  all: args.includes('--all'),
  help: args.includes('--help'),
};

if (flags.help) {
  console.log(`
🔧 PoE2 数据爬虫 v2.0 (纯 HTTP 版)

用法: node crawlers/run.js [选项]

选项:
  --dict      更新翻译字典 (从 poe2db.tw/cn 抓取)
  --ladder    运行天梯爬虫 (从 poe.ninja API 获取)
  --upload    上传数据到 OSS
  --all       运行全部 (字典 + 天梯 + 上传)
  --help      显示帮助

默认行为 (无参数): 运行天梯爬虫 + 上传

示例:
  node crawlers/run.js --all              # 完整流程
  node crawlers/run.js --dict             # 只更新字典
  NODE_ENV=dev node crawlers/run.js       # 开发模式
  `);
  process.exit(0);
}

// 默认行为：天梯 + 上传
if (!flags.dict && !flags.ladder && !flags.upload && !flags.all) {
  flags.ladder = true;
  flags.upload = true;
}

if (flags.all) {
  flags.dict = true;
  flags.ladder = true;
  flags.upload = true;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  PoE2 数据爬虫 v2.0 (纯 HTTP, 无 Puppeteer)');
  console.log('═'.repeat(60));
  console.log(`  环境: ${process.env.NODE_ENV || 'dev'}`);
  console.log(`  任务: ${[
    flags.dict && '字典更新',
    flags.ladder && '天梯爬虫',
    flags.upload && 'OSS上传',
  ].filter(Boolean).join(' → ')}`);
  console.log('═'.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    // Step 1: 更新翻译字典
    if (flags.dict) {
      console.log('\n' + '━'.repeat(60));
      console.log('📚 Step 1: 更新翻译字典 (poe2db.tw/cn)');
      console.log('━'.repeat(60));
      const { main: runDict } = require('./poe2db-dict/index');
      await runDict();
    }

    // Step 2: 天梯爬虫
    if (flags.ladder) {
      console.log('\n' + '━'.repeat(60));
      console.log('🏆 Step 2: 天梯爬虫 (poe.ninja API)');
      console.log('━'.repeat(60));
      const { runTask } = require('./ninja-ladder/index');
      await runTask();
    }

    // Step 3: 上传 OSS
    if (flags.upload) {
      console.log('\n' + '━'.repeat(60));
      console.log('☁️  Step 3: 上传到 OSS');
      console.log('━'.repeat(60));
      const uploadAll = require('../auto_browser/upload_to_oss');
      await uploadAll();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ✅ 全部完成！总耗时: ${elapsed}s`);
    console.log('═'.repeat(60));

  } catch (err) {
    console.error('\n❌ 执行失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
