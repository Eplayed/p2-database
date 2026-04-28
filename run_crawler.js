#!/usr/bin/env node
/**
 * 统一爬虫入口脚本
 * 整合 p2-database 和 crawl_economy 的所有爬虫功能
 *
 * 用法:
 *   node run_crawler.js --all           # 运行所有爬虫
 *   node run_crawler.js --essence       # 只运行精华帖爬虫
 *   node run_crawler.js --hot           # 只运行热门BD爬虫
 *   node run_crawler.js --translate      # 只运行翻译爬虫
 */

require('dotenv').config({ path: __dirname + '/auto_browser/.env' });

const fs = require('fs');
const path = require('path');

// 解析命令行参数
const args = process.argv.slice(2);
const flags = {
  all: args.includes('--all') || args.includes('-a'),
  essence: args.includes('--essence') || args.includes('-e'),
  hot: args.includes('--hot') || args.includes('-h'),
  translate: args.includes('--translate') || args.includes('-t'),
  help: args.includes('--help') || args.includes('-h')
};

function printHelp() {
  console.log(`
🔧 统一爬虫入口脚本

用法: node run_crawler.js [选项]

选项:
  --all, -a      运行所有爬虫
  --essence, -e  只运行精华帖爬虫
  --hot, -h      只运行热门BD爬虫
  --translate, -t 只运行翻译爬虫
  --help         显示帮助

示例:
  node run_crawler.js --all
  node run_crawler.js --essence --hot
  `);
  process.exit(0);
}

if (flags.help) {
  printHelp();
}

// 如果没有指定任何标志，默认运行所有
if (!flags.essence && !flags.hot && !flags.translate) {
  flags.all = true;
}

async function runEssenceCrawler() {
  console.log('\n' + '='.repeat(50));
  console.log('📜 踩蘑菇精华帖爬虫');
  console.log('='.repeat(50));

  try {
    const { crawlEssencePosts } = require('./auto_browser/crawl_caimogu_essence_full');
    const result = await crawlEssencePosts();
    console.log(`✅ 精华帖爬虫完成: ${result.length} 条数据`);
    return result;
  } catch (e) {
    console.error('❌ 精华帖爬虫失败:', e.message);
    return [];
  }
}

async function runHotBuildsCrawler() {
  console.log('\n' + '='.repeat(50));
  console.log('🔥 热门BD爬虫');
  console.log('='.repeat(50));

  try {
    const { crawlHotBuilds } = require('./auto_browser/crawl_hot_builds');
    const result = await crawlHotBuilds();
    console.log(`✅ 热门BD爬虫完成`);
    return result;
  } catch (e) {
    console.error('❌ 热门BD爬虫失败:', e.message);
    return null;
  }
}

async function runTranslateCrawler() {
  console.log('\n' + '='.repeat(50));
  console.log('🌐 翻译爬虫 (poe.ninja)');
  console.log('='.repeat(50));

  try {
    const runTranslate = require('./run_translate_crawler');
    await runTranslate();
    console.log('✅ 翻译爬虫完成');
  } catch (e) {
    console.error('❌ 翻译爬虫失败:', e.message);
  }
}

async function transformEssenceData() {
  console.log('\n' + '='.repeat(50));
  console.log('🔄 转换精华帖数据格式');
  console.log('='.repeat(50));

  try {
    const transform = require('./auto_browser/transform_caimogu_data');
    await transform();
    console.log('✅ 数据转换完成');
  } catch (e) {
    console.error('❌ 数据转换失败:', e.message);
  }
}

async function main() {
  console.log('\n' + '═'.repeat(50));
  console.log('🚀 P2-Database 统一爬虫启动');
  console.log('═'.repeat(50));
  console.log(`⏰ ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log('');

  const startTime = Date.now();
  const results = {};

  try {
    // 1. 运行翻译爬虫
    if (flags.all || flags.translate) {
      await runTranslateCrawler();
    }

    // 2. 运行热门BD爬虫
    if (flags.all || flags.hot) {
      await runHotBuildsCrawler();
    }

    // 3. 运行精华帖爬虫
    if (flags.all || flags.essence) {
      await runEssenceCrawler();

      // 4. 转换数据格式
      await transformEssenceData();
    }

    // 总结
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '═'.repeat(50));
    console.log('✅ 所有爬虫任务完成');
    console.log(`⏱️ 总耗时: ${elapsed}s`);
    console.log('═'.repeat(50));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ 爬虫执行失败:', error);
    process.exit(1);
  }
}

main();
